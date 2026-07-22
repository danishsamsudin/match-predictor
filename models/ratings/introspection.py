"""
Extract and diff GLPM nested model weights for league-run reporting.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
from sklearn.linear_model import BayesianRidge

from engine.config import DEFAULT_INTERACTION_WEIGHTS, XgEngineConfig
from models.ratings.feature_explanations import (
    CONTEXT_FEATURE_NAMES,
    explain_feature,
    explain_weight_change,
)
from models.ratings.scale import GlpmCalibrator

REPO_ROOT = Path(__file__).resolve().parents[2]

ENGINE_DIRS: dict[str, dict[str, str]] = {
    "attack": {"dir": "attack", "joblib": "attack_models.joblib", "label": "Attack"},
    "defence": {"dir": "defence", "joblib": "defence_models.joblib", "label": "Defence"},
    "goalkeeper": {"dir": "goalkeeper", "joblib": "goalkeeper_models.joblib", "label": "Goalkeeper"},
    "build_up": {"dir": "build_up", "joblib": "build_up_models.joblib", "label": "Build-Up"},
    "possession": {"dir": "possession", "joblib": "possession_models.joblib", "label": "Possession"},
    "pressing": {"dir": "pressing", "joblib": "pressing_models.joblib", "label": "Pressing"},
    "finishing": {"dir": "finishing", "joblib": "finishing_models.joblib", "label": "Finishing"},
}

CONTEXT_SUFFIXES = ("home_flag", "rest_days_centered", "congestion")


@dataclass
class VariableRecord:
    engine: str
    layer: str
    model: str
    variable: str
    before: Optional[float]
    after: float
    delta: Optional[float]
    delta_pct: Optional[float]
    estimator: str
    label: str
    meaning: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class IntrospectionResult:
    season_id: int
    is_first_run: bool
    engines: dict[str, Any] = field(default_factory=dict)
    xg_engine: dict[str, Any] = field(default_factory=dict)
    variables: list[VariableRecord] = field(default_factory=list)
    team_ratings: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    team_rating_changes: list[dict[str, Any]] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "season_id": self.season_id,
            "is_first_run": self.is_first_run,
            "engines": self.engines,
            "xg_engine": self.xg_engine,
            "variables": [v.to_dict() for v in self.variables],
            "team_ratings": self.team_ratings,
            "team_rating_changes": self.team_rating_changes,
            "summary": self.summary,
        }


def _estimator_name(est: Any) -> str:
    if est is None:
        return "none"
    cls = type(est).__name__
    if "LGBM" in cls:
        return "LightGBM"
    if cls == "BayesianRidge":
        return "BayesianRidge"
    if cls == "Ridge":
        return "Ridge"
    return cls


def _extract_weights(estimator: Any, feature_names: list[str]) -> dict[str, float]:
    if estimator is None:
        return {}
    if hasattr(estimator, "feature_importances_"):
        vals = np.asarray(estimator.feature_importances_, dtype=float)
        names = feature_names[: len(vals)]
        return {n: float(v) for n, v in zip(names, vals)}
    if hasattr(estimator, "coef_"):
        coef = np.asarray(estimator.coef_, dtype=float).ravel()
        names = feature_names[: len(coef)]
        return {n: float(v) for n, v in zip(names, coef)}
    return {}


def _feature_names_for_component(model: Any) -> list[str]:
    cols = list(getattr(model, "feature_cols", []) or [])
    present = [c for c in cols if c]
    return present if present else cols


def _feature_names_for_domain(model: Any) -> list[str]:
    return list(getattr(model, "component_cols", []) or [])


def _feature_names_for_primary(model: Any) -> list[str]:
    mod = type(model)
    if hasattr(mod, "__module__"):
        pass
    # primary stores DOMAIN_INPUT_COLS on class in each domain module
    for attr in ("DOMAIN_INPUT_COLS",):
        if hasattr(model, attr):
            return list(getattr(model, attr))
    # fallback: infer from primary module
    import importlib

    primary_mod = importlib.import_module(type(model).__module__)
    if hasattr(primary_mod, "DOMAIN_INPUT_COLS"):
        return list(primary_mod.DOMAIN_INPUT_COLS)
    return []


def _calibrator_summary(cal: GlpmCalibrator) -> dict[str, float]:
    arr = np.asarray(cal.reference_scores, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {}
    return {
        "n": float(arr.size),
        "min": float(np.min(arr)),
        "p25": float(np.percentile(arr, 25)),
        "median": float(np.median(arr)),
        "p75": float(np.percentile(arr, 75)),
        "max": float(np.max(arr)),
    }


def _load_calibrators(artifact_dir: Path) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    if not artifact_dir.exists():
        return out
    for path in sorted(artifact_dir.glob("calibrator_*.json")):
        name = path.stem.replace("calibrator_", "")
        cal = GlpmCalibrator.load(path)
        summary = _calibrator_summary(cal)
        for stat, val in summary.items():
            out[f"calibrator_{name}.{stat}"] = val
    return out


def _extract_adjuster(adjuster: Any) -> dict[str, float]:
    weights: dict[str, float] = {}
    if adjuster is None:
        return weights
    for attr in ("league_def_mean", "league_att_mean", "league_xga_mean"):
        if hasattr(adjuster, attr):
            val = getattr(adjuster, attr)
            if val is not None and np.isfinite(float(val)):
                weights[attr] = float(val)
    coefs = getattr(adjuster, "context_coefs", {}) or {}
    intercepts = getattr(adjuster, "context_intercepts", {}) or {}
    for feat, coef_arr in coefs.items():
        arr = np.asarray(coef_arr, dtype=float).ravel()
        for i, ctx_name in enumerate(CONTEXT_FEATURE_NAMES):
            if i < len(arr):
                weights[f"context.{feat}.{ctx_name}"] = float(arr[i])
        if feat in intercepts:
            weights[f"context.{feat}.intercept"] = float(intercepts[feat])
    return weights


def _extract_engine_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "model_version": bundle.get("model_version"),
        "layers": {},
    }
    weights_flat: dict[str, float] = {}

    adjuster = bundle.get("adjuster")
    adj_w = _extract_adjuster(adjuster)
    meta["layers"]["context_adjuster"] = {
        "estimator": "Ridge (per feature)",
        "variables": adj_w,
    }
    weights_flat.update({f"context_adjuster.{k}": v for k, v in adj_w.items()})

    components = getattr(bundle.get("components"), "models", {}) or {}
    comp_layer: dict[str, Any] = {}
    for name, model in components.items():
        feat_names = _feature_names_for_component(model)
        est = getattr(model, "estimator", None)
        w = _extract_weights(est, feat_names)
        comp_layer[name] = {
            "target": getattr(model, "target_col", None),
            "estimator": _estimator_name(est),
            "variables": w,
        }
        for k, v in w.items():
            weights_flat[f"component.{name}.{k}"] = v
    meta["layers"]["components"] = comp_layer

    domains = getattr(bundle.get("domains"), "models", {}) or {}
    dom_layer: dict[str, Any] = {}
    for name, model in domains.items():
        feat_names = _feature_names_for_domain(model)
        est = getattr(model, "estimator", None)
        w = _extract_weights(est, feat_names)
        dom_layer[name] = {
            "target": getattr(model, "target_col", None),
            "estimator": _estimator_name(est),
            "variables": w,
        }
        for k, v in w.items():
            weights_flat[f"domain.{name}.{k}"] = v
    meta["layers"]["domains"] = dom_layer

    primary = bundle.get("primary")
    if primary is not None:
        feat_names = _feature_names_for_primary(primary)
        est = getattr(primary, "estimator", None)
        w = _extract_weights(est, feat_names)
        meta["layers"]["primary"] = {
            "target": getattr(primary, "target_col", None),
            "estimator": _estimator_name(est),
            "variables": w,
        }
        for k, v in w.items():
            weights_flat[f"primary.{k}"] = v

    meta["weights_flat"] = weights_flat
    return meta


def _load_engine(engine_key: str, artifact_root: Path) -> Optional[dict[str, Any]]:
    spec = ENGINE_DIRS[engine_key]
    joblib_path = artifact_root / spec["dir"] / "artifacts" / spec["joblib"]
    if not joblib_path.exists():
        return None
    bundle = joblib.load(joblib_path)
    meta = _extract_engine_bundle(bundle)
    cal_path = artifact_root / spec["dir"] / "artifacts"
    cal_w = _load_calibrators(cal_path)
    meta["layers"]["calibrators"] = cal_w
    for k, v in cal_w.items():
        meta["weights_flat"][f"calibrator.{k}"] = v
    meta["label"] = spec["label"]
    return meta


def _load_team_ratings(engine_key: str, artifact_root: Path) -> list[dict[str, Any]]:
    spec = ENGINE_DIRS[engine_key]
    csv_path = artifact_root / spec["dir"] / "artifacts" / "last_scored_sample.csv"
    if not csv_path.exists():
        return []
    import pandas as pd

    df = pd.read_csv(csv_path)
    if df.empty or "team_sm_id" not in df.columns:
        return []
    rating_cols = [c for c in df.columns if c.startswith("rating_") and "domain" not in c and "comp" not in c]
    if not rating_cols:
        rating_cols = [c for c in df.columns if c.startswith("rating_")]
    if not rating_cols:
        return []
    primary_col = rating_cols[0]
    if "match_date" in df.columns:
        df = df.sort_values(["team_sm_id", "match_date"])
    latest = df.groupby("team_sm_id", as_index=False).tail(1)
    rows = []
    for _, row in latest.iterrows():
        val = row.get(primary_col)
        if val is None or not np.isfinite(float(val)):
            continue
        rows.append(
            {
                "team_sm_id": int(row["team_sm_id"]),
                "rating_col": primary_col,
                "rating": float(val),
            }
        )
    return rows


def _xg_engine_variables() -> dict[str, float]:
    cfg = XgEngineConfig()
    out = {
        "mu": float(cfg.mu),
        "strength_exponent": float(cfg.strength_exponent),
        "rating_center": float(cfg.rating_center),
        "rating_scale": float(cfg.rating_scale),
        "home_advantage": float(cfg.home_advantage),
        "delta_s_cap": float(cfg.delta_s_cap),
    }
    for k, v in cfg.normalized_weights().items():
        out[f"interaction.{k}"] = float(v)
    for k, v in DEFAULT_INTERACTION_WEIGHTS.items():
        out.setdefault(f"interaction.{k}", float(v))
    return out


def _make_variable_records(
    engine_key: str,
    before_engine: Optional[dict[str, Any]],
    after_engine: dict[str, Any],
    is_first_run: bool,
) -> list[VariableRecord]:
    records: list[VariableRecord] = []
    after_flat = after_engine.get("weights_flat") or {}
    before_flat = (before_engine or {}).get("weights_flat") or {}

    all_keys = sorted(set(before_flat) | set(after_flat))
    for key in all_keys:
        after_val = after_flat.get(key)
        if after_val is None:
            continue
        before_val = before_flat.get(key)
        layer, model, var = _parse_flat_key(key)
        estimator = _lookup_estimator(after_engine, layer, model)
        exp = explain_feature(var.split(".")[-1] if "." in var else var)
        delta = None if before_val is None else float(after_val) - float(before_val)
        delta_pct = None
        if before_val is not None and before_val != 0:
            delta_pct = (float(delta) / abs(float(before_val))) * 100.0
        records.append(
            VariableRecord(
                engine=engine_key,
                layer=layer,
                model=model,
                variable=var,
                before=None if before_val is None else float(before_val),
                after=float(after_val),
                delta=delta,
                delta_pct=delta_pct,
                estimator=estimator,
                label=exp.label,
                meaning=exp.what_it_is,
            )
        )
    return records


def _parse_flat_key(key: str) -> tuple[str, str, str]:
    parts = key.split(".")
    if parts[0] == "context_adjuster":
        return "context_adjuster", "all", ".".join(parts[1:])
    if parts[0] in ("component", "domain", "primary"):
        if len(parts) >= 3:
            return parts[0], parts[1], ".".join(parts[2:])
        return parts[0], parts[1] if len(parts) > 1 else "primary", parts[-1]
    if parts[0] == "calibrator":
        return "calibrator", parts[1] if len(parts) > 1 else "primary", ".".join(parts[1:])
    return "other", "all", key


def _lookup_estimator(engine: dict[str, Any], layer: str, model: str) -> str:
    layers = engine.get("layers") or {}
    if layer == "context_adjuster":
        return "Ridge"
    if layer == "calibrator":
        return "EmpiricalPercentile"
    bucket = layers.get(layer.rstrip("s") + "s") if not layer.endswith("s") else layers.get(layer)
    if bucket is None:
        bucket = layers.get(f"{layer}s") if layer in ("component", "domain") else layers.get(layer)
    if isinstance(bucket, dict) and model in bucket:
        return str(bucket[model].get("estimator", "unknown"))
    if layer == "primary" and "primary" in layers:
        return str(layers["primary"].get("estimator", "unknown"))
    return "unknown"


def _diff_team_ratings(
    engine_key: str,
    before_root: Path,
    current_root: Path,
) -> list[dict[str, Any]]:
    before = {
        int(r["team_sm_id"]): float(r["rating"])
        for r in _load_team_ratings(engine_key, before_root)
    }
    after = {
        int(r["team_sm_id"]): float(r["rating"])
        for r in _load_team_ratings(engine_key, current_root)
    }
    changes: list[dict[str, Any]] = []
    for team_id in sorted(set(before) | set(after)):
        b = before.get(team_id)
        a = after.get(team_id)
        if b is None or a is None:
            continue
        delta = a - b
        if abs(delta) < 1e-6:
            continue
        changes.append(
            {
                "engine": engine_key,
                "team_sm_id": team_id,
                "before": b,
                "after": a,
                "delta": delta,
            }
        )
    return changes


def build_introspection(
    *,
    season_id: int,
    current_root: Path,
    before_root: Optional[Path] = None,
) -> IntrospectionResult:
    is_first_run = before_root is None or not before_root.exists()
    result = IntrospectionResult(season_id=season_id, is_first_run=is_first_run)
    all_records: list[VariableRecord] = []

    for engine_key in ENGINE_DIRS:
        after = _load_engine(engine_key, current_root)
        if after is None:
            result.engines[engine_key] = {"missing": True}
            continue
        before = None if is_first_run else _load_engine(engine_key, before_root)
        result.engines[engine_key] = after
        all_records.extend(_make_variable_records(engine_key, before, after, is_first_run))
        result.team_ratings[engine_key] = _load_team_ratings(engine_key, current_root)
        if not is_first_run and before_root is not None:
            result.team_rating_changes.extend(
                _diff_team_ratings(engine_key, before_root, current_root)
            )

    xg_vars = _xg_engine_variables()
    result.xg_engine = {"locked": True, "variables": xg_vars}
    for name, val in xg_vars.items():
        exp = explain_feature(name.replace("interaction.", ""))
        all_records.append(
            VariableRecord(
                engine="xg_engine",
                layer="prediction",
                model="dixon_coles",
                variable=name,
                before=val,
                after=val,
                delta=0.0,
                delta_pct=0.0,
                estimator="FixedConstant",
                label=exp.label,
                meaning=exp.what_it_is + " (locked — not retrained each league run).",
            )
        )

    result.variables = all_records
    changed = [
        v
        for v in all_records
        if v.engine != "xg_engine" and v.delta is not None and abs(v.delta) > 1e-9
    ]
    result.summary = {
        "total_variables": len(all_records),
        "changed_count": len(changed),
        "unchanged_count": len(all_records) - len(changed),
        "team_rating_changes": len(result.team_rating_changes),
        "engines_trained": sum(
            1 for e in result.engines.values() if isinstance(e, dict) and not e.get("missing")
        ),
        "is_first_run": is_first_run,
    }
    return result


def save_introspection(result: IntrospectionResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")


def load_introspection(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

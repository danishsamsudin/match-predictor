#!/usr/bin/env python3
"""
Train hybrid Graham ML weights from ml_training_examples (walk-forward + guardrails).

Usage (from repo root):
  python3 scripts/ml_train_models.py
  python3 scripts/ml_train_models.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import ElasticNet, PoissonRegressor
from sklearn.preprocessing import StandardScaler
from supabase import Client, create_client

REPO_ROOT = Path(__file__).resolve().parents[1]

GRAHAM_FEATURE_KEYS = [
    "delta_xg_elo",
    "delta_talent",
    "delta_tournament",
    "delta_recent_form",
    "delta_fifa",
    "momentum_index",
]

OPTA_FEATURE_KEYS = [
    "chance_index_diff",
    "defensive_solidity_diff",
    "finishing_regression_diff",
    "wc_form_matches_diff",
    "referee_strictness",
    "physicality_index",
    "wide_play_index",
    "lineup_impact_diff",
    "rotation_index_diff",
    "low_block_index_diff",
    "motivation_sigma_diff",
    "host_motivation_boost",
    "stakes_index",
]

PROCESS_FEATURE_KEYS = [
    "chance_quality_diff",
    "set_piece_xg_share_diff",
    "box_xg_share_diff",
    "finishing_skill_diff",
    "pressing_intensity_diff",
]

DELTA_WEIGHT_KEYS = [
    "xgElo",
    "talent",
    "tournament",
    "recentXgForm",
    "fifa",
    "momentum",
]

ML_MIN_TRAINING_EXAMPLES = 30
ML_MIN_NEW_EXAMPLES_SINCE_LAST_TRAIN = 5
ML_WALK_FORWARD_HOLDOUT = 8
SUPABASE_MAX_RETRIES = 6
SUPABASE_BACKOFF_BASE_SEC = 2.0
TRAINING_ROWS_PAGE_SIZE = 500

# Incremental learning: move a small fraction toward the ML target each deploy.
ML_DELTA_BLEND_STEP = 0.08
ML_SCALAR_MAX_REL_STEP = 0.05
ML_FEATURE_MAX_ABS_STEP = 0.025

DEFAULT_CONSTANTS: dict[str, Any] = {
    "muXg": 1.25,
    "strengthExponent": 0.00305,
    "xgEloBaseK": 0.32,
    "momentumGamma": 0.015,
    "momentumClamp": 0.65,
    "setPieceXgBump": 0.15,
    "setPieceRateThreshold": 0.4,
    "deltaWeights": {
        "xgElo": 0.4,
        "talent": 0.2,
        "tournament": 0.15,
        "recentXgForm": 0.1,
        "fifa": 0.1,
        "momentum": 0.05,
    },
    "wcAttackFormWeight": 0.35,
    "wcDefenseFormWeight": 0.35,
    "wcFinishingRegressionWeight": 0.15,
    "wcLineupAttackBlend": 0.35,
    "wcLineupDefenseBlend": 0.35,
    "wcLowEventRhoBoost": 0.025,
    "optaFeatureWeights": {},
    "processFeatureWeights": {},
    "eventModelCoeffs": {
        "yellow": {
            "intercept": 3.6,
            "totalXgSlope": 0.35,
            "knockoutSlope": 0.15,
            "physicalitySlope": 0.4,
            "refereeStrictnessSlope": 0.25,
        },
        "fouls": {
            "intercept": 23.5,
            "totalXgSlope": 0.8,
            "knockoutSlope": 0.5,
            "physicalitySlope": 1.2,
            "refereeStrictnessSlope": 0.1,
        },
        "corners": {
            "intercept": 9.8,
            "totalXgSlope": 0.6,
            "knockoutSlope": -0.2,
            "physicalitySlope": 0.3,
            "refereeStrictnessSlope": 0.0,
        },
        "red": {
            "intercept": math.log(0.12),
            "totalXgSlope": 0.05,
            "knockoutSlope": 0.08,
            "physicalitySlope": 0.15,
            "refereeStrictnessSlope": 0.1,
        },
    },
    "playerPropModelCoeffs": {
        "intercept": -0.85,
        "logLambdaSlope": 1.35,
        "chanceIndexSlope": 0.42,
        "penaltyTakerSlope": 0.28,
        "starterSlope": 0.22,
        "roleForwardSlope": 0.18,
        "roleMidSlope": 0.08,
        "teamXgSlope": 0.12,
        "mlBlend": 0.62,
        "structuralZeroScale": 0.55,
        "wcGoalShare": 0.94,
    },
}


def load_env_local() -> None:
    env_path = REPO_ROOT / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#") or "=" not in t:
            continue
        key, _, val = t.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def create_supabase() -> Client:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or "").strip()
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
    return create_client(url, key)


def nested_get(obj: dict[str, Any], key: str, default: float = 0.0) -> float:
    val = obj.get(key, default)
    if val is None:
        return default
    try:
        f = float(val)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def extract_feature_row(features: dict[str, Any], opta: dict[str, Any] | None) -> dict[str, float]:
    row: dict[str, float] = {}
    for key in GRAHAM_FEATURE_KEYS:
        row[key] = nested_get(features, key)
    opta = opta or {}
    if isinstance(features.get("opta_features"), dict):
        opta = {**opta, **features["opta_features"]}  # type: ignore[arg-type]
    for key in OPTA_FEATURE_KEYS:
        row[f"opta_{key}"] = nested_get(opta, key)
    process = features.get("process_features")
    if not isinstance(process, dict):
        process = {}
    for key in PROCESS_FEATURE_KEYS:
        row[f"process_{key}"] = nested_get(process, key)
    return row


def is_transient_supabase_error(exc: BaseException) -> bool:
    try:
        import httpx

        if isinstance(
            exc,
            (
                httpx.ConnectError,
                httpx.ReadTimeout,
                httpx.WriteTimeout,
                httpx.ConnectTimeout,
                httpx.RemoteProtocolError,
            ),
        ):
            return True
    except ImportError:
        pass
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "connection reset",
            "timeout",
            "temporarily unavailable",
            "502",
            "503",
            "504",
            "429",
        )
    )


def execute_with_retry(fn: Any) -> Any:
    last_error: BaseException | None = None
    for attempt in range(SUPABASE_MAX_RETRIES):
        try:
            return fn()
        except Exception as exc:
            last_error = exc
            if not is_transient_supabase_error(exc) or attempt >= SUPABASE_MAX_RETRIES - 1:
                raise
            wait = SUPABASE_BACKOFF_BASE_SEC * (2**attempt)
            print(
                f"Supabase request failed ({exc}); "
                f"retry {attempt + 1}/{SUPABASE_MAX_RETRIES - 1} in {wait:.1f}s",
                file=sys.stderr,
            )
            time.sleep(wait)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Supabase request failed")


def fetch_training_rows(supabase: Client) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        page_offset = offset
        res = execute_with_retry(
            lambda: supabase.table("ml_training_examples")
            .select("*")
            .order("match_date", desc=False)
            .range(page_offset, page_offset + TRAINING_ROWS_PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < TRAINING_ROWS_PAGE_SIZE:
            break
        offset += TRAINING_ROWS_PAGE_SIZE
    records: list[dict[str, Any]] = []
    for r in rows:
        features = r.get("features") or {}
        if not isinstance(features, dict):
            continue
        if r.get("actual_home_goals") is None or r.get("actual_away_goals") is None:
            continue
        feat = extract_feature_row(features, r.get("opta_features"))
        feat["match_id"] = r["match_id"]
        feat["match_date"] = r["match_date"]
        feat["actual_home_goals"] = int(r["actual_home_goals"])
        feat["actual_away_goals"] = int(r["actual_away_goals"])
        feat["actual_total_goals"] = feat["actual_home_goals"] + feat["actual_away_goals"]
        feat["actual_goal_diff"] = feat["actual_home_goals"] - feat["actual_away_goals"]
        feat["is_knockout"] = 1.0 if r.get("is_knockout") else 0.0
        home_xg = nested_get(features, "home_xg", nested_get(features, "lambda", 1.25))
        away_xg = nested_get(features, "away_xg", nested_get(features, "mu", 1.25))
        feat["expected_total_xg"] = nested_get(features, "expected_total_xg", home_xg + away_xg)
        feat["actual_yellow"] = r.get("actual_yellow")
        feat["actual_fouls"] = r.get("actual_fouls")
        feat["actual_corners"] = r.get("actual_corners")
        feat["actual_red"] = r.get("actual_red")
        records.append(feat)
    return pd.DataFrame.from_records(records)


def load_deployed_constants(supabase: Client) -> dict[str, Any]:
    res = execute_with_retry(
        lambda: supabase.table("world_cup_calibration_config")
        .select("constants, version, metrics, created_at")
        .order("effective_from", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return {**DEFAULT_CONSTANTS, "modelVersion": "wc-graham-v1.0"}
    row = res.data[0]
    constants = row.get("constants") or {}
    constants["modelVersion"] = row.get("version") or constants.get("modelVersion")
    constants["_last_metrics"] = row.get("metrics") or {}
    constants["_last_created_at"] = row.get("created_at")
    merged = {**DEFAULT_CONSTANTS, **constants}
    merged["deltaWeights"] = {
        **DEFAULT_CONSTANTS["deltaWeights"],
        **(constants.get("deltaWeights") or {}),
    }
    merged["processFeatureWeights"] = {
        **DEFAULT_CONSTANTS["processFeatureWeights"],
        **(constants.get("processFeatureWeights") or {}),
    }
    merged["eventModelCoeffs"] = {
        **DEFAULT_CONSTANTS["eventModelCoeffs"],
        **(constants.get("eventModelCoeffs") or {}),
    }
    merged["playerPropModelCoeffs"] = {
        **DEFAULT_CONSTANTS["playerPropModelCoeffs"],
        **(constants.get("playerPropModelCoeffs") or {}),
    }
    merged["marketModels"] = constants.get("marketModels") or {}
    return merged


def normalize_delta_weights(raw: dict[str, float]) -> dict[str, float]:
    total = sum(max(0.0, raw.get(k, 0.0)) for k in DELTA_WEIGHT_KEYS)
    if total <= 0:
        return dict(DEFAULT_CONSTANTS["deltaWeights"])
    return {k: max(0.0, raw.get(k, 0.0)) / total for k in DELTA_WEIGHT_KEYS}


def coefs_to_delta_weights(coefs: np.ndarray, feature_names: list[str]) -> dict[str, float]:
    mapping = {
        "delta_xg_elo": "xgElo",
        "delta_talent": "talent",
        "delta_tournament": "tournament",
        "delta_recent_form": "recentXgForm",
        "delta_fifa": "fifa",
        "momentum_index": "momentum",
    }
    raw = {k: 0.0 for k in DELTA_WEIGHT_KEYS}
    for name, coef in zip(feature_names, coefs):
        if name in mapping:
            raw[mapping[name]] = max(0.0, float(coef))
    return normalize_delta_weights(raw)


def coefs_to_opta_weights(coefs: np.ndarray, feature_names: list[str]) -> dict[str, float]:
    weights: dict[str, float] = {}
    for name, coef in zip(feature_names, coefs):
        if not name.startswith("opta_"):
            continue
        key = name.replace("opta_", "", 1)
        c = float(coef)
        if abs(c) < 1e-6:
            continue
        weights[key] = c
    return weights


def coefs_to_process_weights(coefs: np.ndarray, feature_names: list[str]) -> dict[str, float]:
    weights: dict[str, float] = {}
    for name, coef in zip(feature_names, coefs):
        if not name.startswith("process_"):
            continue
        key = name.replace("process_", "", 1)
        c = float(coef)
        if abs(c) < 1e-6:
            continue
        weights[key] = c
    return weights


def train_goal_surrogate(df: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
    feature_cols = [
        c
        for c in df.columns
        if c.startswith("delta_")
        or c.startswith("opta_")
        or c.startswith("process_")
        or c == "momentum_index"
    ]
    X = df[feature_cols].fillna(0.0).values
    y = df["actual_goal_diff"].values

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    model = ElasticNet(alpha=0.02, l1_ratio=0.7, max_iter=5000, random_state=42)
    model.fit(Xs, y)

    delta_weights = coefs_to_delta_weights(model.coef_, feature_cols)
    opta_weights = coefs_to_opta_weights(model.coef_, feature_cols)
    process_weights = coefs_to_process_weights(model.coef_, feature_cols)

    goal_std = float(np.std(y)) or 1.0
    mu = float(DEFAULT_CONSTANTS["muXg"] * (1.0 + model.intercept_ / (goal_std * 4.0)))
    mu = max(1.05, min(1.55, mu))

    strength = float(DEFAULT_CONSTANTS["strengthExponent"] * (1.0 + np.mean(np.abs(model.coef_[:6])) * 0.05))
    strength = max(0.0025, min(0.0045, strength))

    return (
        {
            "deltaWeights": delta_weights,
            "optaFeatureWeights": opta_weights,
            "processFeatureWeights": process_weights,
            "muXg": mu,
            "strengthExponent": strength,
        },
        {
            "feature_importance": {
                name: float(coef) for name, coef in zip(feature_cols, model.coef_)
            },
            "intercept": float(model.intercept_),
        },
    )


def train_event_poisson(
    df: pd.DataFrame, target_col: str, defaults: dict[str, float]
) -> dict[str, float]:
    subset = df[df[target_col].notna() & (df[target_col] >= 0)].copy()
    if len(subset) < 10:
        return defaults

    feature_cols = ["expected_total_xg", "is_knockout", "opta_physicality_index", "opta_referee_strictness"]
    for col in feature_cols:
        if col not in subset.columns:
            subset[col] = 0.0 if col != "expected_total_xg" else 2.5
    X = subset[feature_cols].fillna(0.0).values
    y = subset[target_col].astype(float).values

    try:
        model = PoissonRegressor(alpha=0.1, max_iter=500, solver="lbfgs")
        model.fit(X, y)
        return {
            "intercept": float(model.intercept_),
            "totalXgSlope": float(model.coef_[0]),
            "knockoutSlope": float(model.coef_[1]),
            "physicalitySlope": float(model.coef_[2]),
            "refereeStrictnessSlope": float(model.coef_[3]),
        }
    except Exception:
        return defaults


def blend_delta_weights(
    deployed: dict[str, float], target: dict[str, float], step: float = ML_DELTA_BLEND_STEP
) -> dict[str, float]:
    blended: dict[str, float] = {}
    for key in DELTA_WEIGHT_KEYS:
        base = float(deployed.get(key, 0.0))
        tgt = float(target.get(key, base))
        blended[key] = base + step * (tgt - base)
    return normalize_delta_weights(blended)


def blend_scalar(deployed: float, target: float, max_rel_step: float = ML_SCALAR_MAX_REL_STEP) -> float:
    if not math.isfinite(deployed) or not math.isfinite(target):
        return deployed
    scale = max(abs(deployed), 1e-4)
    max_delta = scale * max_rel_step
    delta = max(-max_delta, min(max_delta, target - deployed))
    return deployed + delta


def ramp_feature_weights(
    deployed: dict[str, float],
    target: dict[str, float],
    max_abs_step: float = ML_FEATURE_MAX_ABS_STEP,
) -> dict[str, float]:
    out = dict(deployed)
    for key in set(deployed) | set(target):
        base = float(deployed.get(key, 0.0))
        tgt = float(target.get(key, 0.0))
        delta = max(-max_abs_step, min(max_abs_step, tgt - base))
        nxt = base + delta
        if abs(nxt) < 1e-8:
            out.pop(key, None)
        else:
            out[key] = nxt
    return out


def ml_holdout_improvement_threshold(holdout_size: int) -> float:
    if holdout_size <= 0:
        return 0.005
    return max(0.0005, 0.004 / math.sqrt(holdout_size / 8.0))


def build_incremental_candidate(
    deployed: dict[str, Any], raw_goal: dict[str, Any], train_df: pd.DataFrame | None = None
) -> dict[str, Any]:
    """Small step from deployed toward the unconstrained ML fit."""
    deployed_dw = deployed.get("deltaWeights") or DEFAULT_CONSTANTS["deltaWeights"]
    raw_dw = raw_goal.get("deltaWeights") or deployed_dw
    deployed_process = deployed.get("processFeatureWeights") or {}
    raw_process = raw_goal.get("processFeatureWeights") or {}
    deployed_opta = deployed.get("optaFeatureWeights") or {}
    raw_opta = raw_goal.get("optaFeatureWeights") or {}

    event_coeffs = dict(deployed.get("eventModelCoeffs") or DEFAULT_CONSTANTS["eventModelCoeffs"])
    if train_df is not None and len(train_df) >= 10:
        for kind, col, defaults_key in [
            ("yellow", "actual_yellow", "yellow"),
            ("fouls", "actual_fouls", "fouls"),
            ("corners", "actual_corners", "corners"),
        ]:
            if col in train_df.columns:
                event_coeffs[kind] = train_event_poisson(
                    train_df,
                    col,
                    event_coeffs.get(defaults_key, DEFAULT_CONSTANTS["eventModelCoeffs"][defaults_key]),
                )

    return {
        **deployed,
        "deltaWeights": blend_delta_weights(deployed_dw, raw_dw),
        "processFeatureWeights": ramp_feature_weights(deployed_process, raw_process),
        "optaFeatureWeights": ramp_feature_weights(deployed_opta, raw_opta),
        "muXg": blend_scalar(float(deployed.get("muXg", DEFAULT_CONSTANTS["muXg"])), float(raw_goal.get("muXg", deployed.get("muXg", DEFAULT_CONSTANTS["muXg"])))),
        "strengthExponent": blend_scalar(
            float(deployed.get("strengthExponent", DEFAULT_CONSTANTS["strengthExponent"])),
            float(raw_goal.get("strengthExponent", deployed.get("strengthExponent", DEFAULT_CONSTANTS["strengthExponent"]))),
        ),
        "eventModelCoeffs": event_coeffs,
        "marketModels": deployed.get("marketModels") or {},
    }


def validate_with_typescript(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    payload = json.dumps(candidates)
    proc = subprocess.run(
        ["npx", "tsx", "scripts/ml-validate-candidates.ts", "-"],
        input=payload,
        text=True,
        cwd=REPO_ROOT,
        capture_output=True,
    )
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Train but do not persist")
    args = parser.parse_args()

    load_env_local()
    supabase = create_supabase()

    df = fetch_training_rows(supabase)
    if df.empty:
        print("No ml_training_examples rows — run npm run ml:backfill first.")
        return

    deployed = load_deployed_constants(supabase)
    last_metrics = deployed.pop("_last_metrics", {}) or {}
    deployed.pop("_last_created_at", None)

    total = len(df)
    last_count = int(last_metrics.get("training_count", 0) or 0)
    new_since = max(0, total - last_count)

    if total < ML_MIN_TRAINING_EXAMPLES:
        print(f"Only {total} examples (need {ML_MIN_TRAINING_EXAMPLES}) — skipping deploy.")
        return
    if new_since < ML_MIN_NEW_EXAMPLES_SINCE_LAST_TRAIN and last_count > 0:
        print(f"Only {new_since} new examples since last train — skipping.")
        return

    train_df = df.iloc[:-ML_WALK_FORWARD_HOLDOUT] if len(df) > ML_WALK_FORWARD_HOLDOUT else df
    raw_goal_params, goal_metrics = train_goal_surrogate(train_df)
    candidate = build_incremental_candidate(deployed, raw_goal_params, train_df)

    ts_validation = validate_with_typescript([candidate, deployed])
    default_baseline_loss = None
    deployed_baseline_loss = None
    candidate_loss = None
    if ts_validation:
        default_baseline_loss = ts_validation.get("baseline_loss")
        deployed_baseline_loss = ts_validation.get("deployed_baseline_loss")
        results = ts_validation.get("results") or []
        if results:
            candidate_loss = results[0].get("loss")

    holdout_size = int(ts_validation.get("holdout_size", ML_WALK_FORWARD_HOLDOUT) if ts_validation else ML_WALK_FORWARD_HOLDOUT)
    improvement_threshold = ml_holdout_improvement_threshold(holdout_size)

    improved = False
    required: float | None = None
    if ts_validation is None:
        print("TypeScript validation unavailable — not deploying.", file=sys.stderr)
    elif deployed_baseline_loss is not None and candidate_loss is not None:
        required = float(deployed_baseline_loss) * (1.0 - improvement_threshold)
        improved = float(candidate_loss) < required

    print(f"Training rows: {total} (train {len(train_df)}, holdout {ML_WALK_FORWARD_HOLDOUT})")
    print(f"Incremental step: delta={ML_DELTA_BLEND_STEP}, scalar={ML_SCALAR_MAX_REL_STEP}, features={ML_FEATURE_MAX_ABS_STEP}")
    print(f"Goal surrogate: muXg={candidate['muXg']:.3f}, strength={candidate['strengthExponent']:.5f}")
    print(f"Delta weights: {json.dumps(candidate['deltaWeights'], indent=2)}")
    print(f"Opta weights (non-zero): {candidate.get('optaFeatureWeights')}")
    print(f"Process weights (non-zero): {candidate.get('processFeatureWeights')}")
    if deployed_baseline_loss is not None and candidate_loss is not None and required is not None:
        print(
            f"TS validation loss: {candidate_loss:.4f} "
            f"(deployed {deployed_baseline_loss:.4f}, "
            f"need < {required:.4f} for {(improvement_threshold * 100):.2f}% gain)"
        )
        if default_baseline_loss is not None:
            print(f"  (factory default holdout loss: {default_baseline_loss:.4f})")

    if not improved:
        print("Incremental candidate did not beat deployed model on holdout — not deploying.")
        return

    if args.dry_run:
        print("Dry run — not saving.")
        return

    version = f"wc-ml-v{total}-md{total}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    candidate["modelVersion"] = version

    metrics = {
        "training_count": total,
        "new_since_last_train": new_since,
        "baseline_loss": deployed_baseline_loss,
        "default_baseline_loss": default_baseline_loss,
        "candidate_loss": candidate_loss,
        "goal_surrogate": goal_metrics,
        "walk_forward_holdout": ML_WALK_FORWARD_HOLDOUT,
        "incremental_step": {
            "delta_blend": ML_DELTA_BLEND_STEP,
            "scalar_max_rel": ML_SCALAR_MAX_REL_STEP,
            "feature_max_abs": ML_FEATURE_MAX_ABS_STEP,
        },
        "method": "incremental_elasticnet_walkforward",
    }

    existing = execute_with_retry(
        lambda: supabase.table("world_cup_calibration_config")
        .select("id")
        .eq("version", version)
        .execute()
    )
    if existing.data:
        print(f"Version {version} already exists — skipping.")
        return

    execute_with_retry(
        lambda: supabase.table("world_cup_calibration_config")
        .insert(
            {
                "version": version,
                "constants": candidate,
                "metrics": metrics,
                "effective_from": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )

    print(f"Deployed calibration: {version}")


if __name__ == "__main__":
    main()

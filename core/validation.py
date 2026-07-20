"""
GLPM model validation and matchweek walk-forward backtesting (Chapter 13).

Scores latent rating stability, xG prediction error, and probabilistic match
outputs (Brier, log-loss, reliability diagrams), and flags outlier fixtures.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

from core.vector import PRIMARY_ORDER, PrimaryKey, RatingVector
from core.vector_assembly import assemble_matchweek_vectors, assemble_rating_vector_from_frames
from engine.predictions import PredictionResult, predict_match
from engine.types import MatchContext
from engine.xg_engine import estimate_expected_goals

Outcome1x2 = Literal["home", "draw", "away"]

EPS = 1e-9
LOG_CLAMP_LO = 1e-9
LOG_CLAMP_HI = 1.0 - 1e-9

# Outlier thresholds (plan defaults)
OUTLIER_FAVORITE_P = 0.65
OUTLIER_XG_ABS = 1.5
OUTLIER_SCORELINE_LL = 4.0
OUTLIER_BRIER_1X2 = 1.5

STABILITY_SCALE = 20.0  # rating points; normalises mean |Δr|
MODEL_VERSION_VAL = "glpm_val_v1"


def _clamp_prob(p: float) -> float:
    return float(np.clip(p, LOG_CLAMP_LO, LOG_CLAMP_HI))


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _as_date_str(value: Any) -> str:
    return _as_date(value).isoformat()


def outcome_1x2(home_score: int, away_score: int) -> Outcome1x2:
    if home_score > away_score:
        return "home"
    if home_score < away_score:
        return "away"
    return "draw"


def one_hot_1x2(outcome: Outcome1x2) -> tuple[float, float, float]:
    return (
        1.0 if outcome == "home" else 0.0,
        1.0 if outcome == "draw" else 0.0,
        1.0 if outcome == "away" else 0.0,
    )


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def brier_1x2(
    p_home: float,
    p_draw: float,
    p_away: float,
    outcome: Outcome1x2,
) -> float:
    """Multiclass Brier score for 1X2 (lower is better)."""
    y_h, y_d, y_a = one_hot_1x2(outcome)
    return float(
        (p_home - y_h) ** 2 + (p_draw - y_d) ** 2 + (p_away - y_a) ** 2
    )


def brier_binary(p: float, y: float) -> float:
    """Binary Brier score (p vs 0/1 target)."""
    return float((p - y) ** 2)


def log_loss_1x2(
    p_home: float,
    p_draw: float,
    p_away: float,
    outcome: Outcome1x2,
) -> float:
    """Multiclass log loss for 1X2."""
    p = {"home": p_home, "draw": p_draw, "away": p_away}[outcome]
    return float(-math.log(_clamp_prob(p)))


def log_loss_binary(p: float, y: float) -> float:
    """Binary log loss; y ∈ {0, 1}."""
    p_c = _clamp_prob(p)
    if y >= 0.5:
        return float(-math.log(p_c))
    return float(-math.log(1.0 - p_c))


def log_loss_scoreline(
    score_matrix: np.ndarray,
    home_goals: int,
    away_goals: int,
) -> float:
    """Negative log probability of the observed scoreline on the Dixon–Coles grid."""
    h_max = score_matrix.shape[0] - 1
    a_max = score_matrix.shape[1] - 1
    h = int(min(max(home_goals, 0), h_max))
    a = int(min(max(away_goals, 0), a_max))
    # Cap beyond grid: use edge cell mass as lower bound (conservative)
    p = float(score_matrix[h, a])
    if home_goals > h_max or away_goals > a_max:
        # Sum remaining tail mass for goals beyond max_goals on that axis
        if home_goals > h_max and away_goals <= a_max:
            p = float(score_matrix[h_max, a])
        elif away_goals > a_max and home_goals <= h_max:
            p = float(score_matrix[h, a_max])
        else:
            p = float(score_matrix[h_max, a_max])
    return float(-math.log(_clamp_prob(p)))


def mae(preds: Sequence[float], actuals: Sequence[float]) -> float:
    if len(preds) == 0:
        return float("nan")
    a = np.asarray(preds, dtype=float)
    b = np.asarray(actuals, dtype=float)
    mask = np.isfinite(a) & np.isfinite(b)
    if not np.any(mask):
        return float("nan")
    return float(np.mean(np.abs(a[mask] - b[mask])))


def rmse(preds: Sequence[float], actuals: Sequence[float]) -> float:
    if len(preds) == 0:
        return float("nan")
    a = np.asarray(preds, dtype=float)
    b = np.asarray(actuals, dtype=float)
    mask = np.isfinite(a) & np.isfinite(b)
    if not np.any(mask):
        return float("nan")
    return float(np.sqrt(np.mean((a[mask] - b[mask]) ** 2)))


def mean_error(preds: Sequence[float], actuals: Sequence[float]) -> float:
    """Mean signed error (pred − actual); positive ⇒ over-prediction."""
    if len(preds) == 0:
        return float("nan")
    a = np.asarray(preds, dtype=float)
    b = np.asarray(actuals, dtype=float)
    mask = np.isfinite(a) & np.isfinite(b)
    if not np.any(mask):
        return float("nan")
    return float(np.mean(a[mask] - b[mask]))


@dataclass
class ReliabilityBin:
    bin_lo: float
    bin_hi: float
    predicted_mean: float
    empirical_freq: float
    count: int


def reliability_diagram(
    probs: Sequence[float],
    outcomes: Sequence[float],
    *,
    n_bins: int = 10,
) -> list[ReliabilityBin]:
    """
    Group predictions by estimated probability and compare to empirical rates (§13.14).

    ``outcomes`` should be 0/1 indicators for the event whose probability is in ``probs``.
    """
    if n_bins < 1:
        raise ValueError("n_bins must be >= 1")
    p = np.asarray(probs, dtype=float)
    y = np.asarray(outcomes, dtype=float)
    if p.shape != y.shape:
        raise ValueError("probs and outcomes must have the same length")
    mask = np.isfinite(p) & np.isfinite(y)
    p = p[mask]
    y = y[mask]

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    bins: list[ReliabilityBin] = []
    for i in range(n_bins):
        lo, hi = float(edges[i]), float(edges[i + 1])
        if i == n_bins - 1:
            sel = (p >= lo) & (p <= hi)
        else:
            sel = (p >= lo) & (p < hi)
        count = int(np.sum(sel))
        if count == 0:
            bins.append(
                ReliabilityBin(
                    bin_lo=lo,
                    bin_hi=hi,
                    predicted_mean=float("nan"),
                    empirical_freq=float("nan"),
                    count=0,
                )
            )
        else:
            bins.append(
                ReliabilityBin(
                    bin_lo=lo,
                    bin_hi=hi,
                    predicted_mean=float(np.mean(p[sel])),
                    empirical_freq=float(np.mean(y[sel])),
                    count=count,
                )
            )
    return bins


def rating_stability_index(
    prev_vectors: Mapping[int, RatingVector] | Sequence[RatingVector],
    curr_vectors: Mapping[int, RatingVector] | Sequence[RatingVector],
    *,
    scale: float = STABILITY_SCALE,
) -> dict[str, float]:
    """
    Stability = 1 − mean(|Δr|) / scale, clamped to [0, 1].

    Returns per-primary keys plus ``overall``.
    """
    prev_map = _vectors_by_team(prev_vectors)
    curr_map = _vectors_by_team(curr_vectors)
    common = sorted(set(prev_map) & set(curr_map))
    if not common or scale <= 0:
        out = {k: float("nan") for k in PRIMARY_ORDER}
        out["overall"] = float("nan")
        return out

    dim_abs: dict[PrimaryKey, list[float]] = {k: [] for k in PRIMARY_ORDER}
    all_abs: list[float] = []
    for tid in common:
        prev = prev_map[tid]
        curr = curr_map[tid]
        for key in PRIMARY_ORDER:
            a = prev.get(key)
            b = curr.get(key)
            if not (np.isfinite(a) and np.isfinite(b)):
                continue
            d = abs(float(b) - float(a))
            dim_abs[key].append(d)
            all_abs.append(d)

    def _stab(vals: list[float]) -> float:
        if not vals:
            return float("nan")
        return float(np.clip(1.0 - (float(np.mean(vals)) / scale), 0.0, 1.0))

    result: dict[str, float] = {k: _stab(dim_abs[k]) for k in PRIMARY_ORDER}
    result["overall"] = _stab(all_abs)
    return result


def variance_progression(
    vectors_by_week: Sequence[tuple[Any, Sequence[RatingVector] | Mapping[int, RatingVector]]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Track mean metadata.variance per primary across matchweek snapshots.

    Returns ``{primary: [{gameweek, mean_variance, n_teams}, ...], ...}``.
    """
    series: dict[str, list[dict[str, Any]]] = {k: [] for k in PRIMARY_ORDER}
    for gw, vecs in vectors_by_week:
        vmap = _vectors_by_team(vecs)
        for key in PRIMARY_ORDER:
            vars_: list[float] = []
            for rv in vmap.values():
                var = float(rv.metadata[key].variance)
                if np.isfinite(var):
                    vars_.append(var)
            series[key].append(
                {
                    "gameweek": gw,
                    "mean_variance": float(np.mean(vars_)) if vars_ else float("nan"),
                    "n_teams": len(vars_),
                }
            )
    return series


def _vectors_by_team(
    vectors: Mapping[int, RatingVector] | Sequence[RatingVector],
) -> dict[int, RatingVector]:
    if isinstance(vectors, Mapping):
        return {int(k): v for k, v in vectors.items()}
    return {int(v.team_sm_id): v for v in vectors}


# ---------------------------------------------------------------------------
# Outlier detection
# ---------------------------------------------------------------------------


@dataclass
class OutlierFlag:
    rule_code: str
    message: str
    observed: dict[str, Any]


def detect_outliers(
    *,
    p_home: float,
    p_draw: float,
    p_away: float,
    outcome: Outcome1x2,
    home_xg_pred: float,
    away_xg_pred: float,
    home_xg_actual: Optional[float],
    away_xg_actual: Optional[float],
    scoreline_ll: float,
    brier: float,
    home_score: int,
    away_score: int,
    extra_context: Optional[Mapping[str, Any]] = None,
) -> list[OutlierFlag]:
    """Flag fixtures where the model deviated sharply from the outcome."""
    flags: list[OutlierFlag] = []
    base = {
        "p_home": p_home,
        "p_draw": p_draw,
        "p_away": p_away,
        "outcome": outcome,
        "home_score": home_score,
        "away_score": away_score,
        "home_xg_pred": home_xg_pred,
        "away_xg_pred": away_xg_pred,
        "home_xg_actual": home_xg_actual,
        "away_xg_actual": away_xg_actual,
        "scoreline_ll": scoreline_ll,
        "brier_1x2": brier,
    }
    if extra_context:
        base.update(dict(extra_context))

    fav_side: Optional[Literal["home", "away"]] = None
    fav_p = 0.0
    if p_home >= p_away and p_home >= OUTLIER_FAVORITE_P:
        fav_side, fav_p = "home", p_home
    elif p_away > p_home and p_away >= OUTLIER_FAVORITE_P:
        fav_side, fav_p = "away", p_away

    if fav_side is not None and outcome != fav_side:
        flags.append(
            OutlierFlag(
                rule_code="OUTLIER_FAVORITE_LOSS",
                message=(
                    f"Favorite ({fav_side}, p={fav_p:.3f}) did not win "
                    f"(outcome={outcome}, {home_score}-{away_score})"
                ),
                observed={**base, "favorite": fav_side, "favorite_p": fav_p},
            )
        )

    for side, pred, actual in (
        ("home", home_xg_pred, home_xg_actual),
        ("away", away_xg_pred, away_xg_actual),
    ):
        if actual is None or not np.isfinite(actual) or not np.isfinite(pred):
            continue
        residual = abs(float(pred) - float(actual))
        if residual >= OUTLIER_XG_ABS:
            flags.append(
                OutlierFlag(
                    rule_code="OUTLIER_XG_ABS",
                    message=(
                        f"{side} |pred_xg − actual_xg|={residual:.3f} "
                        f"(≥ {OUTLIER_XG_ABS})"
                    ),
                    observed={
                        **base,
                        "side": side,
                        "residual_abs": residual,
                        "threshold": OUTLIER_XG_ABS,
                    },
                )
            )

    if scoreline_ll >= OUTLIER_SCORELINE_LL:
        flags.append(
            OutlierFlag(
                rule_code="OUTLIER_SCORELINE_LL",
                message=(
                    f"Scoreline log-loss={scoreline_ll:.3f} (≥ {OUTLIER_SCORELINE_LL})"
                ),
                observed={**base, "threshold": OUTLIER_SCORELINE_LL},
            )
        )

    if brier >= OUTLIER_BRIER_1X2:
        flags.append(
            OutlierFlag(
                rule_code="OUTLIER_BRIER_1X2",
                message=f"1X2 Brier={brier:.3f} (≥ {OUTLIER_BRIER_1X2})",
                observed={**base, "threshold": OUTLIER_BRIER_1X2},
            )
        )

    return flags


# ---------------------------------------------------------------------------
# Evaluation dataclasses
# ---------------------------------------------------------------------------


@dataclass
class FixtureEval:
    match_sm_id: int
    season_id: int
    gameweek: Optional[int]
    match_date: str
    home_team_sm_id: int
    away_team_sm_id: int
    home_score: int
    away_score: int
    as_of_date: str
    home_xg_pred: float
    away_xg_pred: float
    home_xg_actual: Optional[float]
    away_xg_actual: Optional[float]
    p_home: float
    p_draw: float
    p_away: float
    p_btts_yes: float
    outcome: Outcome1x2
    brier_1x2: float
    brier_btts: float
    log_loss_1x2: float
    log_loss_btts: float
    log_loss_scoreline: float
    mae_xg: float
    outliers: list[OutlierFlag] = field(default_factory=list)
    prediction: Optional[PredictionResult] = None

    def to_observed(self) -> dict[str, Any]:
        return {
            "match_sm_id": self.match_sm_id,
            "season_id": self.season_id,
            "gameweek": self.gameweek,
            "match_date": self.match_date,
            "as_of_date": self.as_of_date,
            "home_team_sm_id": self.home_team_sm_id,
            "away_team_sm_id": self.away_team_sm_id,
            "home_score": self.home_score,
            "away_score": self.away_score,
            "outcome": self.outcome,
            "home_xg_pred": self.home_xg_pred,
            "away_xg_pred": self.away_xg_pred,
            "home_xg_actual": self.home_xg_actual,
            "away_xg_actual": self.away_xg_actual,
            "p_home": self.p_home,
            "p_draw": self.p_draw,
            "p_away": self.p_away,
            "p_btts_yes": self.p_btts_yes,
            "brier_1x2": self.brier_1x2,
            "brier_btts": self.brier_btts,
            "log_loss_1x2": self.log_loss_1x2,
            "log_loss_btts": self.log_loss_btts,
            "log_loss_scoreline": self.log_loss_scoreline,
            "mae_xg": self.mae_xg,
            "outlier_codes": [o.rule_code for o in self.outliers],
        }


@dataclass
class MatchweekEval:
    gameweek: Optional[int]
    fixtures: list[FixtureEval] = field(default_factory=list)
    stability: dict[str, float] = field(default_factory=dict)


@dataclass
class BacktestReport:
    season_id: int
    matchweeks: list[MatchweekEval] = field(default_factory=list)
    fixtures: list[FixtureEval] = field(default_factory=list)
    skipped: int = 0
    variance_series: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    reliability_home_win: list[ReliabilityBin] = field(default_factory=list)
    model_version: str = MODEL_VERSION_VAL

    @property
    def n_fixtures(self) -> int:
        return len(self.fixtures)

    @property
    def n_outliers(self) -> int:
        return sum(len(f.outliers) for f in self.fixtures)

    def aggregate(self) -> dict[str, Any]:
        fx = self.fixtures
        if not fx:
            return {
                "n_fixtures": 0,
                "n_outliers": 0,
                "skipped": self.skipped,
                "mae_xg": float("nan"),
                "rmse_xg": float("nan"),
                "bias_xg": float("nan"),
                "brier_1x2": float("nan"),
                "brier_btts": float("nan"),
                "log_loss_1x2": float("nan"),
                "log_loss_btts": float("nan"),
                "log_loss_scoreline": float("nan"),
            }

        pred_aligned: list[float] = []
        act_aligned: list[float] = []
        for f in fx:
            if f.home_xg_actual is not None and np.isfinite(f.home_xg_actual):
                pred_aligned.append(f.home_xg_pred)
                act_aligned.append(float(f.home_xg_actual))
            if f.away_xg_actual is not None and np.isfinite(f.away_xg_actual):
                pred_aligned.append(f.away_xg_pred)
                act_aligned.append(float(f.away_xg_actual))

        return {
            "n_fixtures": self.n_fixtures,
            "n_outliers": self.n_outliers,
            "skipped": self.skipped,
            "mae_xg": mae(pred_aligned, act_aligned),
            "rmse_xg": rmse(pred_aligned, act_aligned),
            "bias_xg": mean_error(pred_aligned, act_aligned),
            "brier_1x2": float(np.mean([f.brier_1x2 for f in fx])),
            "brier_btts": float(np.mean([f.brier_btts for f in fx])),
            "log_loss_1x2": float(np.mean([f.log_loss_1x2 for f in fx])),
            "log_loss_btts": float(np.mean([f.log_loss_btts for f in fx])),
            "log_loss_scoreline": float(np.mean([f.log_loss_scoreline for f in fx])),
        }

    def to_summary_dict(self) -> dict[str, Any]:
        agg = self.aggregate()
        return {
            "season_id": self.season_id,
            "model_version": self.model_version,
            **agg,
            "reliability_home_win": [
                {
                    "bin_lo": b.bin_lo,
                    "bin_hi": b.bin_hi,
                    "predicted_mean": b.predicted_mean,
                    "empirical_freq": b.empirical_freq,
                    "count": b.count,
                }
                for b in self.reliability_home_win
            ],
        }


def build_validation_log_rows(report: BacktestReport) -> list[dict[str, Any]]:
    """Serialize a backtest report into ``glpm_validation_logs`` VAL rows."""
    rows: list[dict[str, Any]] = []
    run_key = f"season:{report.season_id}"
    summary = report.to_summary_dict()
    rows.append(
        {
            "layer": "VAL",
            "entity_type": "backtest_run",
            "entity_key": run_key,
            "rule_code": "RUN_SUMMARY",
            "severity": "info",
            "message": (
                f"Backtest season={report.season_id}: "
                f"n={summary['n_fixtures']} outliers={summary['n_outliers']}"
            ),
            "observed": summary,
        }
    )

    if report.variance_series:
        # Attach last stability from final matchweek if present
        last_stability: dict[str, float] = {}
        if report.matchweeks:
            last_stability = report.matchweeks[-1].stability or {}
        rows.append(
            {
                "layer": "VAL",
                "entity_type": "season_ratings",
                "entity_key": run_key,
                "rule_code": "RATING_STABILITY",
                "severity": "info",
                "message": f"Rating stability / variance progression for season {report.season_id}",
                "observed": {
                    "season_id": report.season_id,
                    "stability": last_stability,
                    "variance_progression": report.variance_series,
                },
            }
        )

    for fx in report.fixtures:
        rows.append(
            {
                "layer": "VAL",
                "entity_type": "fixture",
                "entity_key": str(fx.match_sm_id),
                "rule_code": "FIXTURE_SCORE",
                "severity": "info",
                "message": (
                    f"Fixture {fx.match_sm_id}: Brier={fx.brier_1x2:.4f} "
                    f"LL={fx.log_loss_1x2:.4f}"
                ),
                "observed": fx.to_observed(),
            }
        )
        for flag in fx.outliers:
            rows.append(
                {
                    "layer": "VAL",
                    "entity_type": "fixture",
                    "entity_key": str(fx.match_sm_id),
                    "rule_code": flag.rule_code,
                    "severity": "warn",
                    "message": flag.message,
                    "observed": flag.observed,
                }
            )
    return rows


# ---------------------------------------------------------------------------
# Walk-forward backtest
# ---------------------------------------------------------------------------


def _day_before(match_date: Any) -> str:
    d = _as_date(match_date) - timedelta(days=1)
    return d.isoformat()


def _team_matches_used(vector: RatingVector) -> int:
    vals = [
        int(vector.metadata[k].matches_used)
        for k in PRIMARY_ORDER
        if np.isfinite(vector.get(k))
    ]
    return max(vals) if vals else 0


def _lookup_xg(
    match_xg: Optional[pd.DataFrame],
    match_sm_id: int,
    team_sm_id: int,
) -> Optional[float]:
    if match_xg is None or match_xg.empty:
        return None
    sub = match_xg[
        (match_xg["match_sm_id"].astype(int) == int(match_sm_id))
        & (match_xg["team_sm_id"].astype(int) == int(team_sm_id))
    ]
    if sub.empty:
        return None
    val = sub.iloc[0].get("xg")
    if val is None or (isinstance(val, float) and not np.isfinite(val)):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _executed_at_lock(match_row: Mapping[str, Any]) -> str:
    """Simulated pre-kickoff lock timestamp (kickoff − 1h, else match_date 12:00Z)."""
    kickoff = match_row.get("kickoff_at")
    if kickoff is not None and str(kickoff).strip():
        try:
            raw = str(kickoff).replace("Z", "+00:00")
            dt = datetime.fromisoformat(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return (dt - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
    d = _as_date(match_row.get("match_date"))
    return datetime(d.year, d.month, d.day, 12, 0, tzinfo=timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )


def evaluate_fixture(
    *,
    match_row: Mapping[str, Any],
    home_vector: RatingVector,
    away_vector: RatingVector,
    home_xg_actual: Optional[float],
    away_xg_actual: Optional[float],
    context: Optional[MatchContext] = None,
) -> FixtureEval:
    """Score a single fixture given point-in-time rating vectors."""
    xg = estimate_expected_goals(home_vector, away_vector, context)
    pred = predict_match(xg)
    home_score = int(match_row["home_score"])
    away_score = int(match_row["away_score"])
    outcome = outcome_1x2(home_score, away_score)
    btts_y = 1.0 if home_score > 0 and away_score > 0 else 0.0

    b1 = brier_1x2(pred.home_win, pred.draw, pred.away_win, outcome)
    bb = brier_binary(pred.btts_yes, btts_y)
    ll1 = log_loss_1x2(pred.home_win, pred.draw, pred.away_win, outcome)
    llb = log_loss_binary(pred.btts_yes, btts_y)
    lls = log_loss_scoreline(pred.score_matrix, home_score, away_score)

    pred_xg_list: list[float] = []
    act_xg_list: list[float] = []
    if home_xg_actual is not None and np.isfinite(home_xg_actual):
        pred_xg_list.append(xg.home_xg)
        act_xg_list.append(float(home_xg_actual))
    if away_xg_actual is not None and np.isfinite(away_xg_actual):
        pred_xg_list.append(xg.away_xg)
        act_xg_list.append(float(away_xg_actual))
    mae_xg = mae(pred_xg_list, act_xg_list) if act_xg_list else float("nan")

    # Goal–xG shock hint for outlier context
    extra: dict[str, Any] = {}
    if home_xg_actual is not None and np.isfinite(home_xg_actual):
        extra["home_goal_xg_shock"] = abs(home_score - float(home_xg_actual))
    if away_xg_actual is not None and np.isfinite(away_xg_actual):
        extra["away_goal_xg_shock"] = abs(away_score - float(away_xg_actual))

    outliers = detect_outliers(
        p_home=pred.home_win,
        p_draw=pred.draw,
        p_away=pred.away_win,
        outcome=outcome,
        home_xg_pred=xg.home_xg,
        away_xg_pred=xg.away_xg,
        home_xg_actual=home_xg_actual,
        away_xg_actual=away_xg_actual,
        scoreline_ll=lls,
        brier=b1,
        home_score=home_score,
        away_score=away_score,
        extra_context=extra or None,
    )

    gw = match_row.get("gameweek")
    return FixtureEval(
        match_sm_id=int(match_row["sm_id"] if "sm_id" in match_row else match_row["match_sm_id"]),
        season_id=int(match_row["season_id"]),
        gameweek=int(gw) if gw is not None and str(gw) != "nan" else None,
        match_date=_as_date_str(match_row["match_date"]),
        home_team_sm_id=int(match_row["home_team_sm_id"]),
        away_team_sm_id=int(match_row["away_team_sm_id"]),
        home_score=home_score,
        away_score=away_score,
        as_of_date=home_vector.as_of_date,
        home_xg_pred=xg.home_xg,
        away_xg_pred=xg.away_xg,
        home_xg_actual=home_xg_actual,
        away_xg_actual=away_xg_actual,
        p_home=pred.home_win,
        p_draw=pred.draw,
        p_away=pred.away_win,
        p_btts_yes=pred.btts_yes,
        outcome=outcome,
        brier_1x2=b1,
        brier_btts=bb,
        log_loss_1x2=ll1,
        log_loss_btts=llb,
        log_loss_scoreline=lls,
        mae_xg=mae_xg,
        outliers=outliers,
        prediction=pred,
    )


def run_matchweek_backtest(
    season_id: int,
    *,
    client=None,
    matches: Optional[pd.DataFrame] = None,
    team_primaries: Optional[pd.DataFrame] = None,
    player_gk: Optional[pd.DataFrame] = None,
    gk_minutes: Optional[pd.DataFrame] = None,
    history: Optional[pd.DataFrame] = None,
    match_xg: Optional[pd.DataFrame] = None,
    min_matches: int = 3,
    dry_run: bool = False,
    persist_predictions: bool = True,
    persist_validation_logs: bool = True,
) -> BacktestReport:
    """
    Walk finished fixtures by gameweek, predicting with point-in-time vectors only.

    Rating vectors use ``as_of_date = match_date − 1 day`` so primaries from the
    match day itself cannot leak into the forecast.
    """
    from core import io as core_io

    if matches is None:
        if client is None:
            client = core_io.get_supabase_client()
        matches = core_io.load_finished_matches(client, season_id=season_id)
    if team_primaries is None:
        if client is None:
            client = core_io.get_supabase_client()
        team_primaries = core_io.load_team_primary_ratings(client, season_id=season_id)
        player_gk = core_io.load_player_gk_ratings(client, season_id=season_id)
        gk_minutes = core_io.load_gk_minutes(client, season_id=season_id)
        history = core_io.load_rating_history(client, season_id=season_id)
    if match_xg is None and client is not None and matches is not None and not matches.empty:
        match_ids = [int(x) for x in matches["sm_id"].tolist()]
        match_xg = core_io.load_match_team_xg(client, match_ids)

    report = BacktestReport(season_id=int(season_id))
    if matches is None or matches.empty:
        return report

    work = matches.copy()
    work["match_date"] = work["match_date"].map(_as_date_str)
    if "gameweek" not in work.columns:
        work["gameweek"] = None
    # Stable sort: gameweek (nulls last), match_date, sm_id
    work["_gw_sort"] = work["gameweek"].apply(
        lambda x: int(x) if x is not None and str(x) != "nan" else 10**9
    )
    work = work.sort_values(["_gw_sort", "match_date", "sm_id"]).reset_index(drop=True)

    primaries = team_primaries if team_primaries is not None else pd.DataFrame()
    pgk = player_gk if player_gk is not None else pd.DataFrame()
    gmin = gk_minutes if gk_minutes is not None else pd.DataFrame()
    hist = history if history is not None else pd.DataFrame()

    prev_week_vectors: dict[int, RatingVector] = {}
    week_snapshots: list[tuple[Any, dict[int, RatingVector]]] = []
    prediction_rows: list[dict[str, Any]] = []
    skipped = 0

    for gw, group in work.groupby("_gw_sort", sort=True):
        gw_label: Optional[int] = None if int(gw) >= 10**9 else int(gw)
        mw = MatchweekEval(gameweek=gw_label)
        # Matchweek end date for stability snapshot
        end_date = max(group["match_date"].map(_as_date_str).tolist())
        curr_vectors_list = assemble_matchweek_vectors(
            season_id,
            end_date,
            team_primaries=primaries,
            player_gk=pgk if not pgk.empty else None,
            gk_minutes=gmin if not gmin.empty else None,
            history=hist if not hist.empty else None,
        )
        curr_map = {v.team_sm_id: v for v in curr_vectors_list}

        if prev_week_vectors:
            mw.stability = rating_stability_index(prev_week_vectors, curr_map)
        week_snapshots.append((gw_label if gw_label is not None else end_date, curr_map))

        for _, row in group.iterrows():
            as_of = _day_before(row["match_date"])
            home_id = int(row["home_team_sm_id"])
            away_id = int(row["away_team_sm_id"])

            home_v = assemble_rating_vector_from_frames(
                team_sm_id=home_id,
                season_id=int(season_id),
                as_of_date=as_of,
                team_primaries=primaries,
                player_gk=pgk if not pgk.empty else None,
                gk_minutes=gmin if not gmin.empty else None,
                history=hist if not hist.empty else None,
            )
            away_v = assemble_rating_vector_from_frames(
                team_sm_id=away_id,
                season_id=int(season_id),
                as_of_date=as_of,
                team_primaries=primaries,
                player_gk=pgk if not pgk.empty else None,
                gk_minutes=gmin if not gmin.empty else None,
                history=hist if not hist.empty else None,
            )

            # Leakage guard
            if home_v.as_of_date >= _as_date_str(row["match_date"]):
                skipped += 1
                continue
            if away_v.as_of_date >= _as_date_str(row["match_date"]):
                skipped += 1
                continue
            if not home_v.is_complete() or not away_v.is_complete():
                skipped += 1
                continue
            if (
                _team_matches_used(home_v) < min_matches
                or _team_matches_used(away_v) < min_matches
            ):
                skipped += 1
                continue

            match_sm_id = int(row["sm_id"])
            hx_act = _lookup_xg(match_xg, match_sm_id, home_id)
            ax_act = _lookup_xg(match_xg, match_sm_id, away_id)

            fx = evaluate_fixture(
                match_row=row.to_dict(),
                home_vector=home_v,
                away_vector=away_v,
                home_xg_actual=hx_act,
                away_xg_actual=ax_act,
            )
            # Ensure as_of recorded is the cutoff we used
            fx.as_of_date = as_of
            assert fx.as_of_date < fx.match_date

            mw.fixtures.append(fx)
            report.fixtures.append(fx)

            if fx.prediction is not None:
                pred_row = fx.prediction.to_upsert_row(
                    match_sm_id=match_sm_id,
                    home_team_sm_id=home_id,
                    away_team_sm_id=away_id,
                    season_id=int(season_id),
                )
                pred_row["executed_at"] = _executed_at_lock(row.to_dict())
                prediction_rows.append(pred_row)

        report.matchweeks.append(mw)
        prev_week_vectors = curr_map

    report.skipped = skipped
    report.variance_series = variance_progression(week_snapshots)
    report.reliability_home_win = reliability_diagram(
        [f.p_home for f in report.fixtures],
        [1.0 if f.outcome == "home" else 0.0 for f in report.fixtures],
        n_bins=10,
    )

    if not dry_run and client is not None:
        if persist_predictions and prediction_rows:
            core_io.insert_prediction_history(client, prediction_rows, dry_run=False)
        if persist_validation_logs:
            log_rows = build_validation_log_rows(report)
            core_io.insert_validation_logs(client, log_rows, dry_run=False)

    return report

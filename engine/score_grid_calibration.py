"""
League score-grid calibration: fit {mu, rho, goal_overdispersion_k} on
prior + current seasons with exponential time weighting.

Primary objective: weighted exact-score log loss.
Guardrail: 1X2 Brier must not worsen by more than ``brier_guardrail``.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

import numpy as np

from core.validation import (
    brier_1x2,
    log_loss_1x2,
    log_loss_scoreline,
    outcome_1x2,
)
from core.vector_assembly import assemble_rating_vector_from_frames
from engine.config import DEFAULT_MU_XG, XgEngineConfig
from engine.predictions import (
    DEFAULT_RHO,
    PredictionConfig,
    predict_match,
)
from engine.types import MatchContext
from engine.xg_engine import estimate_expected_goals

CALIBRATION_DIR = Path(__file__).resolve().parents[1] / "data" / "glpm" / "calibration"
CALIBRATION_SCHEMA_VERSION = 1
DEFAULT_HALF_LIFE_DAYS = 220.0
DEFAULT_BRIER_GUARDRAIL = 0.025
DEFAULT_MU0 = DEFAULT_MU_XG
# Soft penalty (nats) on share of fixtures whose mode is 1-1.
DEFAULT_MODE_11_PENALTY = 0.12


@dataclass(frozen=True)
class ScoreGridParams:
    mu: float = DEFAULT_MU_XG
    rho: float = DEFAULT_RHO
    goal_overdispersion_k: float = 0.0
    # Stretch |λH−λA| around the match mean (1 = unchanged).
    lambda_gap_scale: float = 1.0
    attenuate_rho_for_gap: bool = True
    gap_positive_rho: bool = True

    def prediction_config(self) -> PredictionConfig:
        return PredictionConfig(
            rho=self.rho,
            goal_overdispersion_k=self.goal_overdispersion_k,
            attenuate_rho_for_gap=self.attenuate_rho_for_gap,
            gap_positive_rho=self.gap_positive_rho,
        )


def transform_lambdas(
    home_xg0: float,
    away_xg0: float,
    *,
    mu: float,
    mu0: float = DEFAULT_MU0,
    gap_scale: float = 1.0,
) -> tuple[float, float]:
    """Rescale mean scoring level and optionally amplify the λ gap."""
    scale = float(mu) / float(mu0) if mu0 else 1.0
    hx = float(home_xg0) * scale
    ax = float(away_xg0) * scale
    gs = max(0.5, float(gap_scale))
    if abs(gs - 1.0) > 1e-9:
        mid = 0.5 * (hx + ax)
        hx = mid + (hx - mid) * gs
        ax = mid + (ax - mid) * gs
    return max(0.05, hx), max(0.05, ax)


@dataclass
class ScoreGridCalibrationArtifact:
    schema_version: int
    competition_id: int
    competition_name: str
    season_ids: list[int]
    params: ScoreGridParams
    baseline: dict[str, float]
    calibrated: dict[str, float]
    half_life_days: float
    n_matches: int
    fitted_at: str
    search: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "competition_id": self.competition_id,
            "competition_name": self.competition_name,
            "season_ids": self.season_ids,
            "params": asdict(self.params),
            "baseline": self.baseline,
            "calibrated": self.calibrated,
            "half_life_days": self.half_life_days,
            "n_matches": self.n_matches,
            "fitted_at": self.fitted_at,
            "search": self.search,
        }

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> "ScoreGridCalibrationArtifact":
        p = raw.get("params") or {}
        return cls(
            schema_version=int(raw.get("schema_version") or CALIBRATION_SCHEMA_VERSION),
            competition_id=int(raw["competition_id"]),
            competition_name=str(raw.get("competition_name") or ""),
            season_ids=[int(x) for x in (raw.get("season_ids") or [])],
            params=ScoreGridParams(
                mu=float(p.get("mu", DEFAULT_MU_XG)),
                rho=float(p.get("rho", DEFAULT_RHO)),
                goal_overdispersion_k=float(p.get("goal_overdispersion_k", 0.0)),
                lambda_gap_scale=float(p.get("lambda_gap_scale", 1.0)),
                attenuate_rho_for_gap=bool(p.get("attenuate_rho_for_gap", True)),
                gap_positive_rho=bool(p.get("gap_positive_rho", True)),
            ),
            baseline=dict(raw.get("baseline") or {}),
            calibrated=dict(raw.get("calibrated") or {}),
            half_life_days=float(raw.get("half_life_days") or DEFAULT_HALF_LIFE_DAYS),
            n_matches=int(raw.get("n_matches") or 0),
            fitted_at=str(raw.get("fitted_at") or ""),
            search=dict(raw.get("search") or {}),
        )


def artifact_path(competition_id: int, *, root: Optional[Path] = None) -> Path:
    base = root or CALIBRATION_DIR
    return base / f"competition-{int(competition_id)}-score-grid.json"


def save_artifact(
    artifact: ScoreGridCalibrationArtifact,
    *,
    root: Optional[Path] = None,
) -> Path:
    path = artifact_path(artifact.competition_id, root=root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(artifact.to_dict(), indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    return path


def load_artifact(
    competition_id: int,
    *,
    root: Optional[Path] = None,
) -> Optional[ScoreGridCalibrationArtifact]:
    path = artifact_path(competition_id, root=root)
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return ScoreGridCalibrationArtifact.from_dict(raw)


def time_weight(match_date: date, *, as_of: date, half_life_days: float) -> float:
    if half_life_days <= 0:
        return 1.0
    age = max(0, (as_of - match_date).days)
    return float(math.exp(-math.log(2.0) * age / half_life_days))


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _day_before(value: Any) -> str:
    d = _as_date(value)
    from datetime import timedelta

    return (d - timedelta(days=1)).isoformat()


@dataclass
class CachedFixture:
    match_sm_id: int
    season_id: int
    match_date: date
    home_score: int
    away_score: int
    home_xg0: float
    away_xg0: float
    weight: float


def mode_scoreline(score_matrix: np.ndarray) -> tuple[int, int]:
    idx = int(np.argmax(score_matrix))
    h = idx // score_matrix.shape[1]
    a = idx % score_matrix.shape[1]
    return h, a


def evaluate_params_on_cache(
    fixtures: Sequence[CachedFixture],
    params: ScoreGridParams,
    *,
    mu0: float = DEFAULT_MU0,
) -> dict[str, float]:
    """Score a candidate on cached baseline λ (μ0), rescaling by params.mu / mu0."""
    if not fixtures:
        return {
            "n": 0.0,
            "scoreline_ll": float("nan"),
            "brier_1x2": float("nan"),
            "log_loss_1x2": float("nan"),
            "mode_11_rate": float("nan"),
            "mean_p11": float("nan"),
            "mean_abs_gap": float("nan"),
        }

    scale = float(params.mu) / float(mu0) if mu0 else 1.0
    cfg = params.prediction_config()
    w_sum = 0.0
    sll = 0.0
    brier = 0.0
    ll1 = 0.0
    mode_11 = 0.0
    p11 = 0.0
    gap = 0.0

    for fx in fixtures:
        hx, ax = transform_lambdas(
            fx.home_xg0,
            fx.away_xg0,
            mu=params.mu,
            mu0=mu0,
            gap_scale=params.lambda_gap_scale,
        )
        pred = predict_match(hx, ax, config=cfg)
        w = float(fx.weight)
        w_sum += w
        outcome = outcome_1x2(fx.home_score, fx.away_score)
        sll += w * log_loss_scoreline(pred.score_matrix, fx.home_score, fx.away_score)
        brier += w * brier_1x2(pred.home_win, pred.draw, pred.away_win, outcome)
        ll1 += w * log_loss_1x2(pred.home_win, pred.draw, pred.away_win, outcome)
        mh, ma = mode_scoreline(pred.score_matrix)
        if mh == 1 and ma == 1:
            mode_11 += w
        h_max = pred.score_matrix.shape[0] - 1
        a_max = pred.score_matrix.shape[1] - 1
        p11 += w * float(pred.score_matrix[min(1, h_max), min(1, a_max)])
        gap += w * abs(hx - ax)

    return {
        "n": float(len(fixtures)),
        "scoreline_ll": sll / w_sum,
        "brier_1x2": brier / w_sum,
        "log_loss_1x2": ll1 / w_sum,
        "mode_11_rate": mode_11 / w_sum,
        "mean_p11": p11 / w_sum,
        "mean_abs_gap": gap / w_sum,
    }


def build_fixture_cache(
    season_ids: Sequence[int],
    *,
    client=None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    as_of: Optional[date] = None,
    min_matches: int = 3,
    mu0: float = DEFAULT_MU0,
) -> list[CachedFixture]:
    """
    Point-in-time baseline λ (μ0) for finished fixtures across seasons.

    Uses match_date − 1 rating vectors so calibration does not leak same-day results.
    """
    from core import io as core_io

    if client is None:
        client = core_io.get_supabase_client()

    as_of_d = as_of or date.today()
    xg_cfg = XgEngineConfig(mu=mu0)
    cache: list[CachedFixture] = []

    for season_id in season_ids:
        matches = core_io.load_finished_matches(client, season_id=int(season_id))
        if matches is None or matches.empty:
            continue
        team_primaries = core_io.load_team_primary_ratings(client, season_id=int(season_id))
        player_gk = core_io.load_player_gk_ratings(client, season_id=int(season_id))
        gk_minutes = core_io.load_gk_minutes(client, season_id=int(season_id))
        history = core_io.load_rating_history(client, season_id=int(season_id))

        work = matches.copy()
        work = work.sort_values(["match_date", "sm_id"]).reset_index(drop=True)

        for _, row in work.iterrows():
            as_of_vec = _day_before(row["match_date"])
            home_id = int(row["home_team_sm_id"])
            away_id = int(row["away_team_sm_id"])
            home_v = assemble_rating_vector_from_frames(
                team_sm_id=home_id,
                season_id=int(season_id),
                as_of_date=as_of_vec,
                team_primaries=team_primaries,
                player_gk=player_gk if player_gk is not None and not player_gk.empty else None,
                gk_minutes=gk_minutes if gk_minutes is not None and not gk_minutes.empty else None,
                history=history if history is not None and not history.empty else None,
            )
            away_v = assemble_rating_vector_from_frames(
                team_sm_id=away_id,
                season_id=int(season_id),
                as_of_date=as_of_vec,
                team_primaries=team_primaries,
                player_gk=player_gk if player_gk is not None and not player_gk.empty else None,
                gk_minutes=gk_minutes if gk_minutes is not None and not gk_minutes.empty else None,
                history=history if history is not None and not history.empty else None,
            )
            if home_v.as_of_date >= str(row["match_date"])[:10]:
                continue
            if away_v.as_of_date >= str(row["match_date"])[:10]:
                continue
            if not home_v.is_complete() or not away_v.is_complete():
                continue
            home_used = max(
                (int(m.matches_used) for m in home_v.metadata.values()),
                default=0,
            )
            away_used = max(
                (int(m.matches_used) for m in away_v.metadata.values()),
                default=0,
            )
            if home_used < min_matches or away_used < min_matches:
                continue

            xg = estimate_expected_goals(
                home_v,
                away_v,
                MatchContext(),
                config=xg_cfg,
            )
            md = _as_date(row["match_date"])
            cache.append(
                CachedFixture(
                    match_sm_id=int(row["sm_id"]),
                    season_id=int(season_id),
                    match_date=md,
                    home_score=int(row["home_score"]),
                    away_score=int(row["away_score"]),
                    home_xg0=float(xg.home_xg),
                    away_xg0=float(xg.away_xg),
                    weight=time_weight(md, as_of=as_of_d, half_life_days=half_life_days),
                )
            )

    return cache


def build_fixture_cache_from_team_goal_rates(
    season_ids: Sequence[int],
    *,
    client=None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    as_of: Optional[date] = None,
    prior_match_shrink: int = 5,
) -> list[CachedFixture]:
    """
    Build λ from expanding team goal rates (Maher-style) within each season.

    Uses only past matches for each fixture (no leakage). Useful when rating
    vectors / prediction history are sparse for a prior season.
    """
    from core import io as core_io

    if client is None:
        client = core_io.get_supabase_client()

    as_of_d = as_of or date.today()
    cache: list[CachedFixture] = []

    for season_id in season_ids:
        matches = core_io.load_finished_matches(client, season_id=int(season_id))
        if matches is None or matches.empty:
            continue
        work = matches.copy()
        work["match_date"] = work["match_date"].map(lambda x: _as_date(x))
        work = work.sort_values(["match_date", "sm_id"]).reset_index(drop=True)

        # Expanding team stats: scored/conceded counts
        scored: dict[int, list[float]] = {}
        conceded: dict[int, list[float]] = {}
        league_goals: list[float] = []

        for _, row in work.iterrows():
            home_id = int(row["home_team_sm_id"])
            away_id = int(row["away_team_sm_id"])
            hs = float(row["home_score"])
            aws = float(row["away_score"])

            def _mean(vals: list[float], default: float) -> float:
                return float(sum(vals) / len(vals)) if vals else default

            # League prior from matches already played
            league_avg = _mean(league_goals, 1.35)
            home_att = _mean(scored.get(home_id, []), league_avg)
            home_def = _mean(conceded.get(home_id, []), league_avg)
            away_att = _mean(scored.get(away_id, []), league_avg)
            away_def = _mean(conceded.get(away_id, []), league_avg)

            n_home = len(scored.get(home_id, []))
            n_away = len(scored.get(away_id, []))
            # Require a few prior matches per side
            if n_home >= 3 and n_away >= 3:
                # Shrink early estimates toward league average
                def shrink(est: float, n: int) -> float:
                    return (n * est + prior_match_shrink * league_avg) / (
                        n + prior_match_shrink
                    )

                home_att_s = shrink(home_att, n_home)
                home_def_s = shrink(home_def, n_home)
                away_att_s = shrink(away_att, n_away)
                away_def_s = shrink(away_def, n_away)
                # Home advantage ~1.12 baked into home λ
                hx = max(0.2, home_att_s * away_def_s / max(league_avg, 0.5) * 1.12)
                ax = max(0.2, away_att_s * home_def_s / max(league_avg, 0.5))
                md = row["match_date"]
                cache.append(
                    CachedFixture(
                        match_sm_id=int(row["sm_id"]),
                        season_id=int(season_id),
                        match_date=md if isinstance(md, date) else _as_date(md),
                        home_score=int(hs),
                        away_score=int(aws),
                        home_xg0=float(hx),
                        away_xg0=float(ax),
                        weight=time_weight(
                            md if isinstance(md, date) else _as_date(md),
                            as_of=as_of_d,
                            half_life_days=half_life_days,
                        ),
                    )
                )

            scored.setdefault(home_id, []).append(hs)
            conceded.setdefault(home_id, []).append(aws)
            scored.setdefault(away_id, []).append(aws)
            conceded.setdefault(away_id, []).append(hs)
            league_goals.append(hs)
            league_goals.append(aws)

    return cache


def default_search_grid() -> dict[str, list[float]]:
    # NB k is the reciprocal dispersion: variance = λ + λ²/k.
    # Large k ≈ Poisson; small k is extreme overdispersion (avoid < 1 for football).
    return {
        "mu": [1.20, 1.28, 1.35, 1.42, 1.50, 1.58],
        "rho": [-0.13, -0.08, -0.04, 0.0, 0.04],
        "goal_overdispersion_k": [0.0, 12.0, 25.0],
        "lambda_gap_scale": [1.0, 1.6, 2.2, 2.8],
    }


def build_fixture_cache_from_prediction_history(
    season_ids: Sequence[int],
    *,
    client=None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    as_of: Optional[date] = None,
) -> list[CachedFixture]:
    """
    Prefer archived production λ from glpm_prediction_history joined to FT scores.

    This avoids PIT vector gaps early in a season and calibrates against the λ
    the product actually used.
    """
    from core import io as core_io

    if client is None:
        client = core_io.get_supabase_client()

    as_of_d = as_of or date.today()
    cache: list[CachedFixture] = []
    seen: set[int] = set()

    for season_id in season_ids:
        matches = core_io.load_finished_matches(client, season_id=int(season_id))
        if matches is None or matches.empty:
            continue
        match_by_id = {
            int(r["sm_id"]): r for _, r in matches.iterrows()
        }
        # Paginate prediction history for season
        rows: list[dict[str, Any]] = []
        start = 0
        page = 1000
        while True:
            res = (
                client.table("glpm_prediction_history")
                .select(
                    "match_sm_id,home_xg,away_xg,season_id,executed_at"
                )
                .eq("season_id", int(season_id))
                .order("executed_at", desc=False)
                .range(start, start + page - 1)
                .execute()
            )
            batch = res.data or []
            rows.extend(batch)
            if len(batch) < page:
                break
            start += page

        # First prediction per match (closest to pre-match archive intent)
        for row in rows:
            mid = row.get("match_sm_id")
            if mid is None:
                continue
            mid_i = int(mid)
            if mid_i in seen or mid_i not in match_by_id:
                continue
            m = match_by_id[mid_i]
            hx = row.get("home_xg")
            ax = row.get("away_xg")
            if hx is None or ax is None:
                continue
            md = _as_date(m["match_date"])
            seen.add(mid_i)
            cache.append(
                CachedFixture(
                    match_sm_id=mid_i,
                    season_id=int(season_id),
                    match_date=md,
                    home_score=int(m["home_score"]),
                    away_score=int(m["away_score"]),
                    home_xg0=float(hx),
                    away_xg0=float(ax),
                    weight=time_weight(md, as_of=as_of_d, half_life_days=half_life_days),
                )
            )

    return cache


def calibrate_score_grid(
    fixtures: Sequence[CachedFixture],
    *,
    competition_id: int,
    competition_name: str = "",
    season_ids: Sequence[int] = (),
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    brier_guardrail: float = DEFAULT_BRIER_GUARDRAIL,
    mode_11_penalty: float = DEFAULT_MODE_11_PENALTY,
    mu0: float = DEFAULT_MU0,
    search_grid: Optional[Mapping[str, Sequence[float]]] = None,
) -> ScoreGridCalibrationArtifact:
    grid = search_grid or default_search_grid()
    baseline_params = ScoreGridParams(
        mu=mu0,
        rho=DEFAULT_RHO,
        goal_overdispersion_k=0.0,
        lambda_gap_scale=1.0,
        attenuate_rho_for_gap=False,
        gap_positive_rho=False,
    )
    # Baseline = locked v1 behaviour (fixed ρ, no gap logic).
    baseline_metrics = evaluate_params_on_cache(
        fixtures,
        baseline_params,
        mu0=mu0,
    )

    best: Optional[ScoreGridParams] = None
    best_metrics: Optional[dict[str, float]] = None
    best_obj = float("inf")
    candidates_tried = 0

    for mu in grid.get("mu", [mu0]):
        for rho in grid.get("rho", [DEFAULT_RHO]):
            for k in grid.get("goal_overdispersion_k", [0.0]):
                for gap_scale in grid.get("lambda_gap_scale", [1.0]):
                    candidates_tried += 1
                    cand = ScoreGridParams(
                        mu=float(mu),
                        rho=float(rho),
                        goal_overdispersion_k=float(k),
                        lambda_gap_scale=float(gap_scale),
                        attenuate_rho_for_gap=True,
                        gap_positive_rho=True,
                    )
                    metrics = evaluate_params_on_cache(fixtures, cand, mu0=mu0)
                    if not math.isfinite(metrics["scoreline_ll"]):
                        continue
                    if metrics["brier_1x2"] > baseline_metrics["brier_1x2"] + brier_guardrail:
                        continue
                    obj = (
                        metrics["scoreline_ll"]
                        + float(mode_11_penalty) * metrics["mode_11_rate"]
                    )
                    if obj < best_obj:
                        best = cand
                        best_metrics = metrics
                        best_obj = obj

    if best is None or best_metrics is None:
        # Fall back to gap-aware defaults with locked μ/ρ if guardrail rejects all.
        best = ScoreGridParams(
            mu=mu0,
            rho=0.0,
            goal_overdispersion_k=0.0,
            lambda_gap_scale=2.0,
            attenuate_rho_for_gap=True,
            gap_positive_rho=True,
        )
        best_metrics = evaluate_params_on_cache(fixtures, best, mu0=mu0)

    return ScoreGridCalibrationArtifact(
        schema_version=CALIBRATION_SCHEMA_VERSION,
        competition_id=int(competition_id),
        competition_name=competition_name,
        season_ids=[int(s) for s in season_ids],
        params=best,
        baseline={k: float(v) for k, v in baseline_metrics.items()},
        calibrated={k: float(v) for k, v in best_metrics.items()},
        half_life_days=float(half_life_days),
        n_matches=len(fixtures),
        fitted_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        search={
            "grid": {k: list(v) for k, v in grid.items()},
            "candidates_tried": candidates_tried,
            "brier_guardrail": brier_guardrail,
            "mode_11_penalty": mode_11_penalty,
            "mu0": mu0,
            "best_objective": best_obj if math.isfinite(best_obj) else None,
        },
    )

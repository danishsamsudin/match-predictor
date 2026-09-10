"""
GLPM Match Prediction Models (Chapter 12).

Transforms Home / Away expected goals into a Dixon–Coles Goal Probability
Matrix and derived betting markets (1X2, Over/Under, BTTS).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Optional, Sequence, Union

import numpy as np

from engine.types import XgEngineResult

MODEL_VERSION = "glpm_pred_v1"
DEFAULT_RHO = -0.13
DEFAULT_MAX_GOALS = 9  # inclusive → 10×10 grid (goals 0..9)
DEFAULT_OU_LINES: tuple[float, ...] = (0.5, 1.5, 2.5, 3.5, 4.5)

# Dixon–Coles ρ fades toward 0 as |λH−λA| grows (mismatches).
RHO_GAP_ATTENUATION_START = 0.35
RHO_GAP_ATTENUATION_SPAN = 1.0
# Mild positive ρ floors for large λ gaps (deflates overstated 0-0 / 1-1).
RHO_GAP_POSITIVE_MID = 0.06
RHO_GAP_POSITIVE_WIDE = 0.10
RHO_GAP_POSITIVE_MID_START = 0.75
RHO_GAP_POSITIVE_WIDE_START = 1.25

XgInput = Union[float, XgEngineResult, Mapping[str, float]]


@dataclass(frozen=True)
class PredictionConfig:
    """Tunable knobs for the Match Prediction Models."""

    rho: float = DEFAULT_RHO
    max_goals: int = DEFAULT_MAX_GOALS
    ou_lines: tuple[float, ...] = DEFAULT_OU_LINES
    model_version: str = MODEL_VERSION
    # NB dispersion k (0 = Poisson). Variance = λ + λ²/k when k > 0.
    goal_overdispersion_k: float = 0.0
    attenuate_rho_for_gap: bool = True
    gap_positive_rho: bool = True


@dataclass
class PredictionResult:
    """Probabilistic forecast for a single fixture."""

    home_xg: float
    away_xg: float
    score_matrix: np.ndarray  # shape (max_goals+1, max_goals+1)
    home_win: float
    draw: float
    away_win: float
    btts_yes: float
    btts_no: float
    over_under: dict[str, dict[str, float]]
    rho: float
    effective_rho: float = 0.0
    goal_overdispersion_k: float = 0.0
    model_version: str = MODEL_VERSION
    executed_at: str = field(default="")

    def __post_init__(self) -> None:
        if not self.executed_at:
            self.executed_at = (
                datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "home_xg": self.home_xg,
            "away_xg": self.away_xg,
            "score_matrix": self.score_matrix.tolist(),
            "home_win": self.home_win,
            "draw": self.draw,
            "away_win": self.away_win,
            "btts_yes": self.btts_yes,
            "btts_no": self.btts_no,
            "over_under": self.over_under,
            "rho": self.rho,
            "effective_rho": self.effective_rho,
            "goal_overdispersion_k": self.goal_overdispersion_k,
            "model_version": self.model_version,
            "executed_at": self.executed_at,
        }

    def to_upsert_row(
        self,
        *,
        match_sm_id: Optional[int] = None,
        home_team_sm_id: Optional[int] = None,
        away_team_sm_id: Optional[int] = None,
        season_id: Optional[int] = None,
    ) -> dict[str, Any]:
        """Row shape for ``glpm_prediction_history`` insert."""
        row: dict[str, Any] = {
            "home_xg": round(self.home_xg, 4),
            "away_xg": round(self.away_xg, 4),
            "home_win_pct": self.home_win,
            "draw_pct": self.draw,
            "away_win_pct": self.away_win,
            "btts_yes_pct": self.btts_yes,
            "btts_no_pct": self.btts_no,
            "over_under": self.over_under,
            "score_matrix": self.score_matrix.tolist(),
            "rho": self.effective_rho if self.effective_rho else self.rho,
            "model_version": self.model_version,
            "executed_at": self.executed_at,
        }
        if match_sm_id is not None:
            row["match_sm_id"] = match_sm_id
        if home_team_sm_id is not None:
            row["home_team_sm_id"] = home_team_sm_id
        if away_team_sm_id is not None:
            row["away_team_sm_id"] = away_team_sm_id
        if season_id is not None:
            row["season_id"] = season_id
        return row


def _factorial(n: int) -> float:
    return float(math.factorial(n))


def poisson_pmf(k: int, lam: float) -> float:
    """Poisson probability mass at k for rate λ."""
    if lam < 0:
        raise ValueError(f"lambda must be non-negative, got {lam}")
    if k < 0:
        return 0.0
    if lam == 0.0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam**k) / _factorial(k)


def _log_combination(n: float, k: int) -> float:
    """log C(n, k) for real n ≥ k − 1 (NB rising factorial form)."""
    if k < 0:
        return float("-inf")
    if k == 0:
        return 0.0
    total = 0.0
    for i in range(k):
        total += math.log(n - i) - math.log(i + 1)
    return total


def goal_marginal_pmf(k: int, lam: float, k_disp: float = 0.0) -> float:
    """Goal count PMF: Poisson when k_disp≤0, else NB with mean λ and dispersion k."""
    if k < 0:
        return 0.0
    if k_disp <= 0 or not math.isfinite(k_disp):
        return poisson_pmf(k, lam)
    r = max(float(k_disp), 1e-6)
    safe_lam = max(float(lam), 1e-9)
    p = r / (r + safe_lam)
    # C(k+r-1, k) via rising factorial: (r)(r+1)…(r+k-1) / k!
    log_pmf = _log_combination(k + r - 1, k) + r * math.log(p) + k * math.log(1.0 - p)
    return math.exp(log_pmf)


def attenuate_rho_for_expected_goal_gap(
    rho: float,
    home_xg: float,
    away_xg: float,
) -> float:
    """Fade Dixon–Coles ρ toward 0 as |λH−λA| widens."""
    xg_diff = abs(float(home_xg) - float(away_xg))
    if xg_diff <= RHO_GAP_ATTENUATION_START:
        return float(rho)
    attenuation = max(
        0.0,
        1.0 - (xg_diff - RHO_GAP_ATTENUATION_START) / RHO_GAP_ATTENUATION_SPAN,
    )
    return float(rho) * attenuation


def resolve_effective_rho(
    base_rho: float,
    home_xg: float,
    away_xg: float,
    *,
    attenuate_for_gap: bool = True,
    gap_positive_rho: bool = True,
) -> float:
    """
    Effective Dixon–Coles ρ for a fixture.

    1. Optionally attenuate |base_rho| toward 0 as the λ gap grows.
    2. Optionally apply mild positive ρ floors on large gaps to deflate 0-0 / 1-1.
    """
    rho = (
        attenuate_rho_for_expected_goal_gap(base_rho, home_xg, away_xg)
        if attenuate_for_gap
        else float(base_rho)
    )
    if gap_positive_rho:
        diff = abs(float(home_xg) - float(away_xg))
        if diff >= RHO_GAP_POSITIVE_WIDE_START:
            rho = max(rho, RHO_GAP_POSITIVE_WIDE)
        elif diff >= RHO_GAP_POSITIVE_MID_START:
            rho = max(rho, RHO_GAP_POSITIVE_MID)
    return float(rho)


def dixon_coles_tau(
    home_goals: int,
    away_goals: int,
    home_xg: float,
    away_xg: float,
    rho: float,
) -> float:
    """Dixon–Coles low-score correlation adjustment τ."""
    if home_goals == 0 and away_goals == 0:
        return 1.0 - home_xg * away_xg * rho
    if home_goals == 0 and away_goals == 1:
        return 1.0 + home_xg * rho
    if home_goals == 1 and away_goals == 0:
        return 1.0 + away_xg * rho
    if home_goals == 1 and away_goals == 1:
        return 1.0 - rho
    return 1.0


def score_probability(
    home_goals: int,
    away_goals: int,
    home_xg: float,
    away_xg: float,
    rho: float = 0.0,
    *,
    goal_overdispersion_k: float = 0.0,
) -> float:
    """Unnormalized P(home_goals, away_goals) under Poisson/NB × τ."""
    base = goal_marginal_pmf(
        home_goals, home_xg, goal_overdispersion_k
    ) * goal_marginal_pmf(away_goals, away_xg, goal_overdispersion_k)
    if rho == 0.0:
        return base
    return base * dixon_coles_tau(home_goals, away_goals, home_xg, away_xg, rho)


def build_score_matrix(
    home_xg: float,
    away_xg: float,
    *,
    max_goals: int = DEFAULT_MAX_GOALS,
    rho: float = DEFAULT_RHO,
    goal_overdispersion_k: float = 0.0,
    attenuate_rho_for_gap: bool = True,
    gap_positive_rho: bool = True,
    apply_effective_rho: bool = True,
) -> np.ndarray:
    """
    Build a renormalized (max_goals+1) × (max_goals+1) Goal Probability Matrix.

    Indices are home goals (rows) and away goals (columns), each from 0..max_goals.
    When ``apply_effective_rho`` is True (default), ``rho`` is gap-adjusted first.
    """
    if max_goals < 0:
        raise ValueError(f"max_goals must be >= 0, got {max_goals}")
    effective_rho = (
        resolve_effective_rho(
            rho,
            home_xg,
            away_xg,
            attenuate_for_gap=attenuate_rho_for_gap,
            gap_positive_rho=gap_positive_rho,
        )
        if apply_effective_rho
        else float(rho)
    )
    n = max_goals + 1
    matrix = np.zeros((n, n), dtype=float)
    for h in range(n):
        for a in range(n):
            matrix[h, a] = score_probability(
                h,
                a,
                home_xg,
                away_xg,
                effective_rho,
                goal_overdispersion_k=goal_overdispersion_k,
            )
    total = float(matrix.sum())
    if total <= 0.0:
        raise ValueError("score matrix has zero total probability mass")
    return matrix / total


def derive_1x2(score_matrix: np.ndarray) -> tuple[float, float, float]:
    """Aggregate Home Win / Draw / Away Win from the score matrix."""
    home_win = 0.0
    draw = 0.0
    away_win = 0.0
    n_h, n_a = score_matrix.shape
    for h in range(n_h):
        for a in range(n_a):
            p = float(score_matrix[h, a])
            if h > a:
                home_win += p
            elif h == a:
                draw += p
            else:
                away_win += p
    total = home_win + draw + away_win
    if total <= 0.0:
        return 0.0, 0.0, 0.0
    return home_win / total, draw / total, away_win / total


def derive_over_under(
    score_matrix: np.ndarray,
    lines: Sequence[float] = DEFAULT_OU_LINES,
) -> dict[str, dict[str, float]]:
    """Over/Under probabilities for each total-goals line."""
    result: dict[str, dict[str, float]] = {}
    n_h, n_a = score_matrix.shape
    for line in lines:
        over = 0.0
        for h in range(n_h):
            for a in range(n_a):
                if h + a > line:
                    over += float(score_matrix[h, a])
        under = 1.0 - over
        key = str(line)
        result[key] = {"over": over, "under": under}
    return result


def derive_btts(score_matrix: np.ndarray) -> tuple[float, float]:
    """Both Teams To Score Yes / No from the score matrix."""
    yes = 0.0
    n_h, n_a = score_matrix.shape
    for h in range(n_h):
        for a in range(n_a):
            if h > 0 and a > 0:
                yes += float(score_matrix[h, a])
    return yes, 1.0 - yes


def _resolve_xg(value: XgInput, side: str) -> float:
    if isinstance(value, XgEngineResult):
        return float(value.home_xg if side == "home" else value.away_xg)
    if isinstance(value, Mapping):
        key = "home_xg" if side == "home" else "away_xg"
        if key not in value:
            raise KeyError(f"mapping missing '{key}'")
        return float(value[key])
    return float(value)


def predict_match(
    home_xg: XgInput,
    away_xg: Optional[XgInput] = None,
    *,
    config: Optional[PredictionConfig] = None,
    executed_at: Optional[str] = None,
) -> PredictionResult:
    """
    Convert Home / Away expected goals into market probabilities.

    Parameters
    ----------
    home_xg:
        Home expected goals, an ``XgEngineResult``, or a mapping with ``home_xg``.
        When an ``XgEngineResult`` (or full mapping) is passed alone, ``away_xg``
        may be omitted.
    away_xg:
        Away expected goals (required unless ``home_xg`` carries both sides).
    config:
        Optional prediction knobs; defaults to ``PredictionConfig()``.
    executed_at:
        Optional ISO-8601 UTC timestamp; defaults to now.
    """
    cfg = config or PredictionConfig()

    if away_xg is None:
        if isinstance(home_xg, XgEngineResult):
            hx = float(home_xg.home_xg)
            ax = float(home_xg.away_xg)
        elif isinstance(home_xg, Mapping) and "away_xg" in home_xg:
            hx = float(home_xg["home_xg"])
            ax = float(home_xg["away_xg"])
        else:
            raise TypeError(
                "away_xg is required unless home_xg is an XgEngineResult "
                "or a mapping containing both home_xg and away_xg"
            )
    else:
        hx = _resolve_xg(home_xg, "home")
        ax = _resolve_xg(away_xg, "away")

    if hx < 0 or ax < 0:
        raise ValueError(f"expected goals must be non-negative, got home={hx}, away={ax}")

    effective_rho = resolve_effective_rho(
        cfg.rho,
        hx,
        ax,
        attenuate_for_gap=cfg.attenuate_rho_for_gap,
        gap_positive_rho=cfg.gap_positive_rho,
    )
    matrix = build_score_matrix(
        hx,
        ax,
        max_goals=cfg.max_goals,
        rho=effective_rho,
        goal_overdispersion_k=cfg.goal_overdispersion_k,
        apply_effective_rho=False,
    )
    home_win, draw, away_win = derive_1x2(matrix)
    btts_yes, btts_no = derive_btts(matrix)
    over_under = derive_over_under(matrix, cfg.ou_lines)

    return PredictionResult(
        home_xg=hx,
        away_xg=ax,
        score_matrix=matrix,
        home_win=home_win,
        draw=draw,
        away_win=away_win,
        btts_yes=btts_yes,
        btts_no=btts_no,
        over_under=over_under,
        rho=cfg.rho,
        effective_rho=effective_rho,
        goal_overdispersion_k=cfg.goal_overdispersion_k,
        model_version=cfg.model_version,
        executed_at=executed_at
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )

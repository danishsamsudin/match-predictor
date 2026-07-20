"""
GLPM Expected Goals Engine (Chapter 11).

Transforms Home / Away Rating Vectors and match context into deterministic
expected goals (xG_H, xG_A), reusing the validated Graham μ · exp(c · ΔS)
structure with the seven-dimensional interaction matrix as the strength front-end.
"""

from __future__ import annotations

from typing import Mapping

import numpy as np

from core.vector import RatingVector
from engine.config import XgEngineConfig
from engine.context import resolve_context_multipliers
from engine.interactions import compute_interaction_matrix
from engine.types import MatchContext, XgEngineResult


def _clamp_xg(value: float, *, floor: float, ceiling: float) -> float:
    return float(np.clip(value, floor, ceiling))


def baseline_xg_from_delta_s(delta_s: float, *, mu: float, strength_exponent: float) -> float:
    """Map a side strength index to baseline expected goals."""
    return float(mu * np.exp(strength_exponent * delta_s))


def estimate_expected_goals(
    home: RatingVector | Mapping[str, float],
    away: RatingVector | Mapping[str, float],
    context: MatchContext | None = None,
    *,
    config: XgEngineConfig | None = None,
) -> XgEngineResult:
    """
    Estimate Home and Away expected goals for a fixture.

    Parameters
    ----------
    home, away:
        GLPM Rating Vectors (or plain mappings of primary keys → 0–100 scores).
    context:
        Optional match context (home advantage, rest, travel, venue).
        When omitted, a standard home fixture with weekly rest and no travel
        is assumed (``MatchContext()`` defaults).
    config:
        Optional engine knobs; defaults to ``XgEngineConfig()``.
    """
    cfg = config or XgEngineConfig()
    ctx = context if context is not None else MatchContext()

    matrix = compute_interaction_matrix(home, away, cfg)
    ctx_mult = resolve_context_multipliers(ctx, cfg)

    mu = float(ctx.competition_mu) if ctx.competition_mu is not None else float(cfg.mu)
    c = float(cfg.strength_exponent)

    home_base = baseline_xg_from_delta_s(matrix.home.delta_s, mu=mu, strength_exponent=c)
    away_base = baseline_xg_from_delta_s(matrix.away.delta_s, mu=mu, strength_exponent=c)

    home_xg = _clamp_xg(
        home_base * ctx_mult.home,
        floor=cfg.xg_floor,
        ceiling=cfg.xg_ceiling,
    )
    away_xg = _clamp_xg(
        away_base * ctx_mult.away,
        floor=cfg.xg_floor,
        ceiling=cfg.xg_ceiling,
    )

    return XgEngineResult(
        home_xg=home_xg,
        away_xg=away_xg,
        interactions={
            **matrix.to_dict(),
            "home_baseline_xg": home_base,
            "away_baseline_xg": away_base,
            "mu": mu,
            "strength_exponent": c,
        },
        context=ctx_mult.to_dict(),
        model_version=cfg.model_version,
    )

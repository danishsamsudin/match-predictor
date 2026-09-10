"""GLPM Expected Goals Engine: Rating Vectors → Home / Away xG (Chapter 11).

Also exports Match Prediction Models (Chapter 12): xG → score matrix / markets.
"""

from engine.config import XgEngineConfig
from engine.predictions import (
    PredictionConfig,
    PredictionResult,
    attenuate_rho_for_expected_goal_gap,
    build_score_matrix,
    derive_1x2,
    derive_btts,
    derive_over_under,
    predict_match,
    resolve_effective_rho,
)
from engine.types import MatchContext, XgEngineResult
from engine.xg_engine import baseline_xg_from_delta_s, estimate_expected_goals

__all__ = [
    "MatchContext",
    "PredictionConfig",
    "PredictionResult",
    "XgEngineConfig",
    "XgEngineResult",
    "attenuate_rho_for_expected_goal_gap",
    "baseline_xg_from_delta_s",
    "build_score_matrix",
    "derive_1x2",
    "derive_btts",
    "derive_over_under",
    "estimate_expected_goals",
    "predict_match",
    "resolve_effective_rho",
]

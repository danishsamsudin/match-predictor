"""
GLPM Expected Goals Engine configuration (Chapter 11).

Defaults port the Graham μ · exp(±c · ΔS) structure with locked interaction
weights for the seven-dimensional Rating Vector.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping


# Interaction pair weights (must sum to 1.0): Attack–Defence dominant.
DEFAULT_INTERACTION_WEIGHTS: dict[str, float] = {
    "attack_defence": 0.40,
    "finishing_goalkeeper": 0.25,
    "build_up_pressing": 0.20,
    "possession_pressing": 0.15,
}

# Rating centering: GLPM “Average” band start (Chapter 3.15).
DEFAULT_RATING_CENTER = 60.0
DEFAULT_RATING_SCALE = 20.0

# Club-scale baseline expected goals per side.
DEFAULT_MU_XG = 1.35

# Strength exponent: +20 Attack–Defence edge (weighted ΔS ≈ 0.40) → ~+12% xG.
DEFAULT_STRENGTH_EXPONENT = 0.28

# Soft safety rail on |ΔS| in z-score space (max realistic ~2.0).
DEFAULT_DELTA_S_CAP = 3.0

# Home advantage (mirrors stadium-impact HOME_CITY_XG_MULTIPLIER).
DEFAULT_HOME_ADVANTAGE = 1.12

# Rest: weekly baseline and congestion threshold (days).
DEFAULT_REST_BASELINE_DAYS = 7.0
DEFAULT_CONGESTION_DAYS = 4.0
DEFAULT_CONGESTION_PENALTY = 0.97  # soft extra hit when rest ≤ congestion threshold

# Travel distance bands (km) → xG multipliers.
DEFAULT_TRAVEL_LONG_KM = 1500.0
DEFAULT_TRAVEL_MODERATE_KM = 500.0
DEFAULT_TRAVEL_LONG_MULT = 0.95
DEFAULT_TRAVEL_MODERATE_MULT = 0.98

# Venue altitude (m): visitor mild penalty when above threshold.
DEFAULT_ALTITUDE_THRESHOLD_M = 1000.0
DEFAULT_ALTITUDE_AWAY_PENALTY = 0.97

# Soft xG clamps after context.
DEFAULT_XG_FLOOR = 0.15
DEFAULT_XG_CEILING = 4.5

MODEL_VERSION = "glpm_xg_v1"


@dataclass(frozen=True)
class XgEngineConfig:
    """Tunable knobs for the Expected Goals Engine."""

    interaction_weights: Mapping[str, float] = field(
        default_factory=lambda: dict(DEFAULT_INTERACTION_WEIGHTS)
    )
    rating_center: float = DEFAULT_RATING_CENTER
    rating_scale: float = DEFAULT_RATING_SCALE
    mu: float = DEFAULT_MU_XG
    strength_exponent: float = DEFAULT_STRENGTH_EXPONENT
    delta_s_cap: float = DEFAULT_DELTA_S_CAP
    home_advantage: float = DEFAULT_HOME_ADVANTAGE
    rest_baseline_days: float = DEFAULT_REST_BASELINE_DAYS
    congestion_days: float = DEFAULT_CONGESTION_DAYS
    congestion_penalty: float = DEFAULT_CONGESTION_PENALTY
    travel_long_km: float = DEFAULT_TRAVEL_LONG_KM
    travel_moderate_km: float = DEFAULT_TRAVEL_MODERATE_KM
    travel_long_mult: float = DEFAULT_TRAVEL_LONG_MULT
    travel_moderate_mult: float = DEFAULT_TRAVEL_MODERATE_MULT
    altitude_threshold_m: float = DEFAULT_ALTITUDE_THRESHOLD_M
    altitude_away_penalty: float = DEFAULT_ALTITUDE_AWAY_PENALTY
    xg_floor: float = DEFAULT_XG_FLOOR
    xg_ceiling: float = DEFAULT_XG_CEILING
    model_version: str = MODEL_VERSION

    def normalized_weights(self) -> dict[str, float]:
        keys = (
            "attack_defence",
            "finishing_goalkeeper",
            "build_up_pressing",
            "possession_pressing",
        )
        raw = {k: float(self.interaction_weights.get(k, DEFAULT_INTERACTION_WEIGHTS[k])) for k in keys}
        total = sum(raw.values())
        if total <= 0:
            return dict(DEFAULT_INTERACTION_WEIGHTS)
        return {k: v / total for k, v in raw.items()}

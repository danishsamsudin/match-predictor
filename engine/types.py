"""Data exchange models for the GLPM Expected Goals Engine (Chapter 11)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class MatchContext:
    """
    Match-specific contextual variables (Chapter 11.7).

    When ``home_context_multiplier`` / ``away_context_multiplier`` are set they
    replace the computed product of home-advantage, rest, travel, and venue.
    """

    is_neutral_venue: bool = False
    home_rest_days: float = 7.0
    away_rest_days: float = 7.0
    home_travel_km: float = 0.0
    away_travel_km: float = 0.0
    venue_altitude_m: Optional[float] = None
    competition_mu: Optional[float] = None
    home_context_multiplier: Optional[float] = None
    away_context_multiplier: Optional[float] = None


@dataclass
class XgEngineResult:
    """Deterministic Home / Away expected goals plus diagnostics."""

    home_xg: float
    away_xg: float
    interactions: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    model_version: str = "glpm_xg_v1"

    def to_dict(self) -> dict[str, Any]:
        return {
            "home_xg": self.home_xg,
            "away_xg": self.away_xg,
            "interactions": self.interactions,
            "context": self.context,
            "model_version": self.model_version,
        }

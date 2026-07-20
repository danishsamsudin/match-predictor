"""
Match context multipliers for the Expected Goals Engine (Chapter 11.7).

Ports proven constants from the club stadium-impact and WC rest-delta helpers
into a fixture-level prediction context (separate from rating-training features).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from engine.config import XgEngineConfig
from engine.types import MatchContext


def rest_days_multiplier(rest_days: float, config: XgEngineConfig) -> float:
    """
    Map rest days → xG multiplier.

    Adapted from WC ``computeRestDelta`` (hours): ≥3 days → 1.0, 0 days → 0.85,
    linear in between. Soft congestion penalty when rest ≤ congestion threshold.
    """
    days = float(rest_days) if rest_days is not None else config.rest_baseline_days
    if days >= 3.0:
        base = 1.0
    elif days <= 0.0:
        base = 0.85
    else:
        # Mirror (72 - restHours) / 240 with restHours = days * 24
        base = 1.0 - (3.0 - days) / 10.0

    if days <= config.congestion_days:
        base *= config.congestion_penalty

    return float(max(0.82, min(1.0, base)))


def travel_multiplier(distance_km: float, config: XgEngineConfig) -> float:
    """Distance-band fatigue (club stadium-impact δ_travel)."""
    d = float(distance_km) if distance_km is not None else 0.0
    if d > config.travel_long_km:
        return float(config.travel_long_mult)
    if d > config.travel_moderate_km:
        return float(config.travel_moderate_mult)
    return 1.0


def home_advantage_multiplier(is_neutral: bool, config: XgEngineConfig) -> float:
    if is_neutral:
        return 1.0
    return float(config.home_advantage)


def venue_altitude_multipliers(
    altitude_m: float | None,
    config: XgEngineConfig,
) -> tuple[float, float]:
    """
    Mild visitor penalty at high altitude (home assumed acclimatised).

    Returns (home_mult, away_mult).
    """
    if altitude_m is None:
        return 1.0, 1.0
    alt = float(altitude_m)
    if not (alt > config.altitude_threshold_m):
        return 1.0, 1.0
    return 1.0, float(config.altitude_away_penalty)


@dataclass(frozen=True)
class ContextMultipliers:
    home: float
    away: float
    components: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "home_multiplier": self.home,
            "away_multiplier": self.away,
            "components": dict(self.components),
        }


def resolve_context_multipliers(
    context: MatchContext | None,
    config: XgEngineConfig,
) -> ContextMultipliers:
    """Compose §11.7 home-advantage, rest, travel, and venue multipliers."""
    ctx = context or MatchContext()

    if ctx.home_context_multiplier is not None and ctx.away_context_multiplier is not None:
        return ContextMultipliers(
            home=float(ctx.home_context_multiplier),
            away=float(ctx.away_context_multiplier),
            components={
                "override": True,
                "home_context_multiplier": float(ctx.home_context_multiplier),
                "away_context_multiplier": float(ctx.away_context_multiplier),
            },
        )

    ha_home = home_advantage_multiplier(ctx.is_neutral_venue, config)
    ha_away = 1.0

    rest_home = rest_days_multiplier(ctx.home_rest_days, config)
    rest_away = rest_days_multiplier(ctx.away_rest_days, config)

    travel_home = travel_multiplier(ctx.home_travel_km, config)
    travel_away = travel_multiplier(ctx.away_travel_km, config)

    alt_home, alt_away = venue_altitude_multipliers(ctx.venue_altitude_m, config)

    home = ha_home * rest_home * travel_home * alt_home
    away = ha_away * rest_away * travel_away * alt_away

    return ContextMultipliers(
        home=float(home),
        away=float(away),
        components={
            "override": False,
            "is_neutral_venue": bool(ctx.is_neutral_venue),
            "home_advantage": ha_home,
            "away_advantage": ha_away,
            "home_rest": rest_home,
            "away_rest": rest_away,
            "home_travel": travel_home,
            "away_travel": travel_away,
            "home_altitude": alt_home,
            "away_altitude": alt_away,
            "home_rest_days": float(ctx.home_rest_days),
            "away_rest_days": float(ctx.away_rest_days),
            "home_travel_km": float(ctx.home_travel_km),
            "away_travel_km": float(ctx.away_travel_km),
            "venue_altitude_m": ctx.venue_altitude_m,
        },
    )

"""Unit tests for the GLPM Expected Goals Engine (Chapter 11)."""

from __future__ import annotations

import math

import pytest

from core.vector import PRIMARY_ORDER, RatingVector
from engine import MatchContext, XgEngineConfig, estimate_expected_goals
from engine.context import (
    home_advantage_multiplier,
    resolve_context_multipliers,
    rest_days_multiplier,
    travel_multiplier,
    venue_altitude_multipliers,
)
from engine.interactions import compute_interaction_matrix


def _avg_vector(**overrides: float) -> dict[str, float]:
    base = {k: 60.0 for k in PRIMARY_ORDER}
    base.update(overrides)
    return base


def test_equal_average_vectors_neutral_near_mu() -> None:
    cfg = XgEngineConfig()
    result = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(is_neutral_venue=True),
        config=cfg,
    )
    assert result.home_xg == pytest.approx(cfg.mu, rel=1e-6)
    assert result.away_xg == pytest.approx(cfg.mu, rel=1e-6)
    assert result.model_version == "glpm_xg_v1"


def test_strong_home_attack_raises_home_xg() -> None:
    home = _avg_vector(attack=85.0, finishing=80.0)
    away = _avg_vector(defence=40.0, goalkeeper=45.0)
    result = estimate_expected_goals(
        home,
        away,
        MatchContext(is_neutral_venue=True),
    )
    assert result.home_xg > result.away_xg
    assert result.interactions["home"]["attack_defence"] > 0
    assert result.interactions["home"]["finishing_goalkeeper"] > 0


def test_strong_away_attack_raises_away_xg() -> None:
    home = _avg_vector()
    away = _avg_vector(attack=90.0, finishing=88.0, build_up=80.0)
    result = estimate_expected_goals(
        home,
        away,
        MatchContext(is_neutral_venue=True),
    )
    assert result.away_xg > result.home_xg
    assert result.interactions["away"]["delta_s"] > result.interactions["home"]["delta_s"]


def test_home_advantage_boosts_home_xg() -> None:
    cfg = XgEngineConfig()
    vectors = (_avg_vector(), _avg_vector())
    neutral = estimate_expected_goals(*vectors, MatchContext(is_neutral_venue=True), config=cfg)
    home_fixture = estimate_expected_goals(
        *vectors,
        MatchContext(is_neutral_venue=False),
        config=cfg,
    )
    assert home_fixture.home_xg == pytest.approx(neutral.home_xg * cfg.home_advantage, rel=1e-6)
    assert home_fixture.away_xg == pytest.approx(neutral.away_xg, rel=1e-6)
    assert home_fixture.context["components"]["home_advantage"] == cfg.home_advantage


def test_neutral_venue_removes_home_boost() -> None:
    cfg = XgEngineConfig()
    mult = home_advantage_multiplier(True, cfg)
    assert mult == 1.0
    resolved = resolve_context_multipliers(MatchContext(is_neutral_venue=True), cfg)
    assert resolved.home == pytest.approx(1.0)
    assert resolved.away == pytest.approx(1.0)


def test_rest_deficit_reduces_multiplier() -> None:
    cfg = XgEngineConfig()
    fresh = rest_days_multiplier(7.0, cfg)
    congested = rest_days_multiplier(3.0, cfg)
    exhausted = rest_days_multiplier(1.0, cfg)
    assert fresh == 1.0
    assert congested < fresh  # congestion soft penalty at ≤4 days
    assert exhausted < congested

    result = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(
            is_neutral_venue=True,
            home_rest_days=1.0,
            away_rest_days=7.0,
        ),
        config=cfg,
    )
    assert result.home_xg < result.away_xg
    assert result.context["components"]["home_rest"] < result.context["components"]["away_rest"]


def test_long_travel_reduces_away_xg() -> None:
    cfg = XgEngineConfig()
    assert travel_multiplier(2000.0, cfg) == cfg.travel_long_mult
    assert travel_multiplier(800.0, cfg) == cfg.travel_moderate_mult
    assert travel_multiplier(100.0, cfg) == 1.0

    base = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(is_neutral_venue=True, away_travel_km=0.0),
        config=cfg,
    )
    travelled = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(is_neutral_venue=True, away_travel_km=2000.0),
        config=cfg,
    )
    assert travelled.away_xg == pytest.approx(base.away_xg * cfg.travel_long_mult, rel=1e-6)
    assert travelled.home_xg == pytest.approx(base.home_xg, rel=1e-6)


def test_altitude_penalises_away() -> None:
    cfg = XgEngineConfig()
    home_m, away_m = venue_altitude_multipliers(1800.0, cfg)
    assert home_m == 1.0
    assert away_m == cfg.altitude_away_penalty

    result = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(is_neutral_venue=True, venue_altitude_m=1800.0),
        config=cfg,
    )
    assert result.context["components"]["away_altitude"] == cfg.altitude_away_penalty
    assert result.away_xg < result.home_xg


def test_partial_vectors_produce_finite_outputs() -> None:
    home = {"attack": 70.0, "finishing": 65.0}  # missing other keys
    away = {"defence": 55.0}
    result = estimate_expected_goals(
        home,
        away,
        MatchContext(is_neutral_venue=True),
    )
    assert math.isfinite(result.home_xg)
    assert math.isfinite(result.away_xg)
    assert result.home_xg >= result.interactions["mu"] * 0.5  # within soft clamps


def test_rating_vector_dataclass_accepted() -> None:
    home = RatingVector.from_mapping(
        team_sm_id=1,
        season_id=1,
        as_of_date="2026-01-01",
        ratings=_avg_vector(attack=75.0),
    )
    away = RatingVector.from_mapping(
        team_sm_id=2,
        season_id=1,
        as_of_date="2026-01-01",
        ratings=_avg_vector(defence=50.0),
    )
    result = estimate_expected_goals(home, away, MatchContext(is_neutral_venue=True))
    assert result.home_xg > result.away_xg


def test_interaction_matrix_pairs() -> None:
    cfg = XgEngineConfig()
    matrix = compute_interaction_matrix(
        _avg_vector(attack=80.0, finishing=70.0, build_up=65.0, possession=62.0),
        _avg_vector(defence=50.0, goalkeeper=55.0, pressing=58.0),
        cfg,
    )
    assert matrix.home.attack_defence > 0
    assert matrix.home.finishing_goalkeeper > 0
    assert "attack_defence" in matrix.home.to_dict()
    # Away attacking into average home defence → near-neutral away ΔS
    assert abs(matrix.away.delta_s) < abs(matrix.home.delta_s)


def test_competition_mu_override() -> None:
    result = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(is_neutral_venue=True, competition_mu=1.5),
    )
    assert result.home_xg == pytest.approx(1.5, rel=1e-6)
    assert result.interactions["mu"] == 1.5


def test_context_multiplier_override() -> None:
    result = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(
            is_neutral_venue=False,
            home_context_multiplier=1.05,
            away_context_multiplier=0.9,
        ),
    )
    assert result.context["components"]["override"] is True
    assert result.home_xg == pytest.approx(1.35 * 1.05, rel=1e-6)
    assert result.away_xg == pytest.approx(1.35 * 0.9, rel=1e-6)


def test_attack_defence_edge_moves_xg_about_twelve_percent() -> None:
    """+20 Attack vs Defence edge (weight 0.40) → ΔS=0.40 → ~+12% with c=0.28."""
    cfg = XgEngineConfig()
    base = estimate_expected_goals(
        _avg_vector(),
        _avg_vector(),
        MatchContext(is_neutral_venue=True),
        config=cfg,
    )
    edged = estimate_expected_goals(
        _avg_vector(attack=80.0),
        _avg_vector(defence=60.0),
        MatchContext(is_neutral_venue=True),
        config=cfg,
    )
    ratio = edged.home_xg / base.home_xg
    assert 1.10 <= ratio <= 1.15

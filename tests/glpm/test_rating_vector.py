"""Unit tests for GLPM Rating Vector assembly and Bayesian updating."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.bayesian import (
    DEFAULT_PRIOR_MEAN,
    inflate_prior_variance,
    initial_prior_vector,
    update_dimension,
    update_vector,
)
from core.vector import PRIMARY_ORDER, RatingMetadata, RatingVector, classify_trend
from core.vector_assembly import (
    aggregate_team_goalkeeper,
    assemble_rating_vector_from_frames,
)


def test_rating_vector_order_matches_chapter_10():
    rv = RatingVector.from_mapping(
        team_sm_id=1,
        season_id=1,
        as_of_date="2025-01-01",
        ratings={
            "attack": 88,
            "defence": 81,
            "goalkeeper": 79,
            "build_up": 85,
            "possession": 84,
            "pressing": 80,
            "finishing": 90,
        },
    )
    assert PRIMARY_ORDER == (
        "attack",
        "defence",
        "goalkeeper",
        "build_up",
        "possession",
        "pressing",
        "finishing",
    )
    np.testing.assert_allclose(rv.to_array(), [88, 81, 79, 85, 84, 80, 90])
    assert rv.is_complete()


def test_missing_finishing_is_nan_slot():
    rv = RatingVector.from_mapping(
        team_sm_id=1,
        season_id=1,
        as_of_date="2025-01-01",
        ratings={
            "attack": 70,
            "defence": 71,
            "goalkeeper": 72,
            "build_up": 73,
            "possession": 74,
            "pressing": 75,
        },
    )
    assert np.isnan(rv.get("finishing"))
    assert not rv.is_complete()
    assert rv.metadata["finishing"].confidence == 0.0
    row = rv.to_db_row()
    assert row["r_finishing"] is None
    assert row["r_attack"] == 70.0


def test_minutes_weighted_gk_aggregation():
    player_gk = pd.DataFrame(
        [
            {
                "player_sm_id": 1,
                "team_sm_id": 10,
                "season_id": 5,
                "as_of_date": "2025-06-01",
                "rating": 90.0,
                "confidence": 0.9,
                "variance": 4.0,
            },
            {
                "player_sm_id": 2,
                "team_sm_id": 10,
                "season_id": 5,
                "as_of_date": "2025-06-01",
                "rating": 60.0,
                "confidence": 0.4,
                "variance": 36.0,
            },
        ]
    )
    minutes = pd.DataFrame(
        [
            {"player_sm_id": 1, "team_sm_id": 10, "season_id": 5, "minutes_played": 2700},
            {"player_sm_id": 2, "team_sm_id": 10, "season_id": 5, "minutes_played": 300},
        ]
    )
    meta = aggregate_team_goalkeeper(
        player_gk,
        minutes,
        team_sm_id=10,
        season_id=5,
        as_of_date="2025-06-01",
    )
    assert meta is not None
    expected = (90.0 * 2700 + 60.0 * 300) / 3000
    assert meta.current_value == pytest.approx(expected)


def test_assemble_from_frames_pivots_correctly():
    as_of = "2025-11-01"
    rows = []
    for rtype, rating in [
        ("attack", 80),
        ("defence", 70),
        ("build_up", 75),
        ("possession", 72),
        ("pressing", 68),
        ("finishing", 85),
    ]:
        rows.append(
            {
                "team_sm_id": 3,
                "season_id": 9,
                "rating_type": rtype,
                "as_of_date": as_of,
                "rating": rating,
                "confidence": 0.6,
                "variance": 9.0,
                "matches_used": 8,
                "recent_trend": "up",
                "trend_delta": 1.5,
                "historical_peak": rating,
                "historical_low": rating - 5,
            }
        )
    team_primaries = pd.DataFrame(rows)
    player_gk = pd.DataFrame(
        [
            {
                "player_sm_id": 50,
                "team_sm_id": 3,
                "season_id": 9,
                "as_of_date": as_of,
                "rating": 77.0,
                "confidence": 0.7,
                "variance": 10.0,
            }
        ]
    )
    rv = assemble_rating_vector_from_frames(
        team_sm_id=3,
        season_id=9,
        as_of_date=as_of,
        team_primaries=team_primaries,
        player_gk=player_gk,
        gk_minutes=None,
    )
    np.testing.assert_allclose(rv.to_array(), [80, 70, 77, 75, 72, 68, 85])
    assert rv.metadata["attack"].matches_used == 8


def test_as_of_ignores_future_rows():
    team_primaries = pd.DataFrame(
        [
            {
                "team_sm_id": 1,
                "season_id": 1,
                "rating_type": "attack",
                "as_of_date": "2025-01-01",
                "rating": 60.0,
                "confidence": 0.5,
                "variance": 16.0,
                "matches_used": 2,
            },
            {
                "team_sm_id": 1,
                "season_id": 1,
                "rating_type": "attack",
                "as_of_date": "2025-06-01",
                "rating": 90.0,
                "confidence": 0.9,
                "variance": 4.0,
                "matches_used": 10,
            },
        ]
    )
    rv = assemble_rating_vector_from_frames(
        team_sm_id=1,
        season_id=1,
        as_of_date="2025-03-01",
        team_primaries=team_primaries,
    )
    assert rv.get("attack") == 60.0


def test_bayesian_posterior_between_prior_and_obs():
    mu, var, conf, n = update_dimension(
        50.0,
        400.0,
        80.0,
        16.0,
        obs_confidence=1.0,
        delta_days=0.0,
        prior_matches=0,
    )
    assert 50.0 < mu < 80.0
    assert var < 400.0
    assert n == 1
    assert 0.0 < conf <= 1.0


def test_bayesian_variance_shrinks_with_confident_obs():
    _, var_weak, _, _ = update_dimension(
        50.0, 400.0, 70.0, 100.0, obs_confidence=0.2, prior_matches=5
    )
    _, var_strong, _, _ = update_dimension(
        50.0, 400.0, 70.0, 4.0, obs_confidence=1.0, prior_matches=5
    )
    assert var_strong < var_weak


def test_time_decay_inflates_prior_variance():
    base = 25.0
    inflated = inflate_prior_variance(base, delta_days=90.0, half_life_days=90.0)
    assert inflated == pytest.approx(50.0, rel=1e-6)
    long_gap = inflate_prior_variance(base, delta_days=365.0, half_life_days=90.0)
    assert long_gap > inflated


def test_update_vector_clamps_and_trends():
    prior = initial_prior_vector(team_sm_id=1, season_id=1, as_of_date="2025-01-01")
    obs = RatingVector.from_mapping(
        team_sm_id=1,
        season_id=1,
        as_of_date="2025-02-01",
        ratings={k: 95.0 for k in PRIMARY_ORDER},
        metadata={
            k: RatingMetadata(current_value=95.0, confidence=0.9, variance=4.0, matches_used=1)
            for k in PRIMARY_ORDER
        },
    )
    post = update_vector(prior, obs, half_life_days=90.0)
    assert 0.0 <= post.get("attack") <= 100.0
    assert post.metadata["attack"].recent_trend == "up"
    assert post.metadata["attack"].matches_used == 1
    assert post.get("attack") > DEFAULT_PRIOR_MEAN


def test_classify_trend_flags():
    assert classify_trend(2.0) == "up"
    assert classify_trend(-2.0) == "down"
    assert classify_trend(0.1) == "flat"


def test_history_enriches_peak_low_trend():
    team_primaries = pd.DataFrame(
        [
            {
                "team_sm_id": 1,
                "season_id": 1,
                "rating_type": "attack",
                "as_of_date": "2025-05-01",
                "rating": 72.0,
                "confidence": 0.7,
                "variance": 9.0,
                "matches_used": 0,
            }
        ]
    )
    history = pd.DataFrame(
        [
            {
                "team_sm_id": 1,
                "season_id": 1,
                "as_of_date": "2025-01-01",
                "layer": "primary",
                "name": "attack",
                "rating": 60.0,
            },
            {
                "team_sm_id": 1,
                "season_id": 1,
                "as_of_date": "2025-03-01",
                "layer": "primary",
                "name": "attack",
                "rating": 65.0,
            },
            {
                "team_sm_id": 1,
                "season_id": 1,
                "as_of_date": "2025-05-01",
                "layer": "primary",
                "name": "attack",
                "rating": 72.0,
            },
        ]
    )
    rv = assemble_rating_vector_from_frames(
        team_sm_id=1,
        season_id=1,
        as_of_date="2025-05-01",
        team_primaries=team_primaries,
        history=history,
    )
    meta = rv.metadata["attack"]
    assert meta.historical_peak == 72.0
    assert meta.historical_low == 60.0
    assert meta.recent_trend == "up"
    assert meta.matches_used == 3

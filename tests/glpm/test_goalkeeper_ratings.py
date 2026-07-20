"""Unit tests for GLPM Goalkeeper Rating feature engineering, shrinkage, adjustment, pipeline."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.goalkeeper import GoalkeeperFeatureBuilder, build_goalkeeper_features
from models.ratings.goalkeeper.adjust import DefenceContextAdjuster
from models.ratings.goalkeeper.penalty import bayesian_shrink, shrink_penalty_features
from models.ratings.goalkeeper.pipeline import GoalkeeperRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_goals_prevented_is_psxg_minus_goals():
    builder = GoalkeeperFeatureBuilder()
    feats = builder.shot_stopping(
        {"psxg_faced": 2.4, "goals_conceded": 1, "gk_saves": 5, "sot_faced": 6},
        minutes=90,
    )
    assert feats["goals_prevented"] == pytest.approx(1.4)
    assert feats["psxg_save_pct"] == pytest.approx(1.4 / 2.4)


def test_area_command_and_distribution():
    builder = GoalkeeperFeatureBuilder()
    ac = builder.area_command(
        {
            "claims_attempted": 4,
            "claims_successful": 3,
            "punches": 1,
            "crosses_faced": 12,
            "aerial_duels_won": 2,
        }
    )
    assert ac["cross_claim_success"] == pytest.approx(0.75)
    assert ac["aerial_command_index"] == pytest.approx(5 / 12)

    di = builder.distribution(
        {
            "passes": 20,
            "passes_completed": 16,
            "long_passes": 8,
            "long_passes_completed": 4,
            "progressive_passes": 3,
            "progressive_pass_distance": 45,
            "passes_under_pressure": 5,
            "passes_under_pressure_completed": 3,
        }
    )
    assert di["pass_completion"] == pytest.approx(0.8)
    assert di["long_pass_accuracy"] == pytest.approx(0.5)
    assert di["pressure_pass_completion"] == pytest.approx(0.6)


def test_bayesian_shrinkage_small_n_pulls_toward_prior():
    prior = 0.25
    # 1 save from 1 pen → raw 100%, but should shrink hard toward prior
    shrunk = bayesian_shrink(1.0, n=1, prior=prior, k=8)
    assert shrunk == pytest.approx((1 / 9) * 1.0 + (8 / 9) * prior)
    assert shrunk < 0.4
    # Large sample should stay close to estimate
    large = bayesian_shrink(0.4, n=40, prior=prior, k=8)
    assert large == pytest.approx((40 / 48) * 0.4 + (8 / 48) * prior)


def test_shrink_penalty_features_frame():
    df = pd.DataFrame(
        {
            "player_sm_id": [1, 1, 2],
            "penalties_faced": [1, 1, 0],
            "penalty_save_pct": [1.0, 0.0, np.nan],
            "goals_prevented_from_penalties": [0.76, -0.76, np.nan],
        }
    )
    out = shrink_penalty_features(df, k=8, league_save_prior=0.25)
    assert "penalty_save_pct_shrunk" in out.columns
    # First row n=1 → heavily shrunk
    assert out.loc[0, "penalty_save_pct_shrunk"] < 0.5
    # Second row career n=2 still shrunk
    assert 0.0 < out.loc[1, "penalty_save_pct_shrunk"] < 0.5


def test_defence_adjustment_stronger_defence_raises_s_def():
    rows = []
    for i in range(12):
        rows.append(
            {
                "match_sm_id": i,
                "player_sm_id": 1,
                "team_sm_id": 1,
                "is_home": i % 2 == 0,
                "match_date": f"2025-09-{i + 1:02d}",
                "goals_prevented": 0.5,
                "psxg_faced_p90": 1.2,
                "psxg_save_pct": 0.1,
                "save_pct": 0.7,
                "high_diff_save_rate": 0.4,
                "one_v_one_save_pct": 0.5,
                "rebound_prevention_rate": 0.6,
                "cross_claim_success": 0.5,
                "punch_success_pct": 0.8,
                "high_ball_success": 0.55,
                "cross_intervention_rate": 0.3,
                "aerial_command_index": 0.4,
                "pass_completion": 0.75,
                "pressure_pass_completion": 0.6,
                "progressive_pass_rate": 0.15,
                "progressive_distance_per_attempt": 12.0,
                "long_pass_accuracy": 0.45,
                "def_actions_outside_box_p90": 2.0,
                "through_ball_prevention": 1.0,
                "recovery_success": 0.5,
                "avg_defensive_distance": 20.0,
                "proactive_defensive_index": 3.0,
                "penalty_save_pct": 0.3,
                "goals_prevented_from_penalties": 0.0,
                "penalty_psxg_saved_rate": 0.0,
                "defence_rating": 80.0 if i < 6 else 40.0,
            }
        )
    df = pd.DataFrame(rows)
    adj = DefenceContextAdjuster().fit_transform(df)
    assert "goals_prevented_adj" in adj.columns
    strong = adj[adj["defence_rating"] == 80.0]["s_def"].mean()
    weak = adj[adj["defence_rating"] == 40.0]["s_def"].mean()
    assert strong > weak
    # Stronger defence → smaller adjusted GK credit for same raw goals_prevented
    assert (
        adj[adj["defence_rating"] == 80.0]["goals_prevented_adj"].mean()
        < adj[adj["defence_rating"] == 40.0]["goals_prevented_adj"].mean()
    )


def test_calibrator_bands():
    rng = np.random.default_rng(0)
    scores = rng.normal(0, 1, size=500)
    cal = GlpmCalibrator()
    cal.fit(scores)
    mapped = [cal.transform_one(float(s)) for s in scores]
    assert min(mapped) >= 20
    assert max(mapped) <= 100
    assert classify_rating(95) == "Elite"
    assert classify_rating(55) == "Below Average"


def test_pipeline_synthetic_smoke():
    from scripts.glpm_train_goalkeeper_ratings import build_synthetic_frame

    frame = build_synthetic_frame(n_keepers=4, matches_per_gk=6)
    result = GoalkeeperRatingPipeline().run_from_frames(
        frame, persist_artifacts=False
    )
    assert len(result.player_summary) == 4
    assert result.player_summary["rating_goalkeeper"].between(20, 100).all()
    assert "rating_domain_goal_prevention" in result.player_summary.columns
    assert "rating_comp_shot_stopping" in result.player_summary.columns
    assert "rating_comp_penalty" in result.player_summary.columns


def test_build_goalkeeper_features_frame():
    df = pd.DataFrame(
        [
            {
                "match_sm_id": 1,
                "player_sm_id": 10,
                "team_sm_id": 1,
                "is_home": True,
                "match_date": "2025-08-01",
                "season_id": 1,
                "minutes_played": 90,
                "psxg_faced": 1.5,
                "goals_conceded": 1,
                "gk_saves": 4,
                "sot_faced": 5,
                "claims_attempted": 2,
                "claims_successful": 1,
                "punches": 0,
                "crosses_faced": 8,
                "aerial_duels_won": 1,
                "passes": 20,
                "passes_completed": 15,
                "long_passes": 5,
                "long_passes_completed": 3,
                "progressive_passes": 2,
                "progressive_pass_distance": 30,
                "passes_under_pressure": 4,
                "passes_under_pressure_completed": 2,
                "def_actions_outside_box": 1,
                "sweeper_clearances": 1,
                "through_ball_interceptions": 0,
                "recoveries_outside_box": 1,
                "avg_defensive_action_x": 22,
                "penalties_faced": 0,
                "penalties_saved": 0,
                "penalty_psxg_faced": 0,
                "payload": {},
            }
        ]
    )
    feats = build_goalkeeper_features(df)
    assert feats.loc[feats.index[0], "goals_prevented"] == pytest.approx(0.5)
    assert "pass_completion" in feats.columns

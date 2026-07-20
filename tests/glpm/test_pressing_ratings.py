"""Unit tests for GLPM Pressing Rating (Chapter 8)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.midfield import PressingFeatureBuilder, build_pressing_features
from models.ratings.pressing.adjust import OpponentContextAdjuster
from models.ratings.pressing.pipeline import PressingRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_high_and_mid_block_press():
    builder = PressingFeatureBuilder()
    high = builder.high_press(
        {"ppda": 7.0, "high_turnovers": 10}, minutes=90
    )
    assert high["high_press_intensity"] == pytest.approx(1 / 7)
    assert high["high_turnovers_p90"] == 10.0
    mid = builder.mid_block_press(
        {"ppda": 11.0, "pressing_duels": 40, "pressures": 100}
    )
    assert mid["mid_block_intensity"] is not None
    assert mid["press_duel_rate"] == pytest.approx(0.4)


def test_counter_press_and_recovery():
    builder = PressingFeatureBuilder()
    cp = builder.counter_press(
        {"high_turnovers": 8, "ball_recoveries": 40}, minutes=90
    )
    assert cp["immediate_recovery_proxy"] == pytest.approx(0.2)
    rec = builder.recovery_efficiency(
        {"ball_recoveries": 50, "possession_pct": 40.0, "high_turnovers": 10, "defensive_actions": 100}
    )
    assert rec["recoveries_per_opp_poss"] is not None
    assert rec["recovery_conversion"] == pytest.approx(0.2)


def test_disruption_features():
    builder = PressingFeatureBuilder()
    d = builder.press_resistance_disruption(
        {
            "opp_clearances": 30,
            "opp_progressive_passes": 20,
            "opp_passes": 400,
            "opp_final_third_entries": 25,
        }
    )
    assert d["long_balls_forced"] == 30.0
    assert d["build_up_disruption_index"] is not None


def test_opponent_adjustment_stronger_build_up_raises_s_opp():
    from features.midfield import ALL_PRESSING_FEATURES

    rows = []
    for i in range(20):
        row = {
            "match_sm_id": i,
            "team_sm_id": 1,
            "opponent_team_sm_id": 2 if i % 2 == 0 else 3,
            "is_home": i % 2 == 0,
            "match_date": f"2025-09-{i + 1:02d}",
            "pass_completion_pct": 80.0,
            "progressive_passes": 40,
            "passes": 400,
            "build_up_rating": 85.0 if i % 2 == 0 else 40.0,
        }
        for f in ALL_PRESSING_FEATURES:
            row[f] = 0.5
        rows.append(row)
    df = pd.DataFrame(rows)
    adj = OpponentContextAdjuster().fit_transform(df)
    strong = adj.loc[adj["build_up_rating"] == 85.0, "s_opp"].mean()
    weak = adj.loc[adj["build_up_rating"] == 40.0, "s_opp"].mean()
    assert strong > weak


def test_calibrator_bands():
    cal = GlpmCalibrator()
    scores = np.linspace(-2, 2, 200)
    cal.fit(scores)
    assert cal.transform_one(float(scores[-1])) >= 90
    assert classify_rating(cal.transform_one(float(scores[0]))) in {
        "Very Poor",
        "Poor",
        "Below Average",
    }


def test_synthetic_pipeline_smoke():
    from scripts.glpm_train_pressing_ratings import build_synthetic_frame

    result = PressingRatingPipeline().run_from_frames(
        build_synthetic_frame(), persist_artifacts=False
    )
    assert len(result.team_summary) == 6
    assert result.team_summary["rating_pressing"].between(0, 100).all()
    assert result.team_summary["rating_domain_press_intensity"].between(0, 100).all()


def test_build_pressing_features_frame():
    frame = pd.DataFrame(
        [
            {
                "match_sm_id": 1,
                "team_sm_id": 10,
                "opponent_team_sm_id": 20,
                "is_home": True,
                "match_date": "2025-08-01",
                "season_id": 1,
                "duration_minutes": 90,
                "ppda": 8.0,
                "pressures": 120,
                "pressing_duels": 48,
                "high_turnovers": 9,
                "ball_recoveries": 50,
                "defensive_actions": 100,
                "possession_pct": 45,
                "opp_clearances": 25,
                "opp_pass_completion_pct": 78,
                "opp_progressive_passes": 30,
                "opp_passes": 420,
                "opp_final_third_entries": 22,
            }
        ]
    )
    feats = build_pressing_features(frame)
    assert len(feats) == 1
    assert feats.iloc[0]["ppda_inv"] == pytest.approx(0.125)
    assert feats.iloc[0]["high_turnovers_p90"] == 9.0

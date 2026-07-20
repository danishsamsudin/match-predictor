"""Unit tests for GLPM Build-Up Rating (Chapter 6)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.midfield import BuildUpFeatureBuilder, build_build_up_features
from models.ratings.build_up.adjust import OpponentContextAdjuster
from models.ratings.build_up.pipeline import BuildUpRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_build_up_progression_features():
    builder = BuildUpFeatureBuilder()
    stats = {
        "progressive_passes": 40,
        "progressive_carries": 20,
        "final_third_entries": 30,
        "box_entries": 15,
        "passes": 400,
        "through_balls": 4,
    }
    bp = builder.ball_progression(stats)
    assert bp["prog_pass_rate"] == pytest.approx(0.1)
    assert bp["final_third_entry_rate"] == pytest.approx(0.075)
    vl = builder.vertical_line_breaking(stats)
    assert vl["through_ball_rate"] == pytest.approx(4 / 400)
    assert vl["vertical_progression_index"] == pytest.approx(30 / 40)


def test_press_resistance_and_security():
    builder = BuildUpFeatureBuilder()
    under = builder.press_resistance(
        {"pass_completion_pct": 85.0, "opp_ppda": 7.0}
    )
    easy = builder.press_resistance(
        {"pass_completion_pct": 85.0, "opp_ppda": 16.0}
    )
    assert under["completion_under_press"] > easy["completion_under_press"]
    sec = builder.security({"pass_completion_pct": 90.0, "successful_passes": 360, "passes": 400})
    assert sec["security_index"] is not None
    assert sec["security_index"] > 0.5


def test_opponent_adjustment_stronger_press_raises_s_opp():
    rows = []
    for i in range(20):
        rows.append(
            {
                "match_sm_id": i,
                "team_sm_id": 1,
                "opponent_team_sm_id": 2 if i % 2 == 0 else 3,
                "is_home": i % 2 == 0,
                "match_date": f"2025-09-{i + 1:02d}",
                "ppda": 12.0,
                "high_turnovers": 5,
                "prog_pass_rate": 0.1,
                "prog_carry_rate": 0.05,
                "final_third_entry_rate": 0.08,
                "box_entry_rate": 0.04,
                "through_ball_rate": 0.01,
                "prog_pass_share": 0.1,
                "vertical_progression_index": 0.7,
                "press_resist_index": 0.8,
                "completion_under_press": 0.85,
                "turnover_under_press_inv": 0.7,
                "security_index": 0.85,
                "incomplete_pass_inv": 0.7,
                "turnover_rate_inv": 0.7,
                "pass_completion_pct": 0.85,
                "successful_pass_rate": 0.85,
                "distribution_reliability": 0.85,
                "pass_tempo": 8.0,
                "directness": 0.1,
                "possession_rhythm": 7.0,
                "pressing_rating": 80.0 if i % 2 == 0 else 40.0,
            }
        )
    df = pd.DataFrame(rows)
    adj = OpponentContextAdjuster().fit_transform(df)
    strong = adj.loc[adj["pressing_rating"] == 80.0, "s_opp"].mean()
    weak = adj.loc[adj["pressing_rating"] == 40.0, "s_opp"].mean()
    assert strong > weak
    assert adj["prog_pass_rate_adj"].notna().all()


def test_calibrator_bands():
    cal = GlpmCalibrator()
    scores = np.linspace(-2, 2, 200)
    cal.fit(scores)
    assert classify_rating(cal.transform_one(float(scores[0]))) in {
        "Very Poor",
        "Poor",
        "Below Average",
    }
    assert cal.transform_one(float(scores[-1])) >= 90


def test_synthetic_pipeline_smoke():
    from scripts.glpm_train_build_up_ratings import build_synthetic_frame

    result = BuildUpRatingPipeline().run_from_frames(
        build_synthetic_frame(), persist_artifacts=False
    )
    assert len(result.team_summary) == 6
    assert result.team_summary["rating_build_up"].between(0, 100).all()
    assert result.team_summary["rating_domain_progression"].between(0, 100).all()


def test_build_build_up_features_frame():
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
                "passes": 400,
                "successful_passes": 340,
                "pass_completion_pct": 85,
                "progressive_passes": 40,
                "progressive_carries": 20,
                "final_third_entries": 30,
                "box_entries": 15,
                "through_balls": 3,
                "possession_pct": 55,
                "opp_ppda": 9.0,
            }
        ]
    )
    feats = build_build_up_features(frame)
    assert len(feats) == 1
    assert feats.iloc[0]["prog_pass_rate"] == pytest.approx(0.1)

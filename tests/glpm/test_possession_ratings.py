"""Unit tests for GLPM Possession Rating (Chapter 7)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.midfield import PossessionFeatureBuilder, build_possession_features
from models.ratings.possession.adjust import OpponentContextAdjuster
from models.ratings.possession.pipeline import PossessionRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_possession_security_and_circulation():
    builder = PossessionFeatureBuilder()
    sec = builder.possession_security({"pass_completion_pct": 88.0, "possession_pct": 60.0})
    assert sec["possession_retention"] == pytest.approx(0.88)
    assert sec["ball_security_index"] is not None
    circ = builder.ball_circulation(
        {"pass_completion_pct": 88.0, "progressive_passes": 30, "passes": 400}
    )
    assert circ["circulation_index"] is not None
    assert circ["short_pass_proxy"] is not None


def test_territorial_and_space():
    builder = PossessionFeatureBuilder()
    terr = builder.territorial_dominance(
        {"field_tilt": 60.0, "territory_pct": 55.0, "possession_pct": 58.0}
    )
    assert terr["final_third_poss_share"] is not None
    space = builder.space_control(
        {"crosses": 20, "passes": 400, "progressive_carries": 25}
    )
    assert space["width_index"] == pytest.approx(0.05)
    assert space["depth_index"] == pytest.approx(0.0625)


def test_opponent_adjustment_stronger_press_raises_s_opp():
    from features.midfield import ALL_POSSESSION_FEATURES

    rows = []
    for i in range(20):
        row = {
            "match_sm_id": i,
            "team_sm_id": 1,
            "opponent_team_sm_id": 2 if i % 2 == 0 else 3,
            "is_home": i % 2 == 0,
            "match_date": f"2025-09-{i + 1:02d}",
            "ppda": 12.0,
            "high_turnovers": 5,
            "pressing_rating": 75.0 if i % 2 == 0 else 35.0,
        }
        for f in ALL_POSSESSION_FEATURES:
            row[f] = 0.5
        rows.append(row)
    df = pd.DataFrame(rows)
    adj = OpponentContextAdjuster().fit_transform(df)
    strong = adj.loc[adj["pressing_rating"] == 75.0, "s_opp"].mean()
    weak = adj.loc[adj["pressing_rating"] == 35.0, "s_opp"].mean()
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
    from scripts.glpm_train_possession_ratings import build_synthetic_frame

    result = PossessionRatingPipeline().run_from_frames(
        build_synthetic_frame(), persist_artifacts=False
    )
    assert len(result.team_summary) == 6
    assert result.team_summary["rating_possession"].between(0, 100).all()
    assert result.team_summary["rating_domain_ball_retention"].between(0, 100).all()


def test_build_possession_features_frame():
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
                "passes": 450,
                "pass_completion_pct": 86,
                "progressive_passes": 35,
                "progressive_carries": 22,
                "final_third_entries": 28,
                "crosses": 12,
                "possession_pct": 58,
                "field_tilt": 55,
                "territory_pct": 52,
            }
        ]
    )
    feats = build_possession_features(frame)
    assert len(feats) == 1
    assert feats.iloc[0]["possession_pct"] == pytest.approx(0.58)

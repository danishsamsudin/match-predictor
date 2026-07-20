"""Unit tests for GLPM Finishing Rating feature engineering, adjustment, calibration, pipeline."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.finishing import (
    FinishingFeatureBuilder,
    build_finishing_features,
)
from models.ratings.finishing.adjust import OpponentContextAdjuster
from models.ratings.finishing.pipeline import FinishingRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_goals_minus_xg_centerpiece():
    builder = FinishingFeatureBuilder()
    stats = {
        "goals": 3,
        "xg": 2.1,
        "shots": 12,
        "shots_on_target": 5,
        "npxg": 1.9,
    }
    fe = builder.finishing_efficiency(stats)
    assert fe["goals_minus_xg"] == pytest.approx(0.9)
    assert fe["goals_per_xg"] == pytest.approx(3 / 2.1)
    assert fe["goals_per_shot"] == pytest.approx(3 / 12)


def test_shot_accuracy_and_clinical_from_shots():
    builder = FinishingFeatureBuilder()
    stats = {
        "goals": 2,
        "xg": 1.5,
        "shots": 8,
        "shots_on_target": 4,
        "big_chances": 3,
        "big_chances_missed": 1,
    }
    shots = [
        {
            "pos_x": 92,
            "pos_y": 50,
            "pre_shot_xg": 0.4,
            "is_goal": True,
            "is_on_target": True,
            "is_blocked": False,
            "is_opportunity": True,
            "body_part_tag": 402,
            "goal_zone_tag": 1201,
        },
        {
            "pos_x": 88,
            "pos_y": 48,
            "pre_shot_xg": 0.35,
            "is_goal": True,
            "is_on_target": True,
            "is_blocked": False,
            "is_opportunity": True,
            "body_part_tag": 403,
            "goal_zone_tag": 1205,
        },
        {
            "pos_x": 80,
            "pos_y": 40,
            "pre_shot_xg": 0.08,
            "is_goal": False,
            "is_on_target": False,
            "is_blocked": True,
            "is_opportunity": False,
            "body_part_tag": 401,
            "goal_zone_tag": None,
        },
        {
            "pos_x": 75,
            "pos_y": 55,
            "pre_shot_xg": 0.05,
            "is_goal": False,
            "is_on_target": True,
            "is_blocked": False,
            "is_opportunity": False,
            "body_part_tag": 402,
            "goal_zone_tag": 1204,
        },
    ]
    row = builder.build_row(stats, shots=shots)
    assert row["shot_accuracy_pct"] == pytest.approx(0.5)
    assert row["big_chance_conversion"] == pytest.approx(2 / 3)
    assert row["header_conversion"] == pytest.approx(1.0)
    assert row["goals_minus_xg"] == pytest.approx(0.5)
    assert row["one_v_one_conversion"] is not None  # close+high-xg goals
    assert row["pressure_conversion"] is not None


def test_opponent_adjustment_stronger_defence_gk_lowers_overperformance():
    rows = []
    # Team 1 faces strong (2) and weak (3) opposition on alternating matches
    for i in range(12):
        opp = 2 if i % 2 == 0 else 3
        rows.append(
            {
                "match_sm_id": i,
                "team_sm_id": 1,
                "opponent_team_sm_id": opp,
                "is_home": i % 2 == 0,
                "match_date": f"2025-09-{i + 1:02d}",
                "shot_accuracy_pct": 0.4,
                "shot_precision_score": 0.3,
                "target_placement_index": 0.4,
                "central_miss_rate": 0.8,
                "blocked_shot_rate": 0.7,
                "header_conversion": 0.2,
                "weak_foot_conversion": 0.15,
                "close_range_finish_rate": 0.35,
                "technique_consistency": 0.5,
                "goals_minus_xg": 0.5,
                "goals_per_xg": 1.2,
                "goals_per_shot": 0.15,
                "npx_goals_per_xg": 1.1,
                "conversion_rate": 0.3,
                "big_chance_conversion": 0.4,
                "high_xg_conversion": 0.45,
                "clinical_finishing_index": 0.42,
                "big_chance_overperformance": 0.1,
                "one_v_one_conversion": 0.4,
                "one_v_one_xg_overperf": 0.05,
                "gk_beat_rate": 0.4,
                "close_range_conversion": 0.35,
                "pressure_conversion": 0.25,
                "pressure_shot_accuracy": 0.3,
                "pressure_finishing_efficiency": 0.05,
                "contested_goal_rate": 0.25,
                "defence_rating": 80.0 if opp == 2 else 30.0,
                "goalkeeper_rating": 78.0 if opp == 2 else 32.0,
                "xg_conceded": 1.0,
                "goals_prevented": 0.0,
            }
        )

    df = pd.DataFrame(rows)
    adj = OpponentContextAdjuster().fit_transform(df)
    assert "goals_minus_xg_adj" in adj.columns
    strong = adj[adj["opponent_team_sm_id"] == 2]["s_opp"].mean()
    weak = adj[adj["opponent_team_sm_id"] == 3]["s_opp"].mean()
    assert strong > weak
    assert adj.loc[adj["opponent_team_sm_id"] == 2, "goals_minus_xg_adj"].mean() < adj.loc[
        adj["opponent_team_sm_id"] == 3, "goals_minus_xg_adj"
    ].mean()


def test_calibration_percentile_bands():
    scores = np.linspace(0, 1, 100)
    cal = GlpmCalibrator().fit(scores)
    bottom = cal.transform_one(scores[0])
    assert bottom < 40
    assert classify_rating(bottom) == "Very Poor"
    top = cal.transform_one(scores[-1])
    assert top >= 90
    assert classify_rating(top) == "Elite"
    mid = cal.transform_one(scores[49])
    assert 60 <= mid < 70
    assert classify_rating(mid) == "Average"


def test_pipeline_smoke_synthetic():
    rng = np.random.default_rng(7)
    rows = []
    match_id = 1
    n_teams, n_rounds = 6, 6
    for round_i in range(n_rounds):
        teams = list(range(1, n_teams + 1))
        rng.shuffle(teams)
        for i in range(0, n_teams, 2):
            home, away = teams[i], teams[i + 1]
            date = f"2025-10-{round_i + 1:02d}"
            for team, opp, is_home in ((home, away, True), (away, home, False)):
                finish = 0.6 + 0.12 * team
                shots = int(10 * finish)
                xg = float(1.0 * finish)
                goals = max(0, int(round(xg + 0.2 * (finish - 1.0))))
                rows.append(
                    {
                        "match_sm_id": match_id,
                        "team_sm_id": team,
                        "opponent_team_sm_id": opp,
                        "is_home": is_home,
                        "match_date": date,
                        "season_id": 99,
                        "duration_minutes": 90,
                        "goals": goals,
                        "shots": shots,
                        "shots_on_target": max(goals, shots // 2),
                        "xg": xg,
                        "npxg": xg * 0.9,
                        "big_chances": max(1, shots // 4),
                        "big_chances_missed": 1,
                        "xg_conceded": 1.2,
                        "goals_prevented": 0.1,
                        "opp_xg_conceded": 1.0,
                        "opp_goals_prevented": 0.0,
                        "defence_rating": 50.0,
                        "goalkeeper_rating": 50.0,
                    }
                )
            match_id += 1

    frame = pd.DataFrame(rows)
    result = FinishingRatingPipeline().run_from_frames(frame, persist_artifacts=False)
    assert len(result.team_summary) == n_teams
    assert result.team_summary["rating_finishing"].between(0, 100).all()
    for col in (
        "rating_domain_shot_execution",
        "rating_domain_chance_conversion",
        "rating_domain_finishing_composure",
        "rating_comp_shot_accuracy",
        "rating_comp_finishing_efficiency",
        "rating_comp_pressure_finishing",
    ):
        assert col in result.team_summary.columns
        assert result.team_summary[col].between(0, 100).all()


def test_build_finishing_features_frame():
    frame = pd.DataFrame(
        [
            {
                "match_sm_id": 1,
                "team_sm_id": 10,
                "opponent_team_sm_id": 11,
                "is_home": True,
                "match_date": "2025-01-01",
                "season_id": 1,
                "goals": 2,
                "shots": 10,
                "shots_on_target": 4,
                "xg": 1.4,
                "npxg": 1.2,
                "big_chances": 2,
                "big_chances_missed": 0,
                "xg_conceded": 0.8,
            }
        ]
    )
    out = build_finishing_features(frame)
    assert out.loc[0, "goals_minus_xg"] == pytest.approx(0.6)
    assert out.loc[0, "shot_accuracy_pct"] == pytest.approx(0.4)
    assert out.loc[0, "big_chance_conversion"] == pytest.approx(1.0)

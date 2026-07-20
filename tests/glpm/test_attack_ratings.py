"""Unit tests for GLPM Attack Rating feature engineering, adjustment, calibration, pipeline."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.attack import AttackFeatureBuilder, build_attack_features, safe_ratio, per_90
from models.ratings.attack.adjust import OpponentContextAdjuster
from models.ratings.attack.pipeline import AttackRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_safe_ratio_and_per_90():
    assert safe_ratio(10, 5) == 2.0
    assert safe_ratio(10, 0) is None
    assert safe_ratio(None, 5) is None
    assert per_90(9, 90) == 9.0
    assert per_90(9, 45) == 18.0


def test_chance_volume_features():
    builder = AttackFeatureBuilder()
    stats = {
        "shots": 18,
        "box_entries": 27,
        "touches_in_box": 36,
        "big_chances": 4,
        "possession_pct": 60.0,
    }
    cv = builder.chance_volume(stats, minutes=90)
    assert cv["shots_p90"] == 18.0
    assert cv["box_entries_p90"] == 27.0
    assert cv["touches_in_box_p90"] == 36.0
    assert cv["big_chances_p90"] == 4.0
    assert abs(cv["shots_per_poss"] - 18 / 0.6) < 1e-9


def test_chance_quality_and_shots():
    builder = AttackFeatureBuilder()
    stats = {"xg": 1.8, "shots": 12, "big_chances": 3}
    shots = [
        {"pos_x": 90, "pos_y": 50, "pre_shot_xg": 0.3, "is_counter_attack": False, "is_set_piece": False},
        {"pos_x": 88, "pos_y": 20, "pre_shot_xg": 0.1, "is_counter_attack": True, "is_set_piece": False},
        {"pos_x": 85, "pos_y": 50, "pre_shot_xg": 0.2, "is_counter_attack": False, "is_set_piece": True},
    ]
    row = builder.build_row(stats, shots=shots)
    assert abs(row["xg_per_shot"] - 0.15) < 1e-9
    assert abs(row["big_chance_pct"] - 0.25) < 1e-9
    assert abs(row["central_shot_pct"] - 2 / 3) < 1e-9
    assert row["set_piece_shot_rate"] == pytest.approx(1 / 12)
    assert row["fast_break_rate"] == pytest.approx(1 / 12)


def test_opponent_adjustment_stronger_defence_lowers_volume():
    rng = np.random.default_rng(0)
    rows = []
    for i in range(20):
        rows.append(
            {
                "match_sm_id": i,
                "team_sm_id": 1,
                "opponent_team_sm_id": 2 if i % 2 == 0 else 3,
                "is_home": i % 2 == 0,
                "match_date": f"2025-09-{i + 1:02d}",
                "shots_p90": 15.0,
                "box_entries_p90": 20.0,
                "touches_in_box_p90": 25.0,
                "big_chances_p90": 3.0,
                "shots_per_poss": 20.0,
                "xg_per_shot": 0.12,
                "big_chance_pct": 0.2,
                "central_shot_pct": 0.5,
                "avg_shot_distance": 15.0,
                "prog_pass_rate": 0.1,
                "prog_carry_rate": 0.05,
                "final_third_entry_rate": 0.08,
                "box_entry_rate": 0.04,
                "field_tilt": 55.0,
                "territory_pct": 52.0,
                "final_third_occupancy": 0.3,
                "transition_xg_per_recovery": 0.02,
                "counter_efficiency": 0.15,
                "fast_break_rate": 0.1,
                "set_piece_xg_per_match": 0.25,
                "set_piece_shot_rate": 0.2,
                "xg_conceded": 1.0,
                "opp_xg_conceded": 0.4 if i % 2 == 0 else 2.0,  # even: strong opp defence
            }
        )
    # Add opponent self-history rows so rolling proxy can resolve
    for team, xgc in ((2, 0.4), (3, 2.0)):
        for i in range(5):
            rows.append(
                {
                    "match_sm_id": 100 + team * 10 + i,
                    "team_sm_id": team,
                    "opponent_team_sm_id": 1,
                    "is_home": True,
                    "match_date": f"2025-08-{i + 1:02d}",
                    "shots_p90": 10.0,
                    "box_entries_p90": 10.0,
                    "touches_in_box_p90": 10.0,
                    "big_chances_p90": 1.0,
                    "shots_per_poss": 10.0,
                    "xg_per_shot": 0.1,
                    "big_chance_pct": 0.1,
                    "central_shot_pct": 0.4,
                    "avg_shot_distance": 16.0,
                    "prog_pass_rate": 0.08,
                    "prog_carry_rate": 0.04,
                    "final_third_entry_rate": 0.06,
                    "box_entry_rate": 0.03,
                    "field_tilt": 45.0,
                    "territory_pct": 48.0,
                    "final_third_occupancy": 0.2,
                    "transition_xg_per_recovery": 0.01,
                    "counter_efficiency": 0.1,
                    "fast_break_rate": 0.05,
                    "set_piece_xg_per_match": 0.15,
                    "set_piece_shot_rate": 0.1,
                    "xg_conceded": xgc,
                    "opp_xg_conceded": 1.0,
                }
            )

    df = pd.DataFrame(rows)
    adj = OpponentContextAdjuster().fit_transform(df)
    team1 = adj[adj["team_sm_id"] == 1].copy()
    # After history builds, even matches face team 2 (strong) → higher s_opp → lower adj volume
    # Compare mean adjusted shots vs raw
    assert "shots_p90_adj" in team1.columns
    assert team1["s_opp"].notna().all()
    # Stronger defence (lower xg_conceded) should yield higher s_opp
    strong = team1[team1["opponent_team_sm_id"] == 2]["s_opp"].mean()
    weak = team1[team1["opponent_team_sm_id"] == 3]["s_opp"].mean()
    assert strong > weak
    assert team1.loc[team1["opponent_team_sm_id"] == 2, "shots_p90_adj"].mean() < team1.loc[
        team1["opponent_team_sm_id"] == 3, "shots_p90_adj"
    ].mean()


def test_calibration_percentile_bands():
    scores = np.linspace(0, 1, 100)
    cal = GlpmCalibrator().fit(scores)
    # Bottom score → Very Poor band (<40)
    bottom = cal.transform_one(scores[0])
    assert bottom < 40
    assert classify_rating(bottom) == "Very Poor"
    # Top score → Elite
    top = cal.transform_one(scores[-1])
    assert top >= 90
    assert classify_rating(top) == "Elite"
    # Median ~ Average band
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
                strength = 0.6 + 0.12 * team
                shots = int(10 * strength)
                xg = float(1.0 * strength)
                rows.append(
                    {
                        "match_sm_id": match_id,
                        "team_sm_id": team,
                        "opponent_team_sm_id": opp,
                        "is_home": is_home,
                        "match_date": date,
                        "season_id": 99,
                        "duration_minutes": 90,
                        "shots": shots,
                        "xg": xg,
                        "npxg": xg * 0.9,
                        "open_play_xg": xg * 0.7,
                        "set_piece_xg": 0.2,
                        "big_chances": max(1, shots // 4),
                        "box_entries": shots + 5,
                        "touches_in_box": shots + 3,
                        "progressive_passes": 30,
                        "progressive_carries": 15,
                        "final_third_entries": 25,
                        "passes": 400,
                        "possession_pct": 50.0,
                        "field_tilt": 40 + team,
                        "territory_pct": 50.0,
                        "ball_recoveries": 40,
                        "xg_conceded": 1.2,
                        "shots_conceded": 10,
                        "box_entries_allowed": 15,
                        "opp_xg_conceded": 1.0,
                    }
                )
            match_id += 1

    frame = pd.DataFrame(rows)
    result = AttackRatingPipeline().run_from_frames(frame, persist_artifacts=False)
    assert len(result.team_summary) == n_teams
    assert result.team_summary["rating_attack"].between(0, 100).all()
    for col in (
        "rating_domain_creation",
        "rating_domain_progression",
        "rating_domain_situational",
        "rating_comp_chance_volume",
        "rating_comp_set_piece_threat",
    ):
        assert col in result.team_summary.columns
        assert result.team_summary[col].between(0, 100).all()


def test_build_attack_features_frame():
    frame = pd.DataFrame(
        [
            {
                "match_sm_id": 1,
                "team_sm_id": 10,
                "opponent_team_sm_id": 11,
                "is_home": True,
                "match_date": "2025-01-01",
                "season_id": 1,
                "shots": 12,
                "xg": 1.2,
                "npxg": 1.0,
                "open_play_xg": 0.9,
                "set_piece_xg": 0.3,
                "big_chances": 2,
                "box_entries": 20,
                "touches_in_box": 15,
                "progressive_passes": 40,
                "progressive_carries": 20,
                "final_third_entries": 30,
                "passes": 500,
                "possession_pct": 55,
                "field_tilt": 60,
                "territory_pct": 58,
                "ball_recoveries": 45,
                "xg_conceded": 0.8,
            }
        ]
    )
    out = build_attack_features(frame)
    assert out.loc[0, "shots_p90"] == 12.0
    assert out.loc[0, "prog_pass_rate"] == pytest.approx(40 / 500)

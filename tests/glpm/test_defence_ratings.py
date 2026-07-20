"""Unit tests for GLPM Defence Rating feature engineering, adjustment, calibration, pipeline."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from features.defence import (
    DefenceFeatureBuilder,
    aggregate_conceded_shots,
    build_defence_features,
)
from models.ratings.defence.adjust import OpponentContextAdjuster
from models.ratings.defence.pipeline import DefenceRatingPipeline
from models.ratings.scale import GlpmCalibrator, classify_rating


def test_chance_suppression_polarity():
    builder = DefenceFeatureBuilder()
    weak = builder.chance_suppression(
        {"shots_conceded": 20, "xg_conceded": 2.5, "possession_pct": 40.0, "big_chances_conceded": 5},
        minutes=90,
    )
    strong = builder.chance_suppression(
        {"shots_conceded": 5, "xg_conceded": 0.4, "possession_pct": 55.0, "big_chances_conceded": 0},
        minutes=90,
    )
    assert strong["shots_suppression"] > weak["shots_suppression"]
    assert strong["xga_per_opp_poss"] > weak["xga_per_opp_poss"]


def test_pressing_and_box_protection():
    builder = DefenceFeatureBuilder()
    stats = {
        "ppda": 8.0,
        "high_turnovers": 9,
        "pressures": 120,
        "pressing_duels": 48,
        "blocks": 12,
        "clearances": 24,
        "box_entries_allowed": 18,
    }
    press = builder.pressing(stats, minutes=90)
    assert press["ppda_inv"] == pytest.approx(0.125)
    assert press["high_turnovers_p90"] == 9.0
    assert press["press_duel_rate"] == pytest.approx(48 / 120)

    box = builder.box_protection(stats)
    assert box["blocks_per_box_entry"] == pytest.approx(12 / 18)
    assert box["clearances_per_box_entry"] == pytest.approx(24 / 18)


def test_conceded_shot_aggregates():
    shots = [
        {"pos_x": 92, "pos_y": 50, "pre_shot_xg": 0.3, "is_counter_attack": False, "is_set_piece": False},
        {"pos_x": 85, "pos_y": 20, "pre_shot_xg": 0.1, "is_counter_attack": True, "is_set_piece": False},
        {"pos_x": 88, "pos_y": 10, "pre_shot_xg": 0.15, "is_counter_attack": False, "is_set_piece": True},
    ]
    agg = aggregate_conceded_shots(shots)
    assert agg.n_shots == 3
    assert agg.total_xg == pytest.approx(0.55)
    assert agg.counter_shots == 1
    assert agg.set_piece_shots == 1
    assert agg.close_range_shots >= 1


def test_opponent_adjustment_stronger_attack_raises_s_opp():
    rows = []
    for i in range(20):
        rows.append(
            {
                "match_sm_id": i,
                "team_sm_id": 1,
                "opponent_team_sm_id": 2 if i % 2 == 0 else 3,
                "is_home": i % 2 == 0,
                "match_date": f"2025-09-{i + 1:02d}",
                "xg": 1.0,
                "shots_suppression": 0.5,
                "xga_per_opp_poss": 0.4,
                "big_chances_conceded_rate": 0.6,
                "def_actions_per_poss": 50.0,
                "interception_rate": 0.25,
                "tackle_share": 0.3,
                "transition_xga_per_loss": 0.7,
                "fast_break_prevention_rate": 0.8,
                "blocks_per_box_entry": 0.5,
                "clearances_per_box_entry": 0.9,
                "close_range_xga_suppression": 0.6,
                "set_piece_xga_suppression": 0.7,
                "corner_xga_suppression": 0.65,
                "aerial_duel_proxy": 0.4,
                "ppda_inv": 0.1,
                "high_turnovers_p90": 6.0,
                "press_duel_rate": 0.35,
                "field_tilt_against_suppression": 0.5,
                "opp_box_entry_suppression": 0.4,
                "territory_against_suppression": 0.45,
                # even: strong opp attack; odd: weak
                "opp_xg": 2.2 if i % 2 == 0 else 0.5,
            }
        )
    # Opponent self-history: team 2 strong attack (high xg), team 3 weak
    for team, xg in ((2, 2.2), (3, 0.5)):
        for i in range(5):
            rows.append(
                {
                    "match_sm_id": 100 + team * 10 + i,
                    "team_sm_id": team,
                    "opponent_team_sm_id": 1,
                    "is_home": True,
                    "match_date": f"2025-08-{i + 1:02d}",
                    "xg": xg,
                    "opp_xg": 1.0,
                    "shots_suppression": 0.4,
                    "xga_per_opp_poss": 0.3,
                    "big_chances_conceded_rate": 0.5,
                    "def_actions_per_poss": 40.0,
                    "interception_rate": 0.2,
                    "tackle_share": 0.25,
                    "transition_xga_per_loss": 0.5,
                    "fast_break_prevention_rate": 0.6,
                    "blocks_per_box_entry": 0.4,
                    "clearances_per_box_entry": 0.7,
                    "close_range_xga_suppression": 0.5,
                    "set_piece_xga_suppression": 0.55,
                    "corner_xga_suppression": 0.5,
                    "aerial_duel_proxy": 0.35,
                    "ppda_inv": 0.08,
                    "high_turnovers_p90": 4.0,
                    "press_duel_rate": 0.3,
                    "field_tilt_against_suppression": 0.4,
                    "opp_box_entry_suppression": 0.35,
                    "territory_against_suppression": 0.4,
                }
            )

    df = pd.DataFrame(rows)
    adj = OpponentContextAdjuster().fit_transform(df)
    team1 = adj[adj["team_sm_id"] == 1].copy()
    assert "shots_suppression_adj" in team1.columns
    assert team1["s_opp"].notna().all()
    strong = team1[team1["opponent_team_sm_id"] == 2]["s_opp"].mean()
    weak = team1[team1["opponent_team_sm_id"] == 3]["s_opp"].mean()
    assert strong > weak
    # Stronger attack → higher s_opp → lower adjusted suppression for same raw
    assert team1.loc[team1["opponent_team_sm_id"] == 2, "shots_suppression_adj"].mean() < team1.loc[
        team1["opponent_team_sm_id"] == 3, "shots_suppression_adj"
    ].mean()


def test_calibration_shared_scale():
    scores = np.linspace(0, 1, 100)
    cal = GlpmCalibrator().fit(scores)
    bottom = cal.transform_one(scores[0])
    assert bottom < 40
    assert classify_rating(bottom) == "Very Poor"
    top = cal.transform_one(scores[-1])
    assert top >= 90
    assert classify_rating(top) == "Elite"


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
                rows.append(
                    {
                        "match_sm_id": match_id,
                        "team_sm_id": team,
                        "opponent_team_sm_id": opp,
                        "is_home": is_home,
                        "match_date": date,
                        "season_id": 99,
                        "duration_minutes": 90,
                        "shots": int(10 * strength),
                        "xg": float(1.0 * strength),
                        "xg_conceded": float(1.5 / strength),
                        "shots_conceded": int(14 / strength),
                        "big_chances_conceded": 2,
                        "box_entries_allowed": 18,
                        "blocks": 10,
                        "interceptions": 12,
                        "tackles": 15,
                        "clearances": 20,
                        "defensive_actions": 55,
                        "pressures": 100,
                        "pressing_duels": 40,
                        "ppda": 10.0,
                        "high_turnovers": 6,
                        "ball_recoveries": 40,
                        "passes": 400,
                        "successful_passes": 320,
                        "possession_pct": 50.0,
                        "field_tilt": 40 + team,
                        "territory_pct": 50.0,
                    }
                )
            match_id += 1

    frame = pd.DataFrame(rows)
    result = DefenceRatingPipeline().run_from_frames(frame, persist_artifacts=False)
    assert len(result.team_summary) == n_teams
    assert result.team_summary["rating_defence"].between(0, 100).all()
    for col in (
        "rating_domain_prevention",
        "rating_domain_protection",
        "rating_domain_control",
        "rating_comp_chance_suppression",
        "rating_comp_pressing",
        "rating_comp_defensive_territorial_control",
    ):
        assert col in result.team_summary.columns
        assert result.team_summary[col].between(0, 100).all()


def test_build_defence_features_frame():
    frame = pd.DataFrame(
        [
            {
                "match_sm_id": 1,
                "team_sm_id": 10,
                "opponent_team_sm_id": 11,
                "is_home": True,
                "match_date": "2025-01-01",
                "season_id": 1,
                "xg": 1.2,
                "shots": 12,
                "xg_conceded": 0.8,
                "shots_conceded": 8,
                "big_chances_conceded": 1,
                "box_entries_allowed": 14,
                "blocks": 8,
                "interceptions": 10,
                "tackles": 12,
                "clearances": 15,
                "defensive_actions": 45,
                "pressures": 90,
                "pressing_duels": 36,
                "ppda": 9.0,
                "high_turnovers": 5,
                "ball_recoveries": 40,
                "passes": 450,
                "successful_passes": 360,
                "possession_pct": 55,
                "field_tilt": 60,
                "territory_pct": 58,
            }
        ]
    )
    out = build_defence_features(frame)
    assert out.loc[0, "ppda_inv"] == pytest.approx(1 / 9.0)
    assert out.loc[0, "blocks_per_box_entry"] == pytest.approx(8 / 14)
    assert out.loc[0, "shots_suppression"] is not None

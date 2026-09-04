"""Unit tests for Understat shot mapping (no network)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "glpm_fetch_understat_shots.py"


def _load_mod():
    import sys

    spec = importlib.util.spec_from_file_location("glpm_fetch_understat_shots", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def shots():
    return _load_mod()


def test_field_tilt_from_deep(shots):
    assert shots.field_tilt_from_deep(2, 6) == 25.0
    assert shots.field_tilt_from_deep(0, 0) is None
    assert shots.field_tilt_from_deep(None, 4) is None


def test_map_set_piece_and_open_play(shots):
    raw = {
        "id": "643591",
        "minute": "6",
        "result": "BlockedShot",
        "X": "0.8340000152587891",
        "Y": "0.34799999237060547",
        "xG": "0.034936562180519104",
        "situation": "FromCorner",
        "lastAction": "Standard",
        "shotType": "Header",
        "match_id": "28823",
        "h_a": "h",
        "player": "Test",
    }
    event, shot = shots.map_understat_shot(
        raw, match_sm_id=19135515, home_sm_id=52, away_sm_id=20
    )
    assert event["event_id"] == shots.EVENT_ID_OFFSET + 643591
    assert event["source"] == "understat"
    assert shot["team_sm_id"] == 52
    assert shot["is_set_piece"] is True
    assert shot["is_penalty"] is False
    assert shot["is_blocked"] is True
    assert shot["is_on_target"] is False
    assert shot["is_counter_attack"] is False
    assert shot["pos_x"] == 83
    assert shot["pos_y"] == 35
    assert shot["tags"]["is_corner"] is True
    assert shot["tags"]["provider"] == "understat"
    assert shot["pre_shot_xg"] == pytest.approx(0.034936562180519104)


def test_map_penalty_and_counter(shots):
    raw = {
        "id": "10",
        "minute": "67",
        "result": "Goal",
        "X": "0.885",
        "Y": "0.5",
        "xG": "0.76",
        "situation": "Penalty",
        "lastAction": "BallRecovery",
        "h_a": "a",
        "match_id": "1",
    }
    _, shot = shots.map_understat_shot(
        raw, match_sm_id=1, home_sm_id=19, away_sm_id=18
    )
    assert shot["team_sm_id"] == 18
    assert shot["is_set_piece"] is True
    assert shot["is_penalty"] is True
    assert shot["is_goal"] is True
    assert shot["is_on_target"] is True
    assert shot["is_counter_attack"] is True
    assert shot["match_period"] == "2H"


def test_aggregate_side_xg(shots):
    shots_rows = [
        {
            "team_sm_id": 52,
            "pre_shot_xg": 0.4,
            "is_set_piece": False,
            "pos_x": 90,
            "tags": {"situation": "OpenPlay"},
        },
        {
            "team_sm_id": 52,
            "pre_shot_xg": 0.2,
            "is_set_piece": True,
            "pos_x": 88,
            "tags": {"situation": "FromCorner"},
        },
        {
            "team_sm_id": 20,
            "pre_shot_xg": 0.9,
            "is_set_piece": True,
            "pos_x": 50,
            "tags": {"situation": "DirectFreekick"},
        },
    ]
    home = shots.aggregate_side_xg(shots_rows, 52)
    away = shots.aggregate_side_xg(shots_rows, 20)
    assert home["open_play_xg"] == pytest.approx(0.4)
    assert home["set_piece_xg"] == pytest.approx(0.2)
    assert home["box_shots"] == 2
    assert away["set_piece_xg"] == pytest.approx(0.9)
    assert away["box_shots"] == 0
    assert away["open_play_xg"] == 0.0

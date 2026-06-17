"""Unit tests for StatsBomb process aggregates."""

from __future__ import annotations

from process_aggregates import aggregate_match_process

MATCH = {
    "match_id": 1,
    "home_score": 2,
    "away_score": 1,
    "home_team": {"home_team_id": 10, "home_team_name": "Home"},
    "away_team": {"away_team_id": 20, "away_team_name": "Away"},
}

EVENTS = [
    {
        "type": {"name": "Shot"},
        "team": {"id": 10},
        "location": [110, 40],
        "shot": {
            "statsbomb_xg": 0.4,
            "type": {"name": "Open Play"},
            "outcome": {"name": "Goal"},
            "under_pressure": False,
        },
    },
    {
        "type": {"name": "Shot"},
        "team": {"id": 10},
        "location": [105, 38],
        "shot": {
            "statsbomb_xg": 0.15,
            "type": {"name": "Corner"},
            "outcome": {"name": "Saved"},
        },
    },
    {
        "type": {"name": "Shot"},
        "team": {"id": 20},
        "location": [15, 40],
        "shot": {
            "statsbomb_xg": 0.25,
            "type": {"name": "Open Play"},
            "outcome": {"name": "Goal"},
            "under_pressure": True,
        },
    },
    {
        "type": {"name": "Pressure"},
        "team": {"id": 10},
    },
    {
        "type": {"name": "Tackle"},
        "team": {"id": 20},
    },
]


def test_aggregate_match_process_basic():
    agg = aggregate_match_process(EVENTS, MATCH)
    assert agg.home_xg == 0.55
    assert agg.away_xg == 0.25
    assert agg.home_shots == 2
    assert agg.away_shots == 1
    assert agg.home_sot == 2
    assert agg.away_sot == 1

    payload = agg.process_payload()
    assert payload["schema"] == "sb_process_v1"
    assert payload["home"]["xg_box"] == 0.55
    assert payload["home"]["xg_set_piece"] == 0.15
    assert payload["home"]["xg_open_play"] == 0.4
    assert payload["home"]["goals_minus_xg"] == 1.45
    assert payload["away"]["shots_under_pressure_pct"] == 1.0
    assert payload["home"]["pressure_events"] == 1
    assert payload["away"]["defensive_actions"] == 1

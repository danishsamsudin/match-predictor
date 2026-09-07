"""Tests for rating-engine training-set eligibility filters."""

from __future__ import annotations

import pandas as pd

from models.ratings.match_status import (
    drop_unrecorded_stat_rows,
    finished_matches,
    is_finished_status,
)


def test_is_finished_status_accepts_completed_sportmonks_labels():
    assert is_finished_status("Full Time") is True
    assert is_finished_status("After Extra Time") is True
    assert is_finished_status("After Penalties") is True


def test_is_finished_status_rejects_scheduled_live_and_void():
    assert is_finished_status("Not Started") is False
    assert is_finished_status("2nd Half") is False
    assert is_finished_status("Abandoned") is False
    assert is_finished_status(None) is False


def test_finished_matches_drops_scheduled_fixtures():
    rows = [
        {"sm_id": 1, "status": "Full Time"},
        {"sm_id": 2, "status": "Not Started"},
        {"sm_id": 3, "status": "After Penalties"},
    ]
    assert [m["sm_id"] for m in finished_matches(rows)] == [1, 3]


def test_drop_unrecorded_stat_rows_keeps_only_rows_with_stats():
    df = pd.DataFrame(
        {
            "match_sm_id": [1, 1, 2, 2],
            "team_sm_id": [10, 11, 10, 11],
            "goals": [2, 1, None, None],
            "shots": [14, 9, None, None],
            "xg": [1.8, 0.9, None, None],
        }
    )
    kept = drop_unrecorded_stat_rows(df)
    assert kept["match_sm_id"].tolist() == [1, 1]


def test_drop_unrecorded_stat_rows_is_noop_without_known_columns():
    df = pd.DataFrame({"match_sm_id": [1], "some_other_col": [None]})
    assert len(drop_unrecorded_stat_rows(df)) == 1

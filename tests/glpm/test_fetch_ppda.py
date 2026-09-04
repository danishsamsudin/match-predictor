"""Unit tests for PPDA fetch helpers (no network)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "glpm_fetch_ppda.py"


def _load_mod():
    import sys

    spec = importlib.util.spec_from_file_location("glpm_fetch_ppda", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def ppda():
    return _load_mod()


def test_ppda_ratio_from_att_def(ppda):
    assert ppda.ppda_ratio({"att": 240, "def": 30}) == 8.0
    assert ppda.ppda_ratio({"att": 100, "def": 0}) is None
    assert ppda.ppda_ratio(9.5) == 9.5
    assert ppda.ppda_ratio(None) is None


def test_compute_ppda_proxy(ppda):
    # opp passes / (tackles + interceptions + clearances)
    assert ppda.compute_ppda_proxy(398, 20, 15, 8) == pytest.approx(398 / 43, rel=1e-3)
    assert ppda.compute_ppda_proxy(None, 10, 10, 10) is None
    assert ppda.compute_ppda_proxy(100, None, None, None) is None


def test_normalize_team_name(ppda):
    assert ppda.normalize_team_name("Brighton & Hove Albion") == "brighton and hove albion"
    assert ppda.normalize_team_name("AFC Bournemouth") == "bournemouth"


def test_parse_understat_team_matches(ppda):
    payload = {
        "dates": [
            {
                "id": 1,
                "datetime": "2025-08-16 15:00:00",
                "h": {"id": 10, "title": "Arsenal"},
                "a": {"id": 20, "title": "Liverpool"},
            }
        ],
        "teams": {
            "10": {
                "id": 10,
                "title": "Arsenal",
                "history": [
                    {
                        "date": "2025-08-16 15:00:00",
                        "h_a": "h",
                        "ppda": {"att": 200, "def": 25},
                        "ppda_allowed": {"att": 300, "def": 20},
                        "deep": 8,
                        "deep_allowed": 2,
                    }
                ],
            },
            "20": {
                "id": 20,
                "title": "Liverpool",
                "history": [
                    {
                        "date": "2025-08-16 15:00:00",
                        "h_a": "a",
                        "ppda": {"att": 300, "def": 20},
                        "ppda_allowed": {"att": 200, "def": 25},
                    }
                ],
            },
        },
    }
    rows = ppda.parse_understat_team_matches(payload)
    assert len(rows) == 2
    home = next(r for r in rows if r.is_home)
    away = next(r for r in rows if not r.is_home)
    assert home.team_title == "Arsenal"
    assert home.ppda == 8.0
    assert home.ppda_allowed == 15.0
    assert home.deep == 8.0
    assert home.deep_allowed == 2.0
    assert away.ppda == 15.0
    assert away.ppda_allowed == 8.0


def test_match_understat_to_glpm(ppda):
    us = [
        ppda.UnderstatTeamMatch(
            understat_match_id=99,
            match_date="2025-08-16",
            team_title="Arsenal",
            is_home=True,
            home_title="Arsenal",
            away_title="Liverpool",
            ppda=8.0,
            ppda_allowed=12.0,
        ),
        ppda.UnderstatTeamMatch(
            understat_match_id=99,
            match_date="2025-08-16",
            team_title="Liverpool",
            is_home=False,
            home_title="Arsenal",
            away_title="Liverpool",
            ppda=12.0,
            ppda_allowed=8.0,
        ),
    ]
    matches = [
        {
            "sm_id": 19135515,
            "match_date": "2025-08-16",
            "home_team_sm_id": 19,
            "away_team_sm_id": 44,
        }
    ]
    lookup = {
        ppda.normalize_team_name("Arsenal"): 19,
        ppda.normalize_team_name("Liverpool"): 44,
    }
    patches, unmatched = ppda.match_understat_to_glpm(us, matches, lookup)
    assert unmatched == []
    assert len(patches) == 2
    home = next(p for p in patches if p["is_home"])
    assert home["match_sm_id"] == 19135515
    assert home["team_sm_id"] == 19
    assert home["ppda"] == 8.0
    assert home["ppda_allowed"] == 12.0
    assert home["ppda_source"] == "understat"


def test_understat_season_year(ppda):
    assert ppda.understat_season_year(25583, None) == 2025
    assert ppda.understat_season_year(28083, None) == 2026
    assert ppda.understat_season_year(None, "2025-09-21") == 2025
    assert ppda.understat_season_year(None, "2026-03-01") == 2025


def test_resolve_league_key(ppda):
    assert ppda.resolve_league_key("epl") == ("understat", "epl")
    assert ppda.resolve_league_key("8") == ("understat", "epl")
    assert ppda.resolve_league_key("championship") == ("proxy", "championship")
    assert ppda.resolve_league_key("all")[0] == "all"

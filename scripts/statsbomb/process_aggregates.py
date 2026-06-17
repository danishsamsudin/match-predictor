"""
StatsBomb Open Data match-level process aggregates (sb_process_v1).

Pitch coordinates use StatsBomb's 120×80 system (see data/knowledge guide §2.3.1).
Penalty-area shots: location[0] >= 102 (attacking toward x=120).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

PROCESS_SCHEMA = "sb_process_v1"

# StatsBomb pitch: x ∈ [0, 120], y ∈ [0, 80]; attacking goal at x=120.
PENALTY_AREA_X_MIN = 102

SET_PIECE_SHOT_TYPES = frozenset(
    {
        "Free Kick",
        "Penalty",
        "Corner",
    }
)

SOT_OUTCOMES = frozenset({"Goal", "Saved", "Saved to Post"})

DEFENSIVE_ACTION_TYPES = frozenset(
    {
        "Pressure",
        "Tackle",
        "Interception",
        "Block",
        "Clearance",
        "Duel",
    }
)


@dataclass
class SideProcessTotals:
    xg: float = 0.0
    shots: int = 0
    sot: int = 0
    xg_open_play: float = 0.0
    xg_set_piece: float = 0.0
    xg_box: float = 0.0
    xg_outside_box: float = 0.0
    shots_under_pressure: int = 0
    pressure_events: int = 0
    defensive_actions: int = 0
    goals: int = 0

    def to_payload(self) -> dict[str, float | int]:
        shots_under_pressure_pct = (
            round(self.shots_under_pressure / self.shots, 4) if self.shots > 0 else 0.0
        )
        return {
            "xg_open_play": round(self.xg_open_play, 4),
            "xg_set_piece": round(self.xg_set_piece, 4),
            "xg_box": round(self.xg_box, 4),
            "xg_outside_box": round(self.xg_outside_box, 4),
            "shots_under_pressure_pct": shots_under_pressure_pct,
            "goals_minus_xg": round(self.goals - self.xg, 4),
            "pressure_events": self.pressure_events,
            "defensive_actions": self.defensive_actions,
        }


@dataclass
class MatchProcessAggregate:
    home_xg: float = 0.0
    away_xg: float = 0.0
    home_shots: int = 0
    away_shots: int = 0
    home_sot: int = 0
    away_sot: int = 0
    home: SideProcessTotals = field(default_factory=SideProcessTotals)
    away: SideProcessTotals = field(default_factory=SideProcessTotals)

    def process_payload(self) -> dict[str, Any]:
        return {
            "schema": PROCESS_SCHEMA,
            "home": self.home.to_payload(),
            "away": self.away.to_payload(),
        }


def _event_type_name(event: dict[str, Any]) -> str:
    t = event.get("type")
    if isinstance(t, dict):
        return str(t.get("name") or "")
    return str(t or "")


def _team_id(event: dict[str, Any]) -> Optional[int]:
    team = event.get("team")
    if isinstance(team, dict) and team.get("id") is not None:
        return int(team["id"])
    return None


def _shot_location_x(event: dict[str, Any]) -> Optional[float]:
    loc = event.get("location")
    if isinstance(loc, list) and len(loc) >= 1:
        try:
            return float(loc[0])
        except (TypeError, ValueError):
            return None
    return None


def _is_set_piece_shot(shot_info: dict[str, Any]) -> bool:
    shot_type = shot_info.get("type")
    if isinstance(shot_type, dict):
        name = shot_type.get("name")
        if name in SET_PIECE_SHOT_TYPES:
            return True
    return False


def _shot_under_pressure(shot_info: dict[str, Any]) -> bool:
    if shot_info.get("under_pressure") is True:
        return True
    ctx = shot_info.get("shot_execution_context")
    if isinstance(ctx, dict) and ctx.get("under_pressure") is True:
        return True
    return False


def _match_team_ids(match: dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    home = match.get("home_team") or {}
    away = match.get("away_team") or {}
    home_id = home.get("home_team_id") or home.get("id")
    away_id = away.get("away_team_id") or away.get("id")
    return (
        int(home_id) if home_id is not None else None,
        int(away_id) if away_id is not None else None,
    )


def _match_goals(match: dict[str, Any]) -> tuple[int, int]:
    home_score = match.get("home_score")
    away_score = match.get("away_score")
    if home_score is None or away_score is None:
        return 0, 0
    return int(home_score), int(away_score)


def _side_totals(
    totals: dict[int, SideProcessTotals],
    team_id: int,
    home_sb_id: int,
    away_sb_id: int,
) -> Optional[SideProcessTotals]:
    if team_id == home_sb_id:
        return totals[home_sb_id]
    if team_id == away_sb_id:
        return totals[away_sb_id]
    return None


def aggregate_match_process(
    events: list[dict[str, Any]], match: dict[str, Any]
) -> MatchProcessAggregate:
    home_sb_id, away_sb_id = _match_team_ids(match)
    if home_sb_id is None or away_sb_id is None:
        return MatchProcessAggregate()

    home_goals, away_goals = _match_goals(match)
    totals = {
        home_sb_id: SideProcessTotals(goals=home_goals),
        away_sb_id: SideProcessTotals(goals=away_goals),
    }

    for event in events:
        tid = _team_id(event)
        if tid is None:
            continue
        side = _side_totals(totals, tid, home_sb_id, away_sb_id)
        if side is None:
            continue

        etype = _event_type_name(event)

        if etype == "Shot":
            shot_info = event.get("shot")
            if not isinstance(shot_info, dict):
                continue
            xg_raw = shot_info.get("statsbomb_xg")
            if xg_raw is None:
                continue
            xg = float(xg_raw)
            side.xg += xg
            side.shots += 1

            outcome = shot_info.get("outcome")
            outcome_name = outcome.get("name") if isinstance(outcome, dict) else None
            if outcome_name in SOT_OUTCOMES:
                side.sot += 1

            if _is_set_piece_shot(shot_info):
                side.xg_set_piece += xg
            else:
                side.xg_open_play += xg

            loc_x = _shot_location_x(event)
            if loc_x is not None:
                # Normalize to attacking direction: higher x toward opponent goal.
                attacking_x = loc_x if tid == home_sb_id else (120.0 - loc_x)
                if attacking_x >= PENALTY_AREA_X_MIN:
                    side.xg_box += xg
                else:
                    side.xg_outside_box += xg

            if _shot_under_pressure(shot_info):
                side.shots_under_pressure += 1

        elif etype == "Pressure":
            side.pressure_events += 1
            side.defensive_actions += 1
        elif etype in DEFENSIVE_ACTION_TYPES:
            side.defensive_actions += 1

    home = totals[home_sb_id]
    away = totals[away_sb_id]

    return MatchProcessAggregate(
        home_xg=home.xg,
        away_xg=away.xg,
        home_shots=home.shots,
        away_shots=away.shots,
        home_sot=home.sot,
        away_sot=away.sot,
        home=home,
        away=away,
    )

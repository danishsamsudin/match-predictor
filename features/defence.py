"""
Defence Rating feature engineering (Chapter 4 / Part II).

Transforms Layer 1 match team stats (+ opponent shot aggregates / Layer 2) into
the seven component feature groups used by the hierarchical Defence Engine.

Polarity convention: higher = better defence (concession rates are inverted /
suppressed so opponent-strength adjustment stays coherent with Attack).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

from features.attack import per_90, per_poss, safe_ratio

# Close-range threshold on 0–100 pitch (near opponent goal ≈ high x).
CLOSE_RANGE_X = 88.0
GOAL_X = 100.0
GOAL_Y = 50.0

CHANCE_SUPPRESSION_FEATURES = (
    "shots_suppression",
    "xga_per_opp_poss",
    "big_chances_conceded_rate",
)

DEFENSIVE_ORGANISATION_FEATURES = (
    "def_actions_per_poss",
    "interception_rate",
    "tackle_share",
)

TRANSITION_DEFENCE_FEATURES = (
    "transition_xga_per_loss",
    "fast_break_prevention_rate",
)

BOX_PROTECTION_FEATURES = (
    "blocks_per_box_entry",
    "clearances_per_box_entry",
    "close_range_xga_suppression",
)

SET_PIECE_DEFENCE_FEATURES = (
    "set_piece_xga_suppression",
    "corner_xga_suppression",
    "aerial_duel_proxy",
)

PRESSING_FEATURES = (
    "ppda_inv",
    "high_turnovers_p90",
    "press_duel_rate",
)

DEFENSIVE_TERRITORIAL_CONTROL_FEATURES = (
    "field_tilt_against_suppression",
    "opp_box_entry_suppression",
    "territory_against_suppression",
)

COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "chance_suppression": CHANCE_SUPPRESSION_FEATURES,
    "defensive_organisation": DEFENSIVE_ORGANISATION_FEATURES,
    "transition_defence": TRANSITION_DEFENCE_FEATURES,
    "box_protection": BOX_PROTECTION_FEATURES,
    "set_piece_defence": SET_PIECE_DEFENCE_FEATURES,
    "pressing": PRESSING_FEATURES,
    "defensive_territorial_control": DEFENSIVE_TERRITORIAL_CONTROL_FEATURES,
}

ALL_DEFENCE_FEATURES: tuple[str, ...] = tuple(
    f for group in COMPONENT_FEATURE_GROUPS.values() for f in group
)


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def _invert_rate(value: Any, *, scale: float = 1.0) -> Optional[float]:
    """Map a 'lower is better' count/rate to a suppression score in (0, scale]."""
    v = _as_float(value)
    if v is None:
        return None
    if v < 0:
        v = 0.0
    return scale / (1.0 + v)


def _opp_possession(possession_pct: Any) -> Optional[float]:
    """Opponent possession share in 0–100 (or None)."""
    p = _as_float(possession_pct)
    if p is None:
        return None
    if p <= 1.0:
        p = p * 100.0
    return max(0.0, 100.0 - p)


def _shot_distance(pos_x: Any, pos_y: Any) -> Optional[float]:
    if pos_x is None or pos_y is None:
        return None
    try:
        x = float(pos_x)
        y = float(pos_y)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(x) or not np.isfinite(y):
        return None
    return float(np.hypot(GOAL_X - x, GOAL_Y - y))


@dataclass
class ConcededShotAggregates:
    n_shots: int = 0
    total_xg: Optional[float] = None
    counter_xg: Optional[float] = None
    counter_shots: int = 0
    set_piece_xg: Optional[float] = None
    set_piece_shots: int = 0
    close_range_xg: Optional[float] = None
    close_range_shots: int = 0
    corner_xg: Optional[float] = None
    corner_shots: int = 0


def aggregate_conceded_shots(shots: Sequence[Mapping[str, Any]]) -> ConcededShotAggregates:
    """Aggregate opponent shots faced by the defending team."""
    if not shots:
        return ConcededShotAggregates()

    total_xg = 0.0
    has_xg = False
    counter_xg = 0.0
    has_counter = False
    counter_shots = 0
    set_piece_xg = 0.0
    has_sp = False
    set_piece_shots = 0
    close_xg = 0.0
    has_close = False
    close_shots = 0
    corner_xg = 0.0
    has_corner = False
    corner_shots = 0

    for s in shots:
        xg = s.get("pre_shot_xg")
        xg_f: Optional[float] = None
        if xg is not None:
            try:
                xg_f = float(xg)
                if np.isfinite(xg_f):
                    total_xg += xg_f
                    has_xg = True
            except (TypeError, ValueError):
                xg_f = None

        if s.get("is_counter_attack"):
            counter_shots += 1
            if xg_f is not None:
                counter_xg += xg_f
                has_counter = True

        if s.get("is_set_piece"):
            set_piece_shots += 1
            if xg_f is not None:
                set_piece_xg += xg_f
                has_sp = True

        # Corner proxy: set-piece shots from wide / deep delivery zones
        is_corner = bool(s.get("is_corner"))
        if not is_corner and s.get("is_set_piece"):
            try:
                y = float(s.get("pos_y")) if s.get("pos_y") is not None else None
            except (TypeError, ValueError):
                y = None
            if y is not None and (y <= 15.0 or y >= 85.0):
                is_corner = True
        if is_corner:
            corner_shots += 1
            if xg_f is not None:
                corner_xg += xg_f
                has_corner = True

        try:
            x = float(s["pos_x"]) if s.get("pos_x") is not None else None
        except (TypeError, ValueError):
            x = None
        if x is not None and x >= CLOSE_RANGE_X:
            close_shots += 1
            if xg_f is not None:
                close_xg += xg_f
                has_close = True
        elif x is None:
            dist = _shot_distance(s.get("pos_x"), s.get("pos_y"))
            if dist is not None and dist <= 12.0:
                close_shots += 1
                if xg_f is not None:
                    close_xg += xg_f
                    has_close = True

    return ConcededShotAggregates(
        n_shots=len(shots),
        total_xg=total_xg if has_xg else None,
        counter_xg=counter_xg if has_counter else None,
        counter_shots=counter_shots,
        set_piece_xg=set_piece_xg if has_sp else None,
        set_piece_shots=set_piece_shots,
        close_range_xg=close_xg if has_close else None,
        close_range_shots=close_shots,
        corner_xg=corner_xg if has_corner else None,
        corner_shots=corner_shots,
    )


class DefenceFeatureBuilder:
    """Calculate the seven specialised Defence component feature groups."""

    def __init__(self, *, default_minutes: float = 90.0) -> None:
        self.default_minutes = default_minutes

    def chance_suppression(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
        conceded: Optional[ConcededShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        m = minutes if minutes is not None else self.default_minutes
        shots_conc = stats.get("shots_conceded")
        if shots_conc is None and conceded is not None and conceded.n_shots:
            shots_conc = conceded.n_shots
        xga = stats.get("xg_conceded")
        if xga is None and conceded is not None:
            xga = conceded.total_xg
        opp_poss = _opp_possession(stats.get("possession_pct"))
        big_conc = stats.get("big_chances_conceded")
        raw_xga_per_opp = (
            safe_ratio(xga, opp_poss / 100.0)
            if opp_poss is not None
            else _as_float(xga)
        )
        return {
            "shots_suppression": _invert_rate(per_90(shots_conc, m)),
            # Stored as suppression so higher = better (mirrors other defence features)
            "xga_per_opp_poss": _invert_rate(raw_xga_per_opp),
            "big_chances_conceded_rate": _invert_rate(
                safe_ratio(big_conc, shots_conc) if big_conc is not None else None
            ),
        }

    def defensive_organisation(
        self,
        stats: Mapping[str, Any],
    ) -> dict[str, Optional[float]]:
        # Own possession used for action density while organised without the ball
        # is better expressed vs opponent possession share.
        opp_poss = _opp_possession(stats.get("possession_pct"))
        def_actions = stats.get("defensive_actions")
        if def_actions is None:
            parts = [
                _as_float(stats.get("tackles")),
                _as_float(stats.get("interceptions")),
                _as_float(stats.get("blocks")),
                _as_float(stats.get("clearances")),
            ]
            known = [p for p in parts if p is not None]
            def_actions = float(sum(known)) if known else None
        interceptions = stats.get("interceptions")
        tackles = stats.get("tackles")
        return {
            "def_actions_per_poss": (
                safe_ratio(def_actions, opp_poss / 100.0)
                if opp_poss is not None
                else _as_float(def_actions)
            ),
            "interception_rate": safe_ratio(interceptions, def_actions),
            "tackle_share": safe_ratio(tackles, def_actions),
        }

    def transition_defence(
        self,
        stats: Mapping[str, Any],
        *,
        conceded: Optional[ConcededShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        conceded = conceded or ConcededShotAggregates()
        # Losses proxy: when possession is lost, recoveries failed → use recoveries
        # inverted against counter volume, or passes incomplete as fallback.
        losses = stats.get("possession_losses")
        if losses is None:
            passes = _as_float(stats.get("passes"))
            succ = _as_float(stats.get("successful_passes"))
            if passes is not None and succ is not None:
                losses = max(0.0, passes - succ)
            else:
                losses = stats.get("ball_recoveries")
        transition_xga = conceded.counter_xg
        shots_conc = stats.get("shots_conceded")
        if shots_conc is None:
            shots_conc = conceded.n_shots or None
        return {
            "transition_xga_per_loss": _invert_rate(
                safe_ratio(transition_xga, losses)
            ),
            "fast_break_prevention_rate": _invert_rate(
                safe_ratio(conceded.counter_shots, shots_conc)
            ),
        }

    def box_protection(
        self,
        stats: Mapping[str, Any],
        *,
        conceded: Optional[ConcededShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        conceded = conceded or ConcededShotAggregates()
        box_allowed = stats.get("box_entries_allowed")
        return {
            "blocks_per_box_entry": safe_ratio(stats.get("blocks"), box_allowed),
            "clearances_per_box_entry": safe_ratio(stats.get("clearances"), box_allowed),
            "close_range_xga_suppression": _invert_rate(conceded.close_range_xg),
        }

    def set_piece_defence(
        self,
        stats: Mapping[str, Any],
        *,
        conceded: Optional[ConcededShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        conceded = conceded or ConcededShotAggregates()
        sp_xga = stats.get("set_piece_xg_conceded")
        if sp_xga is None:
            sp_xga = conceded.set_piece_xg
        corner_xga = stats.get("corner_xg_conceded")
        if corner_xga is None:
            corner_xga = conceded.corner_xg
        clearances = _as_float(stats.get("clearances"))
        def_actions = _as_float(stats.get("defensive_actions"))
        if def_actions is None:
            parts = [
                _as_float(stats.get("tackles")),
                _as_float(stats.get("interceptions")),
                _as_float(stats.get("blocks")),
                clearances,
            ]
            known = [p for p in parts if p is not None]
            def_actions = float(sum(known)) if known else None
        return {
            "set_piece_xga_suppression": _invert_rate(sp_xga),
            "corner_xga_suppression": _invert_rate(corner_xga),
            "aerial_duel_proxy": safe_ratio(clearances, def_actions),
        }

    def pressing(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        m = minutes if minutes is not None else self.default_minutes
        l2 = l2 or {}
        ppda = l2.get("ppda")
        if ppda is None:
            ppda = stats.get("ppda")
        ppda_f = _as_float(ppda)
        ppda_inv = (1.0 / ppda_f) if ppda_f is not None and ppda_f > 0 else None
        press_duels = stats.get("pressing_duels")
        pressures = stats.get("pressures")
        return {
            "ppda_inv": ppda_inv,
            "high_turnovers_p90": per_90(stats.get("high_turnovers"), m),
            "press_duel_rate": safe_ratio(press_duels, pressures)
            if press_duels is not None and pressures is not None
            else safe_ratio(pressures, stats.get("defensive_actions")),
        }

    def defensive_territorial_control(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        field_tilt = l2.get("field_tilt")
        if field_tilt is None:
            field_tilt = stats.get("field_tilt")
        ft = _as_float(field_tilt)
        # Field tilt against: if field_tilt is own share, against = 100 - own (or 1 - own)
        if ft is not None:
            if ft > 1.0:
                tilt_against = 100.0 - ft
            else:
                tilt_against = 1.0 - ft
        else:
            tilt_against = None
        territory = _as_float(stats.get("territory_pct"))
        if territory is not None:
            if territory > 1.0:
                terr_against = 100.0 - territory
            else:
                terr_against = 1.0 - territory
        else:
            terr_against = None
        return {
            "field_tilt_against_suppression": _invert_rate(tilt_against),
            "opp_box_entry_suppression": _invert_rate(stats.get("box_entries_allowed")),
            "territory_against_suppression": _invert_rate(terr_against),
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        conceded_shots: Optional[Sequence[Mapping[str, Any]]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        conceded = aggregate_conceded_shots(conceded_shots or [])
        m = minutes if minutes is not None else self.default_minutes
        feats: dict[str, Optional[float]] = {}
        feats.update(self.chance_suppression(stats, minutes=m, conceded=conceded))
        feats.update(self.defensive_organisation(stats))
        feats.update(self.transition_defence(stats, conceded=conceded))
        feats.update(self.box_protection(stats, conceded=conceded))
        feats.update(self.set_piece_defence(stats, conceded=conceded))
        feats.update(self.pressing(stats, minutes=m, l2=l2))
        feats.update(self.defensive_territorial_control(stats, l2=l2))

        # Supervisory targets (raw concession — lower better; also store inverted)
        xga = _as_float(stats.get("xg_conceded"))
        if xga is None:
            xga = conceded.total_xg
        feats["xga"] = xga
        feats["xga_p90"] = per_90(xga, m)
        # Higher = better primary target for latent modelling convenience
        feats["xga_suppression"] = _invert_rate(feats["xga_p90"])
        feats["shots_conceded"] = _as_float(stats.get("shots_conceded"))
        feats["npxga"] = _as_float(stats.get("npxga"))
        feats["npxga_p90"] = per_90(feats["npxga"], m)
        return feats


def build_defence_features(
    match_frame: pd.DataFrame,
    *,
    shots_by_match_team: Optional[dict[tuple[int, int], list[Mapping[str, Any]]]] = None,
    l2_frame: Optional[pd.DataFrame] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    """
    Engineer defence features for every (match_sm_id, team_sm_id) row.

    Opponent shots are resolved via ``opponent_team_sm_id`` when present in
    ``shots_by_match_team``; otherwise empty conceded aggregates are used.
    """
    builder = DefenceFeatureBuilder(default_minutes=default_minutes)
    shots_by_match_team = shots_by_match_team or {}

    l2_lookup: dict[tuple[int, int], Mapping[str, Any]] = {}
    if l2_frame is not None and not l2_frame.empty:
        for _, row in l2_frame.iterrows():
            key = (int(row["match_sm_id"]), int(row["team_sm_id"]))
            l2_lookup[key] = row.to_dict()

    rows: list[dict[str, Any]] = []
    for _, raw in match_frame.iterrows():
        stats = raw.to_dict()
        match_id = int(stats["match_sm_id"])
        team_id = int(stats["team_sm_id"])
        key = (match_id, team_id)
        minutes = stats.get("duration_minutes")
        if minutes is None:
            minutes = default_minutes

        opp_id = stats.get("opponent_team_sm_id")
        conceded_shots: list[Mapping[str, Any]] = []
        if opp_id is not None and not (isinstance(opp_id, float) and np.isnan(opp_id)):
            conceded_shots = list(shots_by_match_team.get((match_id, int(opp_id)), []))

        feats = builder.build_row(
            stats,
            l2=l2_lookup.get(key),
            conceded_shots=conceded_shots,
            minutes=float(minutes) if minutes is not None else default_minutes,
        )
        meta = {
            "match_sm_id": match_id,
            "team_sm_id": team_id,
            "is_home": bool(stats.get("is_home")),
            "match_date": stats.get("match_date"),
            "season_id": stats.get("season_id"),
            "opponent_team_sm_id": stats.get("opponent_team_sm_id"),
            "xg": stats.get("xg"),
            "shots": stats.get("shots"),
            "xg_conceded": stats.get("xg_conceded"),
            "shots_conceded": stats.get("shots_conceded"),
            "box_entries_allowed": stats.get("box_entries_allowed"),
            "attack_rating": stats.get("attack_rating"),
            "duration_minutes": minutes,
        }
        rows.append({**meta, **feats})

    return pd.DataFrame(rows)

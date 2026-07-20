"""
Attack Rating feature engineering (Chapter 3.7).

Transforms Layer 1 match team stats (+ Layer 2 / shot aggregates) into the six
component feature groups used by the hierarchical Attack Engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

# Wyscout / SportMonks pitch is typically 0–100; central band for shot quality.
CENTRAL_Y_LOW = 30.0
CENTRAL_Y_HIGH = 70.0
# Approximate goal centre for shot distance on 0–100 pitch.
GOAL_X = 100.0
GOAL_Y = 50.0

CHANCE_VOLUME_FEATURES = (
    "shots_p90",
    "box_entries_p90",
    "touches_in_box_p90",
    "big_chances_p90",
    "shots_per_poss",
)

CHANCE_QUALITY_FEATURES = (
    "xg_per_shot",
    "big_chance_pct",
    "central_shot_pct",
    "avg_shot_distance",
)

BALL_PROGRESSION_FEATURES = (
    "prog_pass_rate",
    "prog_carry_rate",
    "final_third_entry_rate",
    "box_entry_rate",
)

TERRITORIAL_CONTROL_FEATURES = (
    "field_tilt",
    "territory_pct",
    "final_third_occupancy",
)

TRANSITION_THREAT_FEATURES = (
    "transition_xg_per_recovery",
    "counter_efficiency",
    "fast_break_rate",
)

SET_PIECE_THREAT_FEATURES = (
    "set_piece_xg_per_match",
    "set_piece_shot_rate",
)

COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "chance_volume": CHANCE_VOLUME_FEATURES,
    "chance_quality": CHANCE_QUALITY_FEATURES,
    "ball_progression": BALL_PROGRESSION_FEATURES,
    "territorial_control": TERRITORIAL_CONTROL_FEATURES,
    "transition_threat": TRANSITION_THREAT_FEATURES,
    "set_piece_threat": SET_PIECE_THREAT_FEATURES,
}

ALL_ATTACK_FEATURES: tuple[str, ...] = tuple(
    f for group in COMPONENT_FEATURE_GROUPS.values() for f in group
)


def safe_ratio(num: Any, den: Any) -> Optional[float]:
    if num is None or den is None:
        return None
    try:
        n = float(num)
        d = float(den)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(n) or not np.isfinite(d) or d == 0:
        return None
    return n / d


def per_90(value: Any, minutes: Any = 90.0) -> Optional[float]:
    if value is None:
        return None
    try:
        v = float(value)
        m = float(minutes) if minutes is not None else 90.0
    except (TypeError, ValueError):
        return None
    if not np.isfinite(v) or not np.isfinite(m) or m <= 0:
        return None
    return v * 90.0 / m


def per_poss(value: Any, possession_pct: Any) -> Optional[float]:
    """Normalise a count by possession share (possession_pct in 0–100 or 0–1)."""
    if value is None or possession_pct is None:
        return None
    try:
        v = float(value)
        p = float(possession_pct)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(v) or not np.isfinite(p):
        return None
    if p > 1.0:
        p = p / 100.0
    if p <= 0:
        return None
    return v / p


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


def _is_central_shot(pos_y: Any) -> bool:
    if pos_y is None:
        return False
    try:
        y = float(pos_y)
    except (TypeError, ValueError):
        return False
    return CENTRAL_Y_LOW <= y <= CENTRAL_Y_HIGH


@dataclass
class ShotAggregates:
    central_shot_pct: Optional[float] = None
    avg_shot_distance: Optional[float] = None
    counter_xg: Optional[float] = None
    counter_shots: Optional[int] = None
    set_piece_shots: Optional[int] = None
    set_piece_xg: Optional[float] = None
    n_shots: int = 0


def aggregate_shots(shots: Sequence[Mapping[str, Any]]) -> ShotAggregates:
    if not shots:
        return ShotAggregates()

    central = 0
    distances: list[float] = []
    counter_xg = 0.0
    counter_shots = 0
    set_piece_shots = 0
    set_piece_xg = 0.0
    has_counter_xg = False
    has_sp_xg = False

    for s in shots:
        if _is_central_shot(s.get("pos_y")):
            central += 1
        dist = _shot_distance(s.get("pos_x"), s.get("pos_y"))
        if dist is not None:
            distances.append(dist)
        if s.get("is_counter_attack"):
            counter_shots += 1
            xg = s.get("pre_shot_xg")
            if xg is not None:
                try:
                    counter_xg += float(xg)
                    has_counter_xg = True
                except (TypeError, ValueError):
                    pass
        if s.get("is_set_piece"):
            set_piece_shots += 1
            xg = s.get("pre_shot_xg")
            if xg is not None:
                try:
                    set_piece_xg += float(xg)
                    has_sp_xg = True
                except (TypeError, ValueError):
                    pass

    n = len(shots)
    return ShotAggregates(
        central_shot_pct=central / n if n else None,
        avg_shot_distance=float(np.mean(distances)) if distances else None,
        counter_xg=counter_xg if has_counter_xg else None,
        counter_shots=counter_shots if counter_shots else 0,
        set_piece_shots=set_piece_shots,
        set_piece_xg=set_piece_xg if has_sp_xg else None,
        n_shots=n,
    )


class AttackFeatureBuilder:
    """Calculate the six specialised Attack component feature groups."""

    def __init__(self, *, default_minutes: float = 90.0) -> None:
        self.default_minutes = default_minutes

    def chance_volume(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        m = minutes if minutes is not None else self.default_minutes
        shots = stats.get("shots")
        poss = stats.get("possession_pct")
        return {
            "shots_p90": per_90(shots, m),
            "box_entries_p90": per_90(stats.get("box_entries"), m),
            "touches_in_box_p90": per_90(stats.get("touches_in_box"), m),
            "big_chances_p90": per_90(stats.get("big_chances"), m),
            "shots_per_poss": per_poss(shots, poss),
        }

    def chance_quality(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        shot_agg: Optional[ShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        shot_agg = shot_agg or ShotAggregates()
        xg_per_shot = l2.get("xg_per_shot")
        if xg_per_shot is None:
            xg_per_shot = safe_ratio(stats.get("xg"), stats.get("shots"))
        big_chance_pct = l2.get("big_chance_rate")
        if big_chance_pct is None:
            big_chance_pct = safe_ratio(stats.get("big_chances"), stats.get("shots"))
        return {
            "xg_per_shot": _as_float(xg_per_shot),
            "big_chance_pct": _as_float(big_chance_pct),
            "central_shot_pct": shot_agg.central_shot_pct,
            "avg_shot_distance": shot_agg.avg_shot_distance,
        }

    def ball_progression(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        prog_pass = l2.get("progressive_pass_rate")
        if prog_pass is None:
            prog_pass = safe_ratio(stats.get("progressive_passes"), stats.get("passes"))
        return {
            "prog_pass_rate": _as_float(prog_pass),
            "prog_carry_rate": safe_ratio(
                stats.get("progressive_carries"), stats.get("passes")
            ),
            "final_third_entry_rate": safe_ratio(
                stats.get("final_third_entries"), stats.get("passes")
            ),
            "box_entry_rate": safe_ratio(stats.get("box_entries"), stats.get("passes")),
        }

    def territorial_control(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        field_tilt = l2.get("field_tilt")
        if field_tilt is None:
            field_tilt = stats.get("field_tilt")
        territory = stats.get("territory_pct")
        poss = stats.get("possession_pct")
        # Final-third occupancy proxy: possession share × field tilt (both 0–1 or %)
        occupancy = None
        ft = _as_float(field_tilt)
        p = _as_float(poss)
        if ft is not None and p is not None:
            ft_n = ft / 100.0 if ft > 1.0 else ft
            p_n = p / 100.0 if p > 1.0 else p
            occupancy = ft_n * p_n
        elif stats.get("final_third_entries") is not None and p is not None:
            occupancy = per_poss(stats.get("final_third_entries"), p)
        return {
            "field_tilt": _as_float(field_tilt),
            "territory_pct": _as_float(territory),
            "final_third_occupancy": occupancy,
        }

    def transition_threat(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        shot_agg: Optional[ShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        shot_agg = shot_agg or ShotAggregates()
        recoveries = stats.get("ball_recoveries")
        transition_xg = shot_agg.counter_xg
        return {
            "transition_xg_per_recovery": safe_ratio(transition_xg, recoveries),
            "counter_efficiency": _as_float(l2.get("counter_efficiency"))
            if l2.get("counter_efficiency") is not None
            else safe_ratio(transition_xg, shot_agg.counter_shots),
            "fast_break_rate": safe_ratio(shot_agg.counter_shots, stats.get("shots")),
        }

    def set_piece_threat(
        self,
        stats: Mapping[str, Any],
        *,
        shot_agg: Optional[ShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = shot_agg or ShotAggregates()
        sp_xg = stats.get("set_piece_xg")
        if sp_xg is None:
            sp_xg = shot_agg.set_piece_xg
        return {
            "set_piece_xg_per_match": _as_float(sp_xg),
            "set_piece_shot_rate": safe_ratio(
                shot_agg.set_piece_shots, stats.get("shots")
            ),
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        shots: Optional[Sequence[Mapping[str, Any]]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = aggregate_shots(shots or [])
        feats: dict[str, Optional[float]] = {}
        feats.update(self.chance_volume(stats, minutes=minutes))
        feats.update(self.chance_quality(stats, l2=l2, shot_agg=shot_agg))
        feats.update(self.ball_progression(stats, l2=l2))
        feats.update(self.territorial_control(stats, l2=l2))
        feats.update(self.transition_threat(stats, l2=l2, shot_agg=shot_agg))
        feats.update(self.set_piece_threat(stats, shot_agg=shot_agg))
        # Supervisory / target helpers carried alongside features
        feats["npxg"] = _as_float(
            (l2 or {}).get("npxg") if l2 and l2.get("npxg") is not None else stats.get("npxg")
        )
        feats["open_play_xg"] = _as_float(stats.get("open_play_xg"))
        feats["xg"] = _as_float(stats.get("xg"))
        feats["npxg_p90"] = per_90(feats["npxg"], minutes or self.default_minutes)
        feats["open_play_xg_p90"] = per_90(
            feats["open_play_xg"], minutes or self.default_minutes
        )
        return feats


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def build_attack_features(
    match_frame: pd.DataFrame,
    *,
    shots_by_match_team: Optional[dict[tuple[int, int], list[Mapping[str, Any]]]] = None,
    l2_frame: Optional[pd.DataFrame] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    """
    Engineer attack features for every (match_sm_id, team_sm_id) row.

    ``match_frame`` must include Layer 1 stats columns plus match metadata
    (match_sm_id, team_sm_id, is_home, and ideally match_date, duration_minutes,
    opponent_team_sm_id, season_id).
    """
    builder = AttackFeatureBuilder(default_minutes=default_minutes)
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
        feats = builder.build_row(
            stats,
            l2=l2_lookup.get(key),
            shots=shots_by_match_team.get(key),
            minutes=float(minutes) if minutes is not None else default_minutes,
        )
        meta = {
            "match_sm_id": match_id,
            "team_sm_id": team_id,
            "is_home": bool(stats.get("is_home")),
            "match_date": stats.get("match_date"),
            "season_id": stats.get("season_id"),
            "opponent_team_sm_id": stats.get("opponent_team_sm_id"),
            "xg_conceded": stats.get("xg_conceded"),
            "shots_conceded": stats.get("shots_conceded"),
            "box_entries_allowed": stats.get("box_entries_allowed"),
            "defence_rating": stats.get("defence_rating"),
            "duration_minutes": minutes,
        }
        rows.append({**meta, **feats})

    return pd.DataFrame(rows)

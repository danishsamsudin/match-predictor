"""
Finishing Rating feature engineering (Chapter 9 / Part II).

Transforms Layer 1 match team stats (+ shot aggregates) into the six component
feature groups used by the hierarchical Finishing Engine.

Polarity: higher = better finishing.
Centerpiece: Goals Minus Expected Goals = Goals − xG (not raw goals).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

from features.attack import GOAL_X, GOAL_Y, per_90, safe_ratio

# Wyscout body-part / placement tags (see src/lib/wyscout/types.ts)
BODY_LEFT = 401
BODY_RIGHT = 402
BODY_HEAD = 403
# On-target goal-mouth zones 1201–1209; corner-ish edges vs central.
CORNER_ZONES = frozenset({1201, 1203, 1207, 1209})
CENTRAL_ZONES = frozenset({1204, 1205, 1206})
ON_TARGET_ZONE_LO = 1201
ON_TARGET_ZONE_HI = 1209

CLOSE_RANGE_DIST = 12.0
HIGH_XG = 0.30
ONE_V_ONE_XG = 0.35

SHOT_ACCURACY_FEATURES = (
    "shot_accuracy_pct",
    "shot_precision_score",
    "target_placement_index",
    "central_miss_rate",
    "blocked_shot_rate",
)

SHOT_TECHNIQUE_FEATURES = (
    "header_conversion",
    "weak_foot_conversion",
    "close_range_finish_rate",
    "technique_consistency",
)

FINISHING_EFFICIENCY_FEATURES = (
    "goals_minus_xg",
    "goals_per_xg",
    "goals_per_shot",
    "npx_goals_per_xg",
    "conversion_rate",
)

CLINICAL_FINISHING_FEATURES = (
    "big_chance_conversion",
    "high_xg_conversion",
    "clinical_finishing_index",
    "big_chance_overperformance",
)

ONE_ON_ONE_FEATURES = (
    "one_v_one_conversion",
    "one_v_one_xg_overperf",
    "gk_beat_rate",
    "close_range_conversion",
)

PRESSURE_FINISHING_FEATURES = (
    "pressure_conversion",
    "pressure_shot_accuracy",
    "pressure_finishing_efficiency",
    "contested_goal_rate",
)

COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "shot_accuracy": SHOT_ACCURACY_FEATURES,
    "shot_technique": SHOT_TECHNIQUE_FEATURES,
    "finishing_efficiency": FINISHING_EFFICIENCY_FEATURES,
    "clinical_finishing": CLINICAL_FINISHING_FEATURES,
    "one_on_one_finishing": ONE_ON_ONE_FEATURES,
    "pressure_finishing": PRESSURE_FINISHING_FEATURES,
}

ALL_FINISHING_FEATURES: tuple[str, ...] = tuple(
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


def _is_on_target_zone(tag: Any) -> bool:
    t = _as_float(tag)
    if t is None:
        return False
    return ON_TARGET_ZONE_LO <= t <= ON_TARGET_ZONE_HI


@dataclass
class FinishingShotAggregates:
    n_shots: int = 0
    n_on_target: int = 0
    n_blocked: int = 0
    n_goals: int = 0
    n_corner_on_target: int = 0
    n_central_on_target: int = 0
    n_off_target_central: int = 0
    n_header: int = 0
    n_header_goals: int = 0
    n_left: int = 0
    n_left_goals: int = 0
    n_right: int = 0
    n_right_goals: int = 0
    n_close: int = 0
    n_close_goals: int = 0
    n_high_xg: int = 0
    n_high_xg_goals: int = 0
    n_opportunity: int = 0
    n_opportunity_goals: int = 0
    n_one_v_one: int = 0
    n_one_v_one_goals: int = 0
    one_v_one_xg: float = 0.0
    n_pressure: int = 0
    n_pressure_goals: int = 0
    n_pressure_on_target: int = 0
    pressure_xg: float = 0.0
    shot_xg_sum: float = 0.0
    has_shot_xg: bool = False


def aggregate_finishing_shots(
    shots: Sequence[Mapping[str, Any]],
) -> FinishingShotAggregates:
    agg = FinishingShotAggregates(n_shots=len(shots) if shots else 0)
    if not shots:
        return agg

    for s in shots:
        is_goal = bool(s.get("is_goal"))
        is_blocked = bool(s.get("is_blocked"))
        is_on_target = s.get("is_on_target")
        if is_on_target is None:
            is_on_target = is_goal or _is_on_target_zone(s.get("goal_zone_tag"))
        else:
            is_on_target = bool(is_on_target)

        zone = _as_float(s.get("goal_zone_tag"))
        body = _as_float(s.get("body_part_tag"))
        dist = _shot_distance(s.get("pos_x"), s.get("pos_y"))
        xg = _as_float(s.get("pre_shot_xg"))
        is_opp = bool(s.get("is_opportunity"))

        if is_on_target:
            agg.n_on_target += 1
        if is_blocked:
            agg.n_blocked += 1
        if is_goal:
            agg.n_goals += 1

        if zone is not None and is_on_target:
            z = int(zone)
            if z in CORNER_ZONES:
                agg.n_corner_on_target += 1
            if z in CENTRAL_ZONES:
                agg.n_central_on_target += 1
        if not is_on_target and not is_blocked and dist is not None and dist < 18.0:
            # Miss from relatively central/close positions
            try:
                y = float(s.get("pos_y"))
                if 35.0 <= y <= 65.0:
                    agg.n_off_target_central += 1
            except (TypeError, ValueError):
                pass

        if body == BODY_HEAD:
            agg.n_header += 1
            if is_goal:
                agg.n_header_goals += 1
        elif body == BODY_LEFT:
            agg.n_left += 1
            if is_goal:
                agg.n_left_goals += 1
        elif body == BODY_RIGHT:
            agg.n_right += 1
            if is_goal:
                agg.n_right_goals += 1

        if dist is not None and dist <= CLOSE_RANGE_DIST:
            agg.n_close += 1
            if is_goal:
                agg.n_close_goals += 1

        if xg is not None:
            agg.shot_xg_sum += xg
            agg.has_shot_xg = True
            if xg >= HIGH_XG:
                agg.n_high_xg += 1
                if is_goal:
                    agg.n_high_xg_goals += 1

        if is_opp:
            agg.n_opportunity += 1
            if is_goal:
                agg.n_opportunity_goals += 1

        # 1v1 proxy: close range + high xG (advancing GK / clear chance)
        if dist is not None and dist <= CLOSE_RANGE_DIST and xg is not None and xg >= ONE_V_ONE_XG:
            agg.n_one_v_one += 1
            agg.one_v_one_xg += xg
            if is_goal:
                agg.n_one_v_one_goals += 1

        # Pressure / contested proxy: blocked shots, or opportunities from distance
        is_pressure = is_blocked or (
            is_opp and dist is not None and dist > CLOSE_RANGE_DIST
        )
        if is_pressure:
            agg.n_pressure += 1
            if xg is not None:
                agg.pressure_xg += xg
            if is_goal:
                agg.n_pressure_goals += 1
            if is_on_target:
                agg.n_pressure_on_target += 1

    return agg


class FinishingFeatureBuilder:
    """Calculate the six specialised Finishing component feature groups."""

    def __init__(self, *, default_minutes: float = 90.0) -> None:
        self.default_minutes = default_minutes

    def shot_accuracy(
        self,
        stats: Mapping[str, Any],
        *,
        shot_agg: Optional[FinishingShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = shot_agg or FinishingShotAggregates()
        shots = stats.get("shots")
        sot = stats.get("shots_on_target")
        if sot is None and shot_agg.n_shots:
            sot = shot_agg.n_on_target
        if shots is None and shot_agg.n_shots:
            shots = shot_agg.n_shots

        accuracy = safe_ratio(sot, shots)
        if accuracy is None and shot_agg.n_shots:
            accuracy = shot_agg.n_on_target / shot_agg.n_shots

        precision = None
        if shot_agg.n_on_target > 0:
            # Prefer corner placement among on-target shots
            precision = shot_agg.n_corner_on_target / shot_agg.n_on_target
        placement = None
        denom = shot_agg.n_corner_on_target + shot_agg.n_central_on_target
        if denom > 0:
            placement = shot_agg.n_corner_on_target / denom

        n_shots = int(shots) if shots is not None else shot_agg.n_shots
        central_miss = safe_ratio(shot_agg.n_off_target_central, n_shots) if n_shots else None
        blocked = safe_ratio(shot_agg.n_blocked, n_shots) if n_shots else safe_ratio(
            stats.get("blocked_shots"), shots
        )
        # Polarity: higher = better → invert miss / block rates
        central_miss_inv = (1.0 - central_miss) if central_miss is not None else None
        blocked_inv = (1.0 - blocked) if blocked is not None else None

        return {
            "shot_accuracy_pct": _as_float(accuracy),
            "shot_precision_score": _as_float(precision),
            "target_placement_index": _as_float(placement),
            "central_miss_rate": _as_float(central_miss_inv),
            "blocked_shot_rate": _as_float(blocked_inv),
        }

    def shot_technique(
        self,
        stats: Mapping[str, Any],
        *,
        shot_agg: Optional[FinishingShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = shot_agg or FinishingShotAggregates()
        header_conv = safe_ratio(shot_agg.n_header_goals, shot_agg.n_header)

        # Weak foot = minority of L/R foot usage
        left_n, right_n = shot_agg.n_left, shot_agg.n_right
        if left_n + right_n > 0:
            if left_n <= right_n:
                weak_conv = safe_ratio(shot_agg.n_left_goals, left_n)
            else:
                weak_conv = safe_ratio(shot_agg.n_right_goals, right_n)
        else:
            weak_conv = None

        close_rate = safe_ratio(shot_agg.n_close_goals, shot_agg.n_close)

        rates = [r for r in (header_conv, weak_conv, close_rate) if r is not None]
        consistency = float(1.0 - np.std(rates)) if len(rates) >= 2 else (
            rates[0] if rates else None
        )

        return {
            "header_conversion": _as_float(header_conv),
            "weak_foot_conversion": _as_float(weak_conv),
            "close_range_finish_rate": _as_float(close_rate),
            "technique_consistency": _as_float(consistency),
        }

    def finishing_efficiency(
        self,
        stats: Mapping[str, Any],
    ) -> dict[str, Optional[float]]:
        goals = _as_float(stats.get("goals"))
        xg = _as_float(stats.get("xg"))
        shots = stats.get("shots")
        sot = stats.get("shots_on_target")
        npxg = _as_float(stats.get("npxg"))

        goals_minus_xg = None
        if goals is not None and xg is not None:
            goals_minus_xg = goals - xg

        # Non-penalty goals ≈ goals when npxg present (penalties rare); prefer explicit
        np_goals = _as_float(stats.get("non_penalty_goals"))
        if np_goals is None and goals is not None:
            np_goals = goals  # fallback when penalties not split

        return {
            "goals_minus_xg": _as_float(goals_minus_xg),
            "goals_per_xg": safe_ratio(goals, xg),
            "goals_per_shot": safe_ratio(goals, shots),
            "npx_goals_per_xg": safe_ratio(np_goals, npxg),
            "conversion_rate": safe_ratio(goals, sot if sot is not None else shots),
        }

    def clinical_finishing(
        self,
        stats: Mapping[str, Any],
        *,
        shot_agg: Optional[FinishingShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = shot_agg or FinishingShotAggregates()
        big = _as_float(stats.get("big_chances"))
        missed = _as_float(stats.get("big_chances_missed"))

        big_conv = None
        if big is not None and missed is not None and big > 0:
            scored = big - missed
            big_conv = scored / big if scored >= 0 else 0.0
        elif big is not None and big > 0 and stats.get("goals") is not None:
            # Cap scored big chances by goals when missed not available
            big_conv = min(float(stats["goals"]), big) / big
        elif shot_agg.n_opportunity > 0:
            big_conv = shot_agg.n_opportunity_goals / shot_agg.n_opportunity

        high_xg_conv = safe_ratio(shot_agg.n_high_xg_goals, shot_agg.n_high_xg)

        # Overperformance on big chances vs their xG share
        overperf = None
        if shot_agg.n_opportunity > 0 and shot_agg.has_shot_xg:
            # opportunity goals − share of shot xG attributed roughly by opportunity count
            opp_xg_proxy = shot_agg.shot_xg_sum * (
                shot_agg.n_opportunity / max(1, shot_agg.n_shots)
            )
            overperf = shot_agg.n_opportunity_goals - opp_xg_proxy
        elif big_conv is not None and big is not None:
            # vs naive 0.4 expected conversion on big chances
            overperf = (big_conv - 0.4) * big

        clinical_idx = None
        parts = [p for p in (big_conv, high_xg_conv) if p is not None]
        if parts:
            clinical_idx = float(np.mean(parts))

        return {
            "big_chance_conversion": _as_float(big_conv),
            "high_xg_conversion": _as_float(high_xg_conv),
            "clinical_finishing_index": _as_float(clinical_idx),
            "big_chance_overperformance": _as_float(overperf),
        }

    def one_on_one_finishing(
        self,
        stats: Mapping[str, Any],
        *,
        shot_agg: Optional[FinishingShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = shot_agg or FinishingShotAggregates()
        oo_conv = safe_ratio(shot_agg.n_one_v_one_goals, shot_agg.n_one_v_one)
        oo_xg_over = None
        if shot_agg.n_one_v_one > 0:
            oo_xg_over = shot_agg.n_one_v_one_goals - shot_agg.one_v_one_xg
        close_conv = safe_ratio(shot_agg.n_close_goals, shot_agg.n_close)
        # GK beat rate ≈ goals on 1v1 attempts (same as conversion when proxied)
        gk_beat = oo_conv if oo_conv is not None else close_conv

        return {
            "one_v_one_conversion": _as_float(oo_conv),
            "one_v_one_xg_overperf": _as_float(oo_xg_over),
            "gk_beat_rate": _as_float(gk_beat),
            "close_range_conversion": _as_float(close_conv),
        }

    def pressure_finishing(
        self,
        stats: Mapping[str, Any],
        *,
        shot_agg: Optional[FinishingShotAggregates] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = shot_agg or FinishingShotAggregates()
        press_conv = safe_ratio(shot_agg.n_pressure_goals, shot_agg.n_pressure)
        press_acc = safe_ratio(shot_agg.n_pressure_on_target, shot_agg.n_pressure)
        press_eff = None
        if shot_agg.n_pressure > 0 and shot_agg.pressure_xg > 0:
            press_eff = shot_agg.n_pressure_goals - shot_agg.pressure_xg
        elif press_conv is not None:
            press_eff = press_conv
        contested = press_conv
        # Fallback: blocked-shot survival as inverse pressure waste
        if contested is None and shot_agg.n_shots:
            contested = 1.0 - (shot_agg.n_blocked / shot_agg.n_shots)

        return {
            "pressure_conversion": _as_float(press_conv),
            "pressure_shot_accuracy": _as_float(press_acc),
            "pressure_finishing_efficiency": _as_float(press_eff),
            "contested_goal_rate": _as_float(contested),
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        shots: Optional[Sequence[Mapping[str, Any]]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        shot_agg = aggregate_finishing_shots(shots or [])
        feats: dict[str, Optional[float]] = {}
        feats.update(self.shot_accuracy(stats, shot_agg=shot_agg))
        feats.update(self.shot_technique(stats, shot_agg=shot_agg))
        feats.update(self.finishing_efficiency(stats))
        feats.update(self.clinical_finishing(stats, shot_agg=shot_agg))
        feats.update(self.one_on_one_finishing(stats, shot_agg=shot_agg))
        feats.update(self.pressure_finishing(stats, shot_agg=shot_agg))

        # Supervisory helpers
        feats["goals"] = _as_float(stats.get("goals"))
        feats["xg"] = _as_float(stats.get("xg"))
        feats["npxg"] = _as_float(stats.get("npxg"))
        feats["shots"] = _as_float(stats.get("shots"))
        feats["goals_p90"] = per_90(feats["goals"], minutes or self.default_minutes)
        return feats


def build_finishing_features(
    match_frame: pd.DataFrame,
    *,
    shots_by_match_team: Optional[dict[tuple[int, int], list[Mapping[str, Any]]]] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    """
    Engineer finishing features for every (match_sm_id, team_sm_id) row.

    ``match_frame`` must include Layer 1 stats columns plus match metadata
    (match_sm_id, team_sm_id, is_home, match_date, opponent_team_sm_id, season_id).
    """
    builder = FinishingFeatureBuilder(default_minutes=default_minutes)
    shots_by_match_team = shots_by_match_team or {}

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
            "goals_prevented": stats.get("goals_prevented"),
            "opp_xg_conceded": stats.get("opp_xg_conceded"),
            "opp_goals_prevented": stats.get("opp_goals_prevented"),
            "defence_rating": stats.get("defence_rating"),
            "goalkeeper_rating": stats.get("goalkeeper_rating"),
            "duration_minutes": minutes,
        }
        rows.append({**meta, **feats})

    return pd.DataFrame(rows)

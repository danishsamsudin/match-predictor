"""
Goalkeeper Rating feature engineering (Chapter 5 / Part II).

Transforms player-match GK stats (+ shot aggregates / L2 payload) into the five
component feature groups used by the hierarchical Goalkeeper Engine.

Polarity: higher = better goalkeeping.
Centerpiece: Goals Prevented = PSxG − Goals Conceded (not raw save %).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

import numpy as np
import pandas as pd

from features.attack import per_90, safe_ratio

SHOT_STOPPING_FEATURES = (
    "goals_prevented",
    "psxg_faced_p90",
    "psxg_save_pct",
    "save_pct",
    "high_diff_save_rate",
    "one_v_one_save_pct",
    "rebound_prevention_rate",
)

AREA_COMMAND_FEATURES = (
    "cross_claim_success",
    "punch_success_pct",
    "high_ball_success",
    "cross_intervention_rate",
    "aerial_command_index",
)

DISTRIBUTION_FEATURES = (
    "pass_completion",
    "pressure_pass_completion",
    "progressive_pass_rate",
    "progressive_distance_per_attempt",
    "long_pass_accuracy",
)

SWEEPER_FEATURES = (
    "def_actions_outside_box_p90",
    "through_ball_prevention",
    "recovery_success",
    "avg_defensive_distance",
    "proactive_defensive_index",
)

PENALTY_FEATURES = (
    "penalty_save_pct",
    "goals_prevented_from_penalties",
    "penalty_psxg_saved_rate",
)

COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "shot_stopping": SHOT_STOPPING_FEATURES,
    "area_command": AREA_COMMAND_FEATURES,
    "distribution": DISTRIBUTION_FEATURES,
    "sweeper": SWEEPER_FEATURES,
    "penalty": PENALTY_FEATURES,
}

ALL_GK_FEATURES: tuple[str, ...] = tuple(
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


def _payload_l2(stats: Mapping[str, Any]) -> dict[str, Any]:
    payload = stats.get("payload")
    if isinstance(payload, dict):
        l2 = payload.get("l2_gk")
        if isinstance(l2, dict):
            return l2
    return {}


@dataclass
class GoalkeeperFeatureBuilder:
    """Build per-component engineered features for one GK match row."""

    default_minutes: float = 90.0

    def shot_stopping(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
        shots: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Optional[float]]:
        mins = float(minutes or stats.get("minutes_played") or self.default_minutes)
        psxg = _as_float(stats.get("psxg_faced"))
        gc = _as_float(stats.get("goals_conceded"))
        saves = _as_float(stats.get("gk_saves"))
        sot = _as_float(stats.get("sot_faced"))
        l2 = _payload_l2(stats)

        goals_prevented = None
        if psxg is not None and gc is not None:
            goals_prevented = psxg - gc
        elif l2.get("goals_prevented") is not None:
            goals_prevented = _as_float(l2["goals_prevented"])

        psxg_save_pct = safe_ratio(
            (psxg - gc) if psxg is not None and gc is not None else None,
            psxg,
        )
        if psxg_save_pct is None and psxg is not None and psxg > 0 and gc is not None:
            psxg_save_pct = 1.0 - gc / psxg
        if psxg_save_pct is None:
            psxg_save_pct = _as_float(l2.get("psxg_save_pct"))

        high_diff = None
        one_v_one = None
        rebound = None
        if shots:
            hard = [s for s in shots if _as_float(s.get("post_shot_xg")) is not None and float(s["post_shot_xg"]) >= 0.3]
            hard_saved = [s for s in hard if not s.get("is_goal")]
            high_diff = safe_ratio(len(hard_saved), len(hard)) if hard else None
            # 1v1 proxy: close range high xG
            close = [
                s
                for s in shots
                if s.get("pos_x") is not None
                and float(s["pos_x"]) >= 88
                and _as_float(s.get("post_shot_xg")) is not None
            ]
            close_saved = [s for s in close if not s.get("is_goal")]
            one_v_one = safe_ratio(len(close_saved), len(close)) if close else None
            goals = [s for s in shots if s.get("is_goal")]
            # Rebound prevention: non-goals among on-target (proxy)
            ot = [s for s in shots if s.get("is_on_target")]
            rebound = safe_ratio(len(ot) - len(goals), len(ot)) if ot else None

        return {
            "goals_prevented": goals_prevented,
            "psxg_faced_p90": per_90(psxg, mins) if psxg is not None else None,
            "psxg_save_pct": psxg_save_pct,
            "save_pct": safe_ratio(saves, sot) or _as_float(l2.get("save_pct")),
            "high_diff_save_rate": high_diff,
            "one_v_one_save_pct": one_v_one,
            "rebound_prevention_rate": rebound,
        }

    def area_command(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        l2 = _payload_l2(stats)
        claims_att = _as_float(stats.get("claims_attempted"))
        claims_ok = _as_float(stats.get("claims_successful"))
        punches = _as_float(stats.get("punches"))
        crosses = _as_float(stats.get("crosses_faced"))
        aerial = _as_float(stats.get("aerial_duels_won"))
        interventions = (claims_ok or 0.0) + (punches or 0.0) + (aerial or 0.0)

        return {
            "cross_claim_success": safe_ratio(claims_ok, claims_att)
            or _as_float(l2.get("cross_claim_success")),
            "punch_success_pct": (
                1.0
                if punches is not None and punches > 0
                else (0.0 if punches == 0 else _as_float(l2.get("punch_success_pct")))
            ),
            "high_ball_success": safe_ratio(
                (claims_ok or 0.0) + (aerial or 0.0),
                claims_att,
            ),
            "cross_intervention_rate": safe_ratio(interventions or None, crosses)
            or _as_float(l2.get("cross_intervention_rate")),
            "aerial_command_index": safe_ratio(
                (claims_ok or 0.0) + (aerial or 0.0),
                crosses,
            )
            or _as_float(l2.get("aerial_command_index")),
        }

    def distribution(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        l2 = _payload_l2(stats)
        passes = _as_float(stats.get("passes"))
        passes_ok = _as_float(stats.get("passes_completed"))
        long_p = _as_float(stats.get("long_passes"))
        long_ok = _as_float(stats.get("long_passes_completed"))
        prog = _as_float(stats.get("progressive_passes"))
        prog_dist = _as_float(stats.get("progressive_pass_distance"))
        press = _as_float(stats.get("passes_under_pressure"))
        press_ok = _as_float(stats.get("passes_under_pressure_completed"))

        return {
            "pass_completion": safe_ratio(passes_ok, passes) or _as_float(l2.get("pass_completion")),
            "pressure_pass_completion": safe_ratio(press_ok, press)
            or _as_float(l2.get("pressure_pass_completion")),
            "progressive_pass_rate": safe_ratio(prog, passes)
            or _as_float(l2.get("progressive_pass_rate")),
            "progressive_distance_per_attempt": safe_ratio(prog_dist, prog)
            or _as_float(l2.get("progressive_distance_per_attempt")),
            "long_pass_accuracy": safe_ratio(long_ok, long_p)
            or _as_float(l2.get("long_pass_accuracy")),
        }

    def sweeper(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        l2 = _payload_l2(stats)
        mins = float(minutes or stats.get("minutes_played") or self.default_minutes)
        outside = _as_float(stats.get("def_actions_outside_box"))
        recoveries = _as_float(stats.get("recoveries_outside_box"))
        through = _as_float(stats.get("through_ball_interceptions"))
        avg_x = _as_float(stats.get("avg_defensive_action_x"))
        clearances = _as_float(stats.get("sweeper_clearances"))

        proactive = None
        if outside is not None or recoveries is not None or through is not None:
            proactive = (outside or 0.0) + (recoveries or 0.0) + (through or 0.0)

        return {
            "def_actions_outside_box_p90": per_90(outside, mins) if outside is not None else None,
            "through_ball_prevention": through
            if through is not None
            else _as_float(l2.get("through_ball_prevention")),
            "recovery_success": safe_ratio(recoveries, (recoveries or 0) + (clearances or 0) or None),
            "avg_defensive_distance": avg_x or _as_float(l2.get("avg_defensive_distance")),
            "proactive_defensive_index": proactive
            if proactive is not None
            else _as_float(l2.get("proactive_defensive_index")),
        }

    def penalty(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        l2 = _payload_l2(stats)
        faced = _as_float(stats.get("penalties_faced"))
        saved = _as_float(stats.get("penalties_saved"))
        pen_psxg = _as_float(stats.get("penalty_psxg_faced"))
        goals_from_pens = None
        if faced is not None and saved is not None:
            goals_from_pens = faced - saved
        gp_pens = None
        if pen_psxg is not None and goals_from_pens is not None:
            gp_pens = pen_psxg - goals_from_pens
        elif l2.get("goals_prevented_from_penalties") is not None:
            gp_pens = _as_float(l2["goals_prevented_from_penalties"])

        return {
            "penalty_save_pct": safe_ratio(saved, faced) or _as_float(l2.get("penalty_save_pct")),
            "goals_prevented_from_penalties": gp_pens,
            "penalty_psxg_saved_rate": safe_ratio(gp_pens, pen_psxg),
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        shots: Optional[list[dict[str, Any]]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        out: dict[str, Optional[float]] = {}
        out.update(self.shot_stopping(stats, minutes=minutes, shots=shots))
        out.update(self.area_command(stats))
        out.update(self.distribution(stats))
        out.update(self.sweeper(stats, minutes=minutes))
        out.update(self.penalty(stats))
        return out


def build_goalkeeper_features(
    player_frame: pd.DataFrame,
    *,
    shots_by_gk: Optional[dict[tuple[int, int], list[dict[str, Any]]]] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    """
    Engineer GK features for a player-match frame.

    Expects columns including match_sm_id, player_sm_id, team_sm_id, and raw GK stats.
    shots_by_gk keyed by (match_sm_id, player_sm_id) for shots faced by that GK.
    """
    if player_frame.empty:
        return player_frame.copy()

    builder = GoalkeeperFeatureBuilder(default_minutes=default_minutes)
    rows: list[dict[str, Any]] = []
    for idx, row in player_frame.iterrows():
        stats = row.to_dict()
        key = (int(row["match_sm_id"]), int(row["player_sm_id"]))
        shots = shots_by_gk.get(key) if shots_by_gk else None
        feats = builder.build_row(stats, shots=shots)
        rec = {
            "match_sm_id": row["match_sm_id"],
            "player_sm_id": row["player_sm_id"],
            "team_sm_id": row.get("team_sm_id"),
            "is_home": row.get("is_home"),
            "match_date": row.get("match_date"),
            "season_id": row.get("season_id"),
            "minutes_played": row.get("minutes_played", default_minutes),
            "defence_rating": row.get("defence_rating"),
            "prevention_rating": row.get("prevention_rating"),
            "protection_rating": row.get("protection_rating"),
            "control_rating": row.get("control_rating"),
            "xg_conceded": row.get("xg_conceded"),
            "penalties_faced": row.get("penalties_faced"),
            **feats,
        }
        rows.append(rec)

    return pd.DataFrame(rows, index=player_frame.index)

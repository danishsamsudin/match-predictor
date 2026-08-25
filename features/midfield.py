"""
Midfield feature engineering (Chapters 6–8).

Build-Up, Possession, and Pressing feature extractors live in one module so
shared L1/L2 transforms stay consistent, while estimation packages remain
statistically independent.

Component inventory
-------------------
Build-Up Rating
├── Progression        ← ball_progression, vertical_line_breaking
├── Retention          ← press_resistance, security
└── Distribution       ← distribution_accuracy, tempo

Possession Rating
├── Ball Retention     ← possession_security, ball_circulation
├── Territorial Control← territorial_dominance, space_control
└── Possession Control ← game_control, possession_tempo

Pressing Rating
├── Press Intensity    ← high_press, mid_block_press
├── Ball Recovery      ← counter_press, recovery_efficiency
└── Press Effectiveness← press_success, press_resistance_disruption

All engineered features use higher = better polarity.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

import numpy as np
import pandas as pd

from features.attack import per_90, per_poss, safe_ratio

# Style thresholds aligned with src/lib/glpm/layer2/styleSnapshots.ts
HIGH_PRESS_PPDA = 9.0
MID_BLOCK_PPDA_LOW = 9.0
MID_BLOCK_PPDA_HIGH = 14.0


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def _pct_to_unit(value: Any) -> Optional[float]:
    v = _as_float(value)
    if v is None:
        return None
    return v / 100.0 if v > 1.0 else v


def _invert_rate(value: Any, *, scale: float = 1.0) -> Optional[float]:
    """Map a 'lower is better' rate to a positive suppression score."""
    v = _as_float(value)
    if v is None:
        return None
    return scale / (1.0 + max(0.0, v))


def _opp_possession(possession_pct: Any) -> Optional[float]:
    p = _pct_to_unit(possession_pct)
    if p is None:
        return None
    return max(0.0, 1.0 - p)


# ---------------------------------------------------------------------------
# Build-Up (Chapter 6)
# ---------------------------------------------------------------------------

BU_BALL_PROGRESSION_FEATURES = (
    "prog_pass_rate",
    "prog_carry_rate",
    "final_third_entry_rate",
    "box_entry_rate",
)

BU_VERTICAL_LINE_BREAKING_FEATURES = (
    "through_ball_rate",
    "prog_pass_share",
    "vertical_progression_index",
)

BU_PRESS_RESISTANCE_FEATURES = (
    "press_resist_index",
    "completion_under_press",
    "turnover_under_press_inv",
)

BU_SECURITY_FEATURES = (
    "security_index",
    "incomplete_pass_inv",
    "turnover_rate_inv",
)

BU_DISTRIBUTION_ACCURACY_FEATURES = (
    "pass_completion_pct",
    "successful_pass_rate",
    "distribution_reliability",
)

BU_TEMPO_FEATURES = (
    "pass_tempo",
    "directness",
    "possession_rhythm",
)

BUILD_UP_COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "ball_progression": BU_BALL_PROGRESSION_FEATURES,
    "vertical_line_breaking": BU_VERTICAL_LINE_BREAKING_FEATURES,
    "press_resistance": BU_PRESS_RESISTANCE_FEATURES,
    "security": BU_SECURITY_FEATURES,
    "distribution_accuracy": BU_DISTRIBUTION_ACCURACY_FEATURES,
    "tempo": BU_TEMPO_FEATURES,
}

ALL_BUILD_UP_FEATURES: tuple[str, ...] = tuple(
    f for group in BUILD_UP_COMPONENT_FEATURE_GROUPS.values() for f in group
)

# ---------------------------------------------------------------------------
# Possession (Chapter 7)
# ---------------------------------------------------------------------------

PO_POSSESSION_SECURITY_FEATURES = (
    "possession_retention",
    "turnover_per_poss_inv",
    "ball_security_index",
)

PO_BALL_CIRCULATION_FEATURES = (
    "pass_completion_pct",
    "short_pass_proxy",
    "circulation_index",
)

PO_TERRITORIAL_DOMINANCE_FEATURES = (
    "field_tilt",
    "territory_pct",
    "final_third_poss_share",
)

PO_SPACE_CONTROL_FEATURES = (
    "width_index",
    "depth_index",
    "spatial_control_score",
)

PO_GAME_CONTROL_FEATURES = (
    "possession_pct",
    "sustained_possession_proxy",
    "match_control_index",
)

PO_POSSESSION_TEMPO_FEATURES = (
    "pass_frequency",
    "ball_circulation_speed",
    "tempo_consistency",
)

POSSESSION_COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "possession_security": PO_POSSESSION_SECURITY_FEATURES,
    "ball_circulation": PO_BALL_CIRCULATION_FEATURES,
    "territorial_dominance": PO_TERRITORIAL_DOMINANCE_FEATURES,
    "space_control": PO_SPACE_CONTROL_FEATURES,
    "game_control": PO_GAME_CONTROL_FEATURES,
    "possession_tempo": PO_POSSESSION_TEMPO_FEATURES,
}

ALL_POSSESSION_FEATURES: tuple[str, ...] = tuple(
    f for group in POSSESSION_COMPONENT_FEATURE_GROUPS.values() for f in group
)

# ---------------------------------------------------------------------------
# Pressing (Chapter 8)
# ---------------------------------------------------------------------------

PR_HIGH_PRESS_FEATURES = (
    "high_press_intensity",
    "high_turnovers_p90",
    "high_press_efficiency",
)

PR_MID_BLOCK_PRESS_FEATURES = (
    "mid_block_intensity",
    "press_duel_rate",
    "mid_block_success",
)

PR_COUNTER_PRESS_FEATURES = (
    "counter_press_rate",
    "immediate_recovery_proxy",
    "counter_press_efficiency",
)

PR_RECOVERY_EFFICIENCY_FEATURES = (
    "recoveries_per_opp_poss",
    "recovery_conversion",
    "defensive_sequence_efficiency",
)

PR_PRESS_SUCCESS_FEATURES = (
    "forced_turnover_rate",
    "press_success_index",
    "opp_completion_reduction",
)

PR_PRESS_RESISTANCE_DISRUPTION_FEATURES = (
    "long_balls_forced",
    "opp_progression_reduction",
    "build_up_disruption_index",
)

PRESSING_COMPONENT_FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "high_press": PR_HIGH_PRESS_FEATURES,
    "mid_block_press": PR_MID_BLOCK_PRESS_FEATURES,
    "counter_press": PR_COUNTER_PRESS_FEATURES,
    "recovery_efficiency": PR_RECOVERY_EFFICIENCY_FEATURES,
    "press_success": PR_PRESS_SUCCESS_FEATURES,
    "press_resistance_disruption": PR_PRESS_RESISTANCE_DISRUPTION_FEATURES,
}

ALL_PRESSING_FEATURES: tuple[str, ...] = tuple(
    f for group in PRESSING_COMPONENT_FEATURE_GROUPS.values() for f in group
)


def _meta_from_stats(stats: Mapping[str, Any], minutes: Any) -> dict[str, Any]:
    return {
        "match_sm_id": int(stats["match_sm_id"]),
        "team_sm_id": int(stats["team_sm_id"]),
        "is_home": bool(stats.get("is_home")),
        "match_date": stats.get("match_date"),
        "season_id": stats.get("season_id"),
        "opponent_team_sm_id": stats.get("opponent_team_sm_id"),
        "duration_minutes": minutes,
        "ppda": stats.get("ppda"),
        "high_turnovers": stats.get("high_turnovers"),
        "pass_completion_pct": stats.get("pass_completion_pct"),
        "progressive_passes": stats.get("progressive_passes"),
        "passes": stats.get("passes"),
        "possession_pct": stats.get("possession_pct"),
        "pressing_rating": stats.get("pressing_rating"),
        "build_up_rating": stats.get("build_up_rating"),
        "possession_rating": stats.get("possession_rating"),
        "opp_ppda": stats.get("opp_ppda") if stats.get("ppda_allowed") is None else stats.get("ppda_allowed"),
        "opp_high_turnovers": stats.get("opp_high_turnovers"),
        "opp_pass_completion_pct": stats.get("opp_pass_completion_pct"),
        "opp_progressive_passes": stats.get("opp_progressive_passes"),
        "opp_passes": stats.get("opp_passes"),
        "opp_clearances": stats.get("opp_clearances"),
        "opp_final_third_entries": stats.get("opp_final_third_entries"),
    }


@dataclass
class BuildUpFeatureBuilder:
    """Chapter 6 Build-Up component feature groups."""

    default_minutes: float = 90.0

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

    def vertical_line_breaking(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        prog = _as_float(stats.get("progressive_passes"))
        passes = _as_float(stats.get("passes"))
        f3 = _as_float(stats.get("final_third_entries"))
        vertical = None
        if prog is not None and prog > 0 and f3 is not None:
            vertical = f3 / prog
        return {
            "through_ball_rate": safe_ratio(stats.get("through_balls"), passes),
            "prog_pass_share": safe_ratio(prog, passes),
            "vertical_progression_index": vertical,
        }

    def press_resistance(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        completion = _pct_to_unit(stats.get("pass_completion_pct"))
        opp_ppda = _as_float(stats.get("ppda_allowed"))
        if opp_ppda is None:
            opp_ppda = _as_float(stats.get("opp_ppda"))
        # Higher opp press (lower PPDA) → harder context; reward completion under stress.
        press_intensity = None
        if opp_ppda is not None and opp_ppda > 0:
            press_intensity = 1.0 / opp_ppda
        completion_under = None
        if completion is not None and press_intensity is not None:
            completion_under = completion * (1.0 + press_intensity)
        elif completion is not None:
            completion_under = completion

        incomplete = None
        if completion is not None:
            incomplete = 1.0 - completion
        turnover_inv = _invert_rate(incomplete)

        press_resist = completion_under
        if press_resist is None and turnover_inv is not None:
            press_resist = turnover_inv

        return {
            "press_resist_index": press_resist,
            "completion_under_press": completion_under,
            "turnover_under_press_inv": turnover_inv,
        }

    def security(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        completion = _pct_to_unit(stats.get("pass_completion_pct"))
        incomplete = (1.0 - completion) if completion is not None else None
        succ = safe_ratio(stats.get("successful_passes"), stats.get("passes"))
        if succ is None and completion is not None:
            succ = completion
        inv = _invert_rate(incomplete)
        security = succ
        if security is not None and inv is not None:
            security = 0.5 * security + 0.5 * inv
        return {
            "security_index": security,
            "incomplete_pass_inv": inv,
            "turnover_rate_inv": inv,
        }

    def distribution_accuracy(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        completion = _pct_to_unit(stats.get("pass_completion_pct"))
        succ = safe_ratio(stats.get("successful_passes"), stats.get("passes"))
        if succ is None:
            succ = completion
        reliability = None
        if completion is not None and succ is not None:
            reliability = 0.5 * completion + 0.5 * succ
        elif completion is not None:
            reliability = completion
        return {
            "pass_completion_pct": completion,
            "successful_pass_rate": succ,
            "distribution_reliability": reliability,
        }

    def tempo(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        passes = _as_float(stats.get("passes"))
        poss = _pct_to_unit(stats.get("possession_pct"))
        pass_tempo = None
        if passes is not None and poss is not None and poss > 0:
            pass_tempo = passes / (poss * 90.0)
        directness = safe_ratio(stats.get("progressive_passes"), stats.get("passes"))
        rhythm = None
        if pass_tempo is not None and directness is not None:
            rhythm = pass_tempo * (1.0 - 0.5 * directness)
        elif pass_tempo is not None:
            rhythm = pass_tempo
        return {
            "pass_tempo": pass_tempo,
            "directness": directness,
            "possession_rhythm": rhythm,
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        feats: dict[str, Optional[float]] = {}
        feats.update(self.ball_progression(stats, l2=l2))
        feats.update(self.vertical_line_breaking(stats))
        feats.update(self.press_resistance(stats))
        feats.update(self.security(stats))
        feats.update(self.distribution_accuracy(stats))
        feats.update(self.tempo(stats))
        return feats


@dataclass
class PossessionFeatureBuilder:
    """Chapter 7 Possession component feature groups."""

    default_minutes: float = 90.0

    def possession_security(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        completion = _pct_to_unit(stats.get("pass_completion_pct"))
        incomplete = (1.0 - completion) if completion is not None else None
        retention = completion
        turnover_inv = _invert_rate(
            safe_ratio(incomplete, _pct_to_unit(stats.get("possession_pct")))
            if incomplete is not None
            else None
        )
        if turnover_inv is None:
            turnover_inv = _invert_rate(incomplete)
        security = retention
        if security is not None and turnover_inv is not None:
            security = 0.5 * security + 0.5 * turnover_inv
        return {
            "possession_retention": retention,
            "turnover_per_poss_inv": turnover_inv,
            "ball_security_index": security,
        }

    def ball_circulation(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        completion = _pct_to_unit(stats.get("pass_completion_pct"))
        # Short-pass proxy: completion × (1 − directness)
        directness = safe_ratio(stats.get("progressive_passes"), stats.get("passes"))
        short_proxy = None
        if completion is not None:
            d = directness if directness is not None else 0.1
            short_proxy = completion * (1.0 - min(0.8, max(0.0, d)))
        circ = None
        if completion is not None and short_proxy is not None:
            circ = 0.5 * completion + 0.5 * short_proxy
        elif completion is not None:
            circ = completion
        return {
            "pass_completion_pct": completion,
            "short_pass_proxy": short_proxy,
            "circulation_index": circ,
        }

    def territorial_dominance(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        field_tilt = _as_float(l2.get("field_tilt"))
        if field_tilt is None:
            field_tilt = _as_float(stats.get("field_tilt"))
        territory = _as_float(stats.get("territory_pct"))
        poss = _pct_to_unit(stats.get("possession_pct"))
        ft = _pct_to_unit(field_tilt) if field_tilt is not None else None
        f3_share = None
        if ft is not None and poss is not None:
            f3_share = ft * poss
        elif stats.get("final_third_entries") is not None:
            f3_share = per_poss(stats.get("final_third_entries"), stats.get("possession_pct"))
        return {
            "field_tilt": field_tilt,
            "territory_pct": territory,
            "final_third_poss_share": f3_share,
        }

    def space_control(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        # Width proxy: crosses / passes; depth: progressive carries / passes
        width = safe_ratio(stats.get("crosses"), stats.get("passes"))
        depth = safe_ratio(stats.get("progressive_carries"), stats.get("passes"))
        spatial = None
        if width is not None and depth is not None:
            spatial = 0.5 * width + 0.5 * depth
        elif width is not None:
            spatial = width
        elif depth is not None:
            spatial = depth
        return {
            "width_index": width,
            "depth_index": depth,
            "spatial_control_score": spatial,
        }

    def game_control(self, stats: Mapping[str, Any]) -> dict[str, Optional[float]]:
        poss = _pct_to_unit(stats.get("possession_pct"))
        passes = _as_float(stats.get("passes"))
        sustained = None
        if poss is not None and passes is not None:
            sustained = poss * (passes / 500.0)
        control = poss
        if control is not None and sustained is not None:
            control = 0.5 * control + 0.5 * min(1.5, sustained)
        return {
            "possession_pct": poss,
            "sustained_possession_proxy": sustained,
            "match_control_index": control,
        }

    def possession_tempo(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        passes = _as_float(stats.get("passes"))
        poss = _pct_to_unit(stats.get("possession_pct"))
        freq = None
        if passes is not None and poss is not None and poss > 0:
            freq = passes / (poss * 90.0)
        speed = freq
        consistency = None
        completion = _pct_to_unit(stats.get("pass_completion_pct"))
        if freq is not None and completion is not None:
            # Stable tempo: moderate frequency with high completion
            consistency = completion / (1.0 + abs(freq - 10.0) / 10.0)
        return {
            "pass_frequency": freq,
            "ball_circulation_speed": speed,
            "tempo_consistency": consistency,
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        feats: dict[str, Optional[float]] = {}
        feats.update(self.possession_security(stats))
        feats.update(self.ball_circulation(stats))
        feats.update(self.territorial_dominance(stats, l2=l2))
        feats.update(self.space_control(stats))
        feats.update(self.game_control(stats))
        feats.update(self.possession_tempo(stats))
        return feats


@dataclass
class PressingFeatureBuilder:
    """Chapter 8 Pressing component feature groups."""

    default_minutes: float = 90.0

    def high_press(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        m = minutes if minutes is not None else self.default_minutes
        l2 = l2 or {}
        ppda = _as_float(l2.get("ppda"))
        if ppda is None:
            ppda = _as_float(stats.get("ppda"))
        ppda_inv = (1.0 / ppda) if ppda is not None and ppda > 0 else None
        # High-press intensity peaks when PPDA is at or below high-press threshold
        high_intensity = None
        if ppda is not None and ppda > 0:
            if ppda <= HIGH_PRESS_PPDA:
                high_intensity = 1.0 / ppda
            else:
                high_intensity = (1.0 / ppda) * (HIGH_PRESS_PPDA / ppda)
        ht = per_90(stats.get("high_turnovers"), m)
        efficiency = None
        if high_intensity is not None and ht is not None:
            efficiency = high_intensity * (1.0 + ht / 10.0)
        elif ppda_inv is not None:
            efficiency = ppda_inv
        return {
            "high_press_intensity": high_intensity if high_intensity is not None else ppda_inv,
            "high_turnovers_p90": ht,
            "high_press_efficiency": efficiency,
        }

    def mid_block_press(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Optional[float]]:
        l2 = l2 or {}
        ppda = _as_float(l2.get("ppda"))
        if ppda is None:
            ppda = _as_float(stats.get("ppda"))
        mid_intensity = None
        if ppda is not None:
            if MID_BLOCK_PPDA_LOW < ppda <= MID_BLOCK_PPDA_HIGH:
                # Peak in mid-block band
                mid = (MID_BLOCK_PPDA_LOW + MID_BLOCK_PPDA_HIGH) / 2.0
                mid_intensity = 1.0 - abs(ppda - mid) / mid
            elif ppda > 0:
                mid_intensity = max(0.0, 1.0 - abs(ppda - 11.5) / 20.0)
        press_duels = stats.get("pressing_duels")
        pressures = stats.get("pressures")
        duel_rate = (
            safe_ratio(press_duels, pressures)
            if press_duels is not None and pressures is not None
            else safe_ratio(pressures, stats.get("defensive_actions"))
        )
        success = None
        if mid_intensity is not None and duel_rate is not None:
            success = 0.5 * mid_intensity + 0.5 * duel_rate
        elif mid_intensity is not None:
            success = mid_intensity
        return {
            "mid_block_intensity": mid_intensity,
            "press_duel_rate": duel_rate,
            "mid_block_success": success,
        }

    def counter_press(
        self,
        stats: Mapping[str, Any],
        *,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        m = minutes if minutes is not None else self.default_minutes
        recoveries = _as_float(stats.get("ball_recoveries"))
        high_to = _as_float(stats.get("high_turnovers"))
        # ≤5s recovery proxy: share of recoveries that are high turnovers
        immediate = safe_ratio(high_to, recoveries)
        counter_rate = per_90(high_to, m)
        efficiency = immediate
        if efficiency is not None and counter_rate is not None:
            efficiency = 0.5 * efficiency + 0.5 * min(1.0, counter_rate / 10.0)
        return {
            "counter_press_rate": counter_rate,
            "immediate_recovery_proxy": immediate,
            "counter_press_efficiency": efficiency,
        }

    def recovery_efficiency(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        opp_poss = _opp_possession(stats.get("possession_pct"))
        recoveries = _as_float(stats.get("ball_recoveries"))
        per_opp = None
        if recoveries is not None and opp_poss is not None and opp_poss > 0:
            per_opp = recoveries / (opp_poss * 100.0)
        conversion = safe_ratio(stats.get("high_turnovers"), recoveries)
        actions = _as_float(stats.get("defensive_actions"))
        seq_eff = safe_ratio(recoveries, actions)
        return {
            "recoveries_per_opp_poss": per_opp,
            "recovery_conversion": conversion,
            "defensive_sequence_efficiency": seq_eff,
        }

    def press_success(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        pressures = _as_float(stats.get("pressures"))
        high_to = _as_float(stats.get("high_turnovers"))
        forced = safe_ratio(high_to, pressures)
        duel_rate = safe_ratio(stats.get("pressing_duels"), pressures)
        success = forced
        if success is not None and duel_rate is not None:
            success = 0.5 * success + 0.5 * duel_rate

        opp_comp = _pct_to_unit(stats.get("opp_pass_completion_pct"))
        # Lower opponent completion ⇒ stronger disruption; map to reduction score
        reduction = None
        if opp_comp is not None:
            reduction = max(0.0, 0.85 - opp_comp)  # league-ish baseline ~85%
        return {
            "forced_turnover_rate": forced,
            "press_success_index": success,
            "opp_completion_reduction": reduction,
        }

    def press_resistance_disruption(
        self, stats: Mapping[str, Any]
    ) -> dict[str, Optional[float]]:
        # Long balls forced ≈ opponent clearances under press
        long_forced = per_90(stats.get("opp_clearances"), 90.0)
        opp_prog = safe_ratio(
            stats.get("opp_progressive_passes"), stats.get("opp_passes")
        )
        # Lower opp progression ⇒ higher disruption
        prog_reduction = _invert_rate(opp_prog, scale=0.2) if opp_prog is not None else None
        opp_f3 = safe_ratio(
            stats.get("opp_final_third_entries"), stats.get("opp_passes")
        )
        disruption = None
        parts = [p for p in (long_forced, prog_reduction, _invert_rate(opp_f3)) if p is not None]
        if parts:
            disruption = float(np.mean(parts))
        return {
            "long_balls_forced": long_forced,
            "opp_progression_reduction": prog_reduction,
            "build_up_disruption_index": disruption,
        }

    def build_row(
        self,
        stats: Mapping[str, Any],
        *,
        l2: Optional[Mapping[str, Any]] = None,
        minutes: Optional[float] = None,
    ) -> dict[str, Optional[float]]:
        m = minutes if minutes is not None else self.default_minutes
        feats: dict[str, Optional[float]] = {}
        feats.update(self.high_press(stats, minutes=m, l2=l2))
        feats.update(self.mid_block_press(stats, l2=l2))
        feats.update(self.counter_press(stats, minutes=m))
        feats.update(self.recovery_efficiency(stats))
        feats.update(self.press_success(stats))
        feats.update(self.press_resistance_disruption(stats))
        # Carry supervisory helpers
        ppda = _as_float((l2 or {}).get("ppda") if l2 else None)
        if ppda is None:
            ppda = _as_float(stats.get("ppda"))
        feats["ppda_inv"] = (1.0 / ppda) if ppda is not None and ppda > 0 else None
        return feats


def _l2_lookup(
    l2_frame: Optional[pd.DataFrame],
) -> dict[tuple[int, int], Mapping[str, Any]]:
    lookup: dict[tuple[int, int], Mapping[str, Any]] = {}
    if l2_frame is not None and not l2_frame.empty:
        for _, row in l2_frame.iterrows():
            key = (int(row["match_sm_id"]), int(row["team_sm_id"]))
            lookup[key] = row.to_dict()
    return lookup


def build_build_up_features(
    match_frame: pd.DataFrame,
    *,
    l2_frame: Optional[pd.DataFrame] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    builder = BuildUpFeatureBuilder(default_minutes=default_minutes)
    l2_map = _l2_lookup(l2_frame)
    rows: list[dict[str, Any]] = []
    for _, raw in match_frame.iterrows():
        stats = raw.to_dict()
        match_id = int(stats["match_sm_id"])
        team_id = int(stats["team_sm_id"])
        minutes = stats.get("duration_minutes")
        if minutes is None:
            minutes = default_minutes
        feats = builder.build_row(
            stats,
            l2=l2_map.get((match_id, team_id)),
            minutes=float(minutes),
        )
        rows.append({**_meta_from_stats(stats, minutes), **feats})
    return pd.DataFrame(rows)


def build_possession_features(
    match_frame: pd.DataFrame,
    *,
    l2_frame: Optional[pd.DataFrame] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    builder = PossessionFeatureBuilder(default_minutes=default_minutes)
    l2_map = _l2_lookup(l2_frame)
    rows: list[dict[str, Any]] = []
    for _, raw in match_frame.iterrows():
        stats = raw.to_dict()
        match_id = int(stats["match_sm_id"])
        team_id = int(stats["team_sm_id"])
        minutes = stats.get("duration_minutes")
        if minutes is None:
            minutes = default_minutes
        feats = builder.build_row(
            stats,
            l2=l2_map.get((match_id, team_id)),
            minutes=float(minutes),
        )
        rows.append({**_meta_from_stats(stats, minutes), **feats})
    return pd.DataFrame(rows)


def build_pressing_features(
    match_frame: pd.DataFrame,
    *,
    l2_frame: Optional[pd.DataFrame] = None,
    default_minutes: float = 90.0,
) -> pd.DataFrame:
    builder = PressingFeatureBuilder(default_minutes=default_minutes)
    l2_map = _l2_lookup(l2_frame)
    rows: list[dict[str, Any]] = []
    for _, raw in match_frame.iterrows():
        stats = raw.to_dict()
        match_id = int(stats["match_sm_id"])
        team_id = int(stats["team_sm_id"])
        minutes = stats.get("duration_minutes")
        if minutes is None:
            minutes = default_minutes
        feats = builder.build_row(
            stats,
            l2=l2_map.get((match_id, team_id)),
            minutes=float(minutes),
        )
        rows.append({**_meta_from_stats(stats, minutes), **feats})
    return pd.DataFrame(rows)

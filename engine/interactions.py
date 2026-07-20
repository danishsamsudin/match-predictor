"""
Multi-dimensional interaction matrix (Chapter 11.8).

Evaluates tactical matchups between Home and Away GLPM Rating Vectors:
  Attack vs Defence, Finishing vs Goalkeeper, Build-Up vs Pressing,
  Possession vs Pressing — and the inverse (Away attacking) pairings.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np

from core.vector import PRIMARY_ORDER, PrimaryKey, RatingVector
from engine.config import XgEngineConfig


def _as_rating_map(source: RatingVector | Mapping[str, float]) -> dict[PrimaryKey, float]:
    if isinstance(source, RatingVector):
        return {k: float(source.get(k)) for k in PRIMARY_ORDER}
    out: dict[PrimaryKey, float] = {}
    for key in PRIMARY_ORDER:
        raw = source.get(key, float("nan"))
        out[key] = float(raw) if raw is not None else float("nan")
    return out


def rating_to_z(rating: float, *, center: float, scale: float) -> float:
    """Map a 0–100 GLPM rating onto a centered z-score; NaN → 0 (neutral)."""
    if not np.isfinite(rating):
        return 0.0
    if scale <= 0:
        return 0.0
    return (float(rating) - center) / scale


def resolve_rating(
    values: Mapping[PrimaryKey, float],
    key: PrimaryKey,
    *,
    center: float,
) -> float:
    """Return rating value, falling back to ``center`` when missing/NaN."""
    raw = values.get(key, float("nan"))
    if raw is None or not np.isfinite(raw):
        return float(center)
    return float(raw)


@dataclass(frozen=True)
class SideInteractions:
    """Per-pair deltas and capped strength index for one attacking side."""

    attack_defence: float
    finishing_goalkeeper: float
    build_up_pressing: float
    possession_pressing: float
    delta_s: float
    delta_s_raw: float

    def to_dict(self) -> dict[str, float]:
        return {
            "attack_defence": self.attack_defence,
            "finishing_goalkeeper": self.finishing_goalkeeper,
            "build_up_pressing": self.build_up_pressing,
            "possession_pressing": self.possession_pressing,
            "delta_s": self.delta_s,
            "delta_s_raw": self.delta_s_raw,
        }


@dataclass(frozen=True)
class InteractionMatrixResult:
    home: SideInteractions
    away: SideInteractions
    home_ratings: dict[str, float]
    away_ratings: dict[str, float]

    def to_dict(self) -> dict[str, object]:
        return {
            "home": self.home.to_dict(),
            "away": self.away.to_dict(),
            "home_ratings": dict(self.home_ratings),
            "away_ratings": dict(self.away_ratings),
        }


def _side_delta_s(
    attack_z: float,
    finishing_z: float,
    build_up_z: float,
    possession_z: float,
    opp_defence_z: float,
    opp_gk_z: float,
    opp_pressing_z: float,
    weights: Mapping[str, float],
    cap: float,
) -> SideInteractions:
    d_ad = attack_z - opp_defence_z
    d_fr = finishing_z - opp_gk_z
    d_bu = build_up_z - opp_pressing_z
    d_po = possession_z - opp_pressing_z
    raw = (
        weights["attack_defence"] * d_ad
        + weights["finishing_goalkeeper"] * d_fr
        + weights["build_up_pressing"] * d_bu
        + weights["possession_pressing"] * d_po
    )
    capped = float(np.clip(raw, -cap, cap))
    return SideInteractions(
        attack_defence=float(d_ad),
        finishing_goalkeeper=float(d_fr),
        build_up_pressing=float(d_bu),
        possession_pressing=float(d_po),
        delta_s=capped,
        delta_s_raw=float(raw),
    )


def compute_interaction_matrix(
    home: RatingVector | Mapping[str, float],
    away: RatingVector | Mapping[str, float],
    config: XgEngineConfig,
) -> InteractionMatrixResult:
    """
    Parse Home and Away vectors concurrently and evaluate the §11.8 matchups.

    Home attacking: A_H vs D_A, FR_H vs GK_A, BU_H vs PR_A, PO_H vs PR_A.
    Away attacking: same with roles swapped.
    """
    center = config.rating_center
    scale = config.rating_scale
    weights = config.normalized_weights()
    cap = config.delta_s_cap

    home_map = _as_rating_map(home)
    away_map = _as_rating_map(away)

    home_resolved = {k: resolve_rating(home_map, k, center=center) for k in PRIMARY_ORDER}
    away_resolved = {k: resolve_rating(away_map, k, center=center) for k in PRIMARY_ORDER}

    z_h = {k: rating_to_z(home_resolved[k], center=center, scale=scale) for k in PRIMARY_ORDER}
    z_a = {k: rating_to_z(away_resolved[k], center=center, scale=scale) for k in PRIMARY_ORDER}

    home_side = _side_delta_s(
        z_h["attack"],
        z_h["finishing"],
        z_h["build_up"],
        z_h["possession"],
        z_a["defence"],
        z_a["goalkeeper"],
        z_a["pressing"],
        weights,
        cap,
    )
    away_side = _side_delta_s(
        z_a["attack"],
        z_a["finishing"],
        z_a["build_up"],
        z_a["possession"],
        z_h["defence"],
        z_h["goalkeeper"],
        z_h["pressing"],
        weights,
        cap,
    )

    return InteractionMatrixResult(
        home=home_side,
        away=away_side,
        home_ratings={k: home_resolved[k] for k in PRIMARY_ORDER},
        away_ratings={k: away_resolved[k] for k in PRIMARY_ORDER},
    )

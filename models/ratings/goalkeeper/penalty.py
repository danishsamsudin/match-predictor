"""
Bayesian shrinkage for rare penalty events (Chapter 5.13.5).

θ* = (n / (n + k)) * θ̂ + (k / (n + k)) * μ₀
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

DEFAULT_PRIOR_STRENGTH = 8.0
DEFAULT_LEAGUE_SAVE_PCT = 0.25


def bayesian_shrink(
    estimate: float,
    n: float,
    prior: float,
    *,
    k: float = DEFAULT_PRIOR_STRENGTH,
) -> float:
    """Shrink a rate/mean toward ``prior`` with strength ``k``."""
    n = max(0.0, float(n))
    k = max(0.0, float(k))
    if n + k <= 0:
        return float(prior)
    return (n / (n + k)) * float(estimate) + (k / (n + k)) * float(prior)


def shrink_penalty_features(
    df: pd.DataFrame,
    *,
    k: float = DEFAULT_PRIOR_STRENGTH,
    league_save_prior: Optional[float] = None,
    group_col: str = "player_sm_id",
) -> pd.DataFrame:
    """
    Add shrunk penalty columns used by the Penalty component model.

    - ``penalty_save_pct_shrunk``
    - ``goals_prevented_from_penalties_shrunk``
    """
    out = df.copy()
    if "penalty_save_pct" not in out.columns:
        out["penalty_save_pct"] = np.nan
    if "goals_prevented_from_penalties" not in out.columns:
        out["goals_prevented_from_penalties"] = np.nan
    if "penalties_faced" not in out.columns:
        out["penalties_faced"] = 0.0

    faced = out["penalties_faced"].astype(float).fillna(0.0)
    save_pct = out["penalty_save_pct"].astype(float)
    gp_pens = out["goals_prevented_from_penalties"].astype(float)

    if league_save_prior is None:
        mask = (faced > 0) & save_pct.notna()
        if mask.any():
            # Weighted league prior
            league_save_prior = float(
                np.average(save_pct[mask].to_numpy(), weights=faced[mask].to_numpy())
            )
        else:
            league_save_prior = DEFAULT_LEAGUE_SAVE_PCT

    # Cumulative sample size per keeper (career-in-frame), then per-row n = match faced
    # For match-level features use match n; for stability also use rolling career n.
    career_n = faced.groupby(out[group_col]).cumsum()
    n_eff = career_n.clip(lower=0)

    out["penalty_save_pct_shrunk"] = [
        bayesian_shrink(
            float(s) if np.isfinite(s) else league_save_prior,
            float(n),
            league_save_prior,
            k=k,
        )
        for s, n in zip(save_pct.to_numpy(), n_eff.to_numpy())
    ]

    # Prior for goals prevented: 0 (league-average GK neither over/under performs)
    gp_prior = 0.0
    out["goals_prevented_from_penalties_shrunk"] = [
        bayesian_shrink(
            float(g) if np.isfinite(g) else gp_prior,
            float(n),
            gp_prior,
            k=k,
        )
        for g, n in zip(gp_pens.to_numpy(), n_eff.to_numpy())
    ]
    return out

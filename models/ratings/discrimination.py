"""
Detect collapsed (non-discriminating) calibrated ratings.

Early-season runs with sparse match stats can produce identical latent scores
for every club. After percentile calibration that often maps to a shared high
0–100 score (e.g. all Attack = 92.9). Those vectors must not overwrite a
healthy prior season or be used for matchup prediction.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np
import pandas as pd

# Max−min across teams below this ⇒ treat as "no trained signal".
MIN_RATING_SPREAD = 1.0


def rating_spread(values: Sequence[float] | np.ndarray) -> float:
    arr = np.asarray(list(values), dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size < 2:
        return 0.0
    return float(arr.max() - arr.min())


def scores_discriminate(
    values: Sequence[float] | np.ndarray,
    *,
    min_spread: float = MIN_RATING_SPREAD,
) -> bool:
    return rating_spread(values) >= min_spread


def team_summary_discriminates(
    team_summary: pd.DataFrame,
    rating_col: str,
    *,
    min_spread: float = MIN_RATING_SPREAD,
) -> bool:
    if team_summary is None or team_summary.empty or rating_col not in team_summary.columns:
        return False
    return scores_discriminate(team_summary[rating_col].to_numpy(), min_spread=min_spread)

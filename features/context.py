"""Match context helpers for Attack Rating adjustments (Chapter 3.8)."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def compute_rest_days(match_dates: pd.Series, team_ids: pd.Series) -> pd.Series:
    """Days since each team's previous match (NaN for first observed match)."""
    frame = pd.DataFrame(
        {
            "team_sm_id": team_ids.to_numpy(),
            "match_date": pd.to_datetime(match_dates),
        }
    )
    frame = frame.sort_values(["team_sm_id", "match_date"])
    prev = frame.groupby("team_sm_id")["match_date"].shift(1)
    rest = (frame["match_date"] - prev).dt.days.astype("Float64")
    return rest.reindex(frame.index).sort_index()


def compute_congestion(
    rest_days: pd.Series,
    *,
    congested_threshold: int = 4,
) -> pd.Series:
    """1 if rest days <= threshold (fixture congestion), else 0."""
    out = pd.Series(np.nan, index=rest_days.index, dtype="Float64")
    known = rest_days.notna()
    out.loc[known] = (rest_days.loc[known] <= congested_threshold).astype(float)
    return out


def home_advantage_flag(is_home: pd.Series) -> pd.Series:
    return is_home.astype(float)


def build_context_frame(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add rest_days, congestion, and home_flag columns.

    Expects columns: team_sm_id, match_date, is_home.
    """
    out = df.copy()
    if "rest_days" not in out.columns:
        out["rest_days"] = compute_rest_days(out["match_date"], out["team_sm_id"])
    if "congestion" not in out.columns:
        out["congestion"] = compute_congestion(out["rest_days"])
    out["home_flag"] = home_advantage_flag(out["is_home"])
    # Neutral rest baseline for missing first matches
    out["rest_days"] = out["rest_days"].fillna(7.0)
    out["congestion"] = out["congestion"].fillna(0.0)
    return out


def context_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    """Design matrix for additive context offsets: [home, rest_centered, congestion]."""
    rest = df["rest_days"].astype(float).to_numpy()
    rest_c = rest - 7.0  # centre on a typical weekly schedule
    return np.column_stack(
        [
            df["home_flag"].astype(float).to_numpy(),
            rest_c,
            df["congestion"].astype(float).to_numpy(),
        ]
    )


def empty_context_row() -> dict[str, Any]:
    return {"rest_days": 7.0, "congestion": 0.0, "home_flag": 0.0}

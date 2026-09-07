"""
Training-set eligibility for GLPM rating engines.

``glpm_match_team_stats`` holds a placeholder row per side for every scheduled
fixture, so a season fixture list of 380 games yields 760 rows even when only a
handful have been played. Those placeholder rows carry NULL stats; once median
imputation fills them they become identical feature vectors, which flattens
every calibrated 0-100 rating. Rating engines must therefore train only on
matches that actually produced statistics.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional, Sequence

import pandas as pd

# SportMonks status strings (lowercased) for matches that reached a result.
FINISHED_MATCH_STATUSES = frozenset(
    {
        "full time",
        "after extra time",
        "after penalties",
        "ft",
        "aet",
        "ft_pen",
        "finished",
        "ended",
    }
)

# Core Layer 1 stats. A row with none of these recorded never had a match.
CORE_STAT_COLUMNS: tuple[str, ...] = (
    "goals",
    "xg",
    "shots",
    "shots_on_target",
    "passes",
    "possession_pct",
    "defensive_actions",
    "ball_recoveries",
)


def is_finished_status(value: Any) -> bool:
    return str(value or "").strip().lower() in FINISHED_MATCH_STATUSES


def finished_matches(matches: Iterable[dict]) -> list[dict]:
    """Keep only match rows whose status indicates a completed match."""
    return [m for m in matches if is_finished_status(m.get("status"))]


def drop_unrecorded_stat_rows(
    stats_df: pd.DataFrame,
    *,
    stat_columns: Optional[Sequence[str]] = None,
) -> pd.DataFrame:
    """
    Drop team-stat rows that carry no recorded statistics at all.

    Safety net for provider status strings we do not recognise: a played match
    always populates at least one core stat.
    """
    if stats_df.empty:
        return stats_df
    cols = [c for c in (stat_columns or CORE_STAT_COLUMNS) if c in stats_df.columns]
    if not cols:
        return stats_df
    keep = stats_df[cols].notna().any(axis=1)
    return stats_df[keep].copy()

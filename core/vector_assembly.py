"""
Assemble the GLPM Rating Vector R from primary rating tables (Chapter 10.14).
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

import numpy as np
import pandas as pd

from core.vector import (
    PRIMARY_ORDER,
    PrimaryKey,
    RatingMetadata,
    RatingVector,
    classify_trend,
)

TEAM_PRIMARY_KEYS: tuple[PrimaryKey, ...] = (
    "attack",
    "defence",
    "build_up",
    "possession",
    "pressing",
    "finishing",
)

TREND_WINDOW = 5
MODEL_VERSION = "vector_v1"


def _as_of_str(value: Any) -> str:
    if value is None:
        return date.today().isoformat()
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()[:10]
        except Exception:
            pass
    return str(value)[:10]


def _latest_as_of(
    df: pd.DataFrame,
    *,
    as_of_date: str,
) -> pd.DataFrame:
    """Keep rows with as_of_date <= target."""
    if df.empty:
        return df
    work = df.copy()
    work["as_of_date"] = work["as_of_date"].map(_as_of_str)
    return work[work["as_of_date"] <= as_of_date]


def _pick_latest_row(group: pd.DataFrame) -> Optional[pd.Series]:
    if group.empty:
        return None
    g = group.sort_values("as_of_date")
    return g.iloc[-1]


def aggregate_team_goalkeeper(
    player_gk: pd.DataFrame,
    minutes: Optional[pd.DataFrame] = None,
    *,
    team_sm_id: int,
    season_id: int,
    as_of_date: str,
) -> Optional[RatingMetadata]:
    """
    Minutes-weighted average of squad GK player ratings as of the target date.
    Falls back to equal weights when minutes are unavailable.
    """
    if player_gk is None or player_gk.empty:
        return None

    work = _latest_as_of(player_gk, as_of_date=as_of_date)
    work = work[
        (work["team_sm_id"].astype(int) == int(team_sm_id))
        & (work["season_id"].astype(int) == int(season_id))
    ]
    if work.empty:
        return None

    # Latest rating per player
    latest = (
        work.sort_values("as_of_date")
        .groupby("player_sm_id", as_index=False)
        .tail(1)
        .copy()
    )
    if latest.empty:
        return None

    weights = np.ones(len(latest), dtype=float)
    if minutes is not None and not minutes.empty:
        m = minutes.copy()
        m = m[
            (m["team_sm_id"].astype(int) == int(team_sm_id))
            & (m["season_id"].astype(int) == int(season_id))
        ]
        minute_map = {
            int(r["player_sm_id"]): float(r["minutes_played"] or 0.0)
            for _, r in m.iterrows()
        }
        weights = np.array(
            [max(minute_map.get(int(pid), 0.0), 0.0) for pid in latest["player_sm_id"]],
            dtype=float,
        )
        if weights.sum() <= 0:
            weights = np.ones(len(latest), dtype=float)

    ratings = latest["rating"].astype(float).to_numpy()
    confs = latest["confidence"].astype(float).to_numpy()
    vars_ = latest["variance"].astype(float).to_numpy()

    wsum = float(weights.sum())
    mu = float(np.average(ratings, weights=weights))
    conf = float(np.average(confs, weights=weights))
    # Pooled variance of the weighted mean (approx)
    var = float(np.average(vars_, weights=weights) + np.average((ratings - mu) ** 2, weights=weights))

    return RatingMetadata(
        current_value=mu,
        confidence=conf,
        matches_used=int(len(latest)),
        last_updated=as_of_date,
        variance=max(var, 0.0),
        recent_trend="flat",
        trend_delta=0.0,
        historical_peak=mu,
        historical_low=mu,
    )


def _enrich_metadata_from_history(
    meta: RatingMetadata,
    history: pd.DataFrame,
    *,
    team_sm_id: int,
    name: str,
    as_of_date: str,
    window: int = TREND_WINDOW,
) -> RatingMetadata:
    if history is None or history.empty:
        return meta

    h = history[
        (history["team_sm_id"].astype(int) == int(team_sm_id))
        & (history["name"] == name)
    ].copy()
    if h.empty:
        return meta

    h["as_of_date"] = h["as_of_date"].map(_as_of_str)
    h = h[h["as_of_date"] <= as_of_date].sort_values("as_of_date")
    if h.empty:
        return meta

    vals = h["rating"].astype(float)
    peak = float(vals.max())
    low = float(vals.min())
    recent = vals.tail(window)
    if len(recent) >= 2:
        delta = float(recent.iloc[-1] - recent.iloc[0])
    else:
        delta = 0.0

    return RatingMetadata(
        current_value=meta.current_value,
        confidence=meta.confidence,
        matches_used=meta.matches_used if meta.matches_used > 0 else int(len(h)),
        last_updated=as_of_date,
        variance=meta.variance,
        recent_trend=classify_trend(delta),
        trend_delta=delta,
        historical_peak=peak,
        historical_low=low,
    )


def _metadata_from_row(row: pd.Series, as_of_date: str) -> RatingMetadata:
    return RatingMetadata(
        current_value=float(row["rating"]),
        confidence=float(row.get("confidence") or 0.5),
        matches_used=int(row.get("matches_used") or 0),
        last_updated=as_of_date,
        variance=float(row.get("variance") or 0.0),
        recent_trend=(row.get("recent_trend") or "flat"),  # type: ignore[arg-type]
        trend_delta=float(row.get("trend_delta") or 0.0),
        historical_peak=(
            float(row["historical_peak"])
            if row.get("historical_peak") is not None
            and not (isinstance(row.get("historical_peak"), float) and np.isnan(row.get("historical_peak")))
            else float(row["rating"])
        ),
        historical_low=(
            float(row["historical_low"])
            if row.get("historical_low") is not None
            and not (isinstance(row.get("historical_low"), float) and np.isnan(row.get("historical_low")))
            else float(row["rating"])
        ),
    )


def assemble_rating_vector_from_frames(
    *,
    team_sm_id: int,
    season_id: int,
    as_of_date: str,
    team_primaries: pd.DataFrame,
    player_gk: Optional[pd.DataFrame] = None,
    gk_minutes: Optional[pd.DataFrame] = None,
    history: Optional[pd.DataFrame] = None,
    model_version: str = MODEL_VERSION,
) -> RatingVector:
    """
    Pure-frame assembler (no DB). Used by IO wrapper and unit tests.
    """
    as_of = _as_of_str(as_of_date)
    values: dict[PrimaryKey, float] = {}
    metadata: dict[PrimaryKey, RatingMetadata] = {}

    prim = _latest_as_of(team_primaries, as_of_date=as_of) if team_primaries is not None else pd.DataFrame()
    if not prim.empty:
        prim = prim[
            (prim["team_sm_id"].astype(int) == int(team_sm_id))
            & (prim["season_id"].astype(int) == int(season_id))
        ]

    for key in TEAM_PRIMARY_KEYS:
        subset = prim[prim["rating_type"] == key] if not prim.empty else pd.DataFrame()
        row = _pick_latest_row(subset) if not subset.empty else None
        if row is None:
            values[key] = float("nan")
            metadata[key] = RatingMetadata.missing()
            continue
        meta = _metadata_from_row(row, as_of)
        if history is not None:
            meta = _enrich_metadata_from_history(
                meta, history, team_sm_id=team_sm_id, name=key, as_of_date=as_of
            )
        # Prefer stored matches_used; else count history rows
        if meta.matches_used <= 0 and history is not None and not history.empty:
            n = len(
                history[
                    (history["team_sm_id"].astype(int) == int(team_sm_id))
                    & (history["name"] == key)
                    & (history["as_of_date"].map(_as_of_str) <= as_of)
                ]
            )
            meta.matches_used = n
        values[key] = float(meta.current_value)
        metadata[key] = meta

    # Goalkeeper: prefer existing team primary; else minutes-weighted player agg
    gk_subset = (
        prim[prim["rating_type"] == "goalkeeper"] if not prim.empty else pd.DataFrame()
    )
    gk_row = _pick_latest_row(gk_subset) if not gk_subset.empty else None
    if gk_row is not None:
        gk_meta = _metadata_from_row(gk_row, as_of)
        if history is not None:
            gk_meta = _enrich_metadata_from_history(
                gk_meta,
                history,
                team_sm_id=team_sm_id,
                name="goalkeeper",
                as_of_date=as_of,
            )
        values["goalkeeper"] = float(gk_meta.current_value)
        metadata["goalkeeper"] = gk_meta
    else:
        gk_meta = aggregate_team_goalkeeper(
            player_gk if player_gk is not None else pd.DataFrame(),
            gk_minutes,
            team_sm_id=team_sm_id,
            season_id=season_id,
            as_of_date=as_of,
        )
        if gk_meta is None:
            values["goalkeeper"] = float("nan")
            metadata["goalkeeper"] = RatingMetadata.missing()
        else:
            values["goalkeeper"] = float(gk_meta.current_value)
            metadata["goalkeeper"] = gk_meta

    return RatingVector(
        team_sm_id=int(team_sm_id),
        season_id=int(season_id),
        as_of_date=as_of,
        values=values,
        metadata=metadata,
        model_version=model_version,
    )


def assemble_rating_vector(
    team_sm_id: int,
    season_id: int,
    as_of_date: str,
    *,
    client=None,
    team_primaries: Optional[pd.DataFrame] = None,
    player_gk: Optional[pd.DataFrame] = None,
    gk_minutes: Optional[pd.DataFrame] = None,
    history: Optional[pd.DataFrame] = None,
    model_version: str = MODEL_VERSION,
) -> RatingVector:
    """
    Extract the 7 Primary Ratings for a team as of a timestamp / matchweek date.
    Loads from Supabase when frames are not supplied.
    """
    if team_primaries is None or player_gk is None or history is None:
        if client is None:
            from core.io import get_supabase_client

            client = get_supabase_client()
        from core import io as core_io

        if team_primaries is None:
            team_primaries = core_io.load_team_primary_ratings(
                client, season_id=season_id, team_sm_id=team_sm_id
            )
        if player_gk is None:
            player_gk = core_io.load_player_gk_ratings(
                client, season_id=season_id, team_sm_id=team_sm_id
            )
        if gk_minutes is None:
            gk_minutes = core_io.load_gk_minutes(
                client, season_id=season_id, team_sm_id=team_sm_id
            )
        if history is None:
            history = core_io.load_rating_history(
                client, season_id=season_id, team_sm_id=team_sm_id
            )

    return assemble_rating_vector_from_frames(
        team_sm_id=team_sm_id,
        season_id=season_id,
        as_of_date=as_of_date,
        team_primaries=team_primaries if team_primaries is not None else pd.DataFrame(),
        player_gk=player_gk,
        gk_minutes=gk_minutes,
        history=history,
        model_version=model_version,
    )


def _team_ids_from_primaries(team_primaries: pd.DataFrame, season_id: int) -> list[int]:
    if team_primaries.empty:
        return []
    sub = team_primaries[team_primaries["season_id"].astype(int) == int(season_id)]
    return sorted({int(x) for x in sub["team_sm_id"].tolist()})


def assemble_season_vectors(
    season_id: int,
    as_of_date: Optional[str] = None,
    *,
    client=None,
    team_primaries: Optional[pd.DataFrame] = None,
    player_gk: Optional[pd.DataFrame] = None,
    gk_minutes: Optional[pd.DataFrame] = None,
    history: Optional[pd.DataFrame] = None,
    team_ids: Optional[list[int]] = None,
    model_version: str = MODEL_VERSION,
) -> list[RatingVector]:
    """Assemble R for all teams in a season at a date (or latest available)."""
    if team_primaries is None:
        if client is None:
            from core.io import get_supabase_client

            client = get_supabase_client()
        from core import io as core_io

        team_primaries = core_io.load_team_primary_ratings(client, season_id=season_id)
        player_gk = core_io.load_player_gk_ratings(client, season_id=season_id)
        gk_minutes = core_io.load_gk_minutes(client, season_id=season_id)
        history = core_io.load_rating_history(client, season_id=season_id)

    assert team_primaries is not None
    if as_of_date is None:
        if team_primaries.empty:
            return []
        as_of_date = max(team_primaries["as_of_date"].map(_as_of_str).tolist())

    ids = team_ids or _team_ids_from_primaries(team_primaries, season_id)
    # Also include teams that only have player GK
    if player_gk is not None and not player_gk.empty:
        gk_teams = player_gk[player_gk["season_id"].astype(int) == int(season_id)]
        ids = sorted(set(ids) | {int(x) for x in gk_teams["team_sm_id"].dropna().tolist()})

    return [
        assemble_rating_vector_from_frames(
            team_sm_id=tid,
            season_id=season_id,
            as_of_date=as_of_date,
            team_primaries=team_primaries,
            player_gk=player_gk,
            gk_minutes=gk_minutes,
            history=history,
            model_version=model_version,
        )
        for tid in ids
    ]


def assemble_matchweek_vectors(
    season_id: int,
    matchweek_end_date: str,
    *,
    client=None,
    team_primaries: Optional[pd.DataFrame] = None,
    player_gk: Optional[pd.DataFrame] = None,
    gk_minutes: Optional[pd.DataFrame] = None,
    history: Optional[pd.DataFrame] = None,
    team_ids: Optional[list[int]] = None,
    model_version: str = MODEL_VERSION,
) -> list[RatingVector]:
    """Assemble R for all teams as of a matchweek end date."""
    return assemble_season_vectors(
        season_id,
        as_of_date=_as_of_str(matchweek_end_date),
        client=client,
        team_primaries=team_primaries,
        player_gk=player_gk,
        gk_minutes=gk_minutes,
        history=history,
        team_ids=team_ids,
        model_version=model_version,
    )


def observation_dates_for_team(
    team_primaries: pd.DataFrame,
    *,
    team_sm_id: int,
    season_id: int,
    player_gk: Optional[pd.DataFrame] = None,
) -> list[str]:
    """Distinct as_of_dates for chronological Bayesian rolling."""
    dates: set[str] = set()
    if team_primaries is not None and not team_primaries.empty:
        sub = team_primaries[
            (team_primaries["team_sm_id"].astype(int) == int(team_sm_id))
            & (team_primaries["season_id"].astype(int) == int(season_id))
        ]
        dates.update(sub["as_of_date"].map(_as_of_str).tolist())
    if player_gk is not None and not player_gk.empty:
        sub = player_gk[
            (player_gk["team_sm_id"].astype(int) == int(team_sm_id))
            & (player_gk["season_id"].astype(int) == int(season_id))
        ]
        dates.update(sub["as_of_date"].map(_as_of_str).tolist())
    return sorted(dates)

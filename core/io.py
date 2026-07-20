"""
Supabase IO for GLPM Rating Vector assembly and Bayesian persistence.
"""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any, Optional

import pandas as pd

from core.vector import PRIMARY_ORDER, RatingMetadata, RatingVector

PAGE_SIZE = 1000
MODEL_VERSION = "vector_v1"


def get_supabase_client():
    from supabase import create_client

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for Rating Vector IO"
        )
    return create_client(url.rstrip("/").removesuffix("/rest/v1"), key)


def _paginate(
    client,
    table: str,
    columns: str,
    filters: Optional[dict] = None,
    *,
    order: Optional[tuple[str, bool]] = None,
) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        q = client.table(table).select(columns).range(start, start + PAGE_SIZE - 1)
        if filters:
            for k, v in filters.items():
                if v is None:
                    continue
                q = q.eq(k, v)
        if order:
            q = q.order(order[0], desc=order[1])
        resp = q.execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def _as_of_date(value: Any) -> str:
    if value is None:
        return date.today().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def load_team_primary_ratings(
    client,
    *,
    season_id: Optional[int] = None,
    team_sm_id: Optional[int] = None,
) -> pd.DataFrame:
    filters: dict[str, Any] = {}
    if season_id is not None:
        filters["season_id"] = season_id
    if team_sm_id is not None:
        filters["team_sm_id"] = team_sm_id
    try:
        rows = _paginate(
            client,
            "glpm_team_primary_ratings",
            "*",
            filters or None,
        )
    except Exception:
        rows = []
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["as_of_date"] = df["as_of_date"].map(_as_of_date)
    for col, default in (
        ("matches_used", 0),
        ("trend_delta", 0.0),
        ("recent_trend", "flat"),
        ("historical_peak", None),
        ("historical_low", None),
    ):
        if col not in df.columns:
            df[col] = default
    return df


def load_player_gk_ratings(
    client,
    *,
    season_id: Optional[int] = None,
    team_sm_id: Optional[int] = None,
) -> pd.DataFrame:
    filters: dict[str, Any] = {"rating_type": "goalkeeper"}
    if season_id is not None:
        filters["season_id"] = season_id
    if team_sm_id is not None:
        filters["team_sm_id"] = team_sm_id
    rows = _paginate(
        client,
        "glpm_player_primary_ratings",
        "player_sm_id,team_sm_id,season_id,rating_type,as_of_date,rating,"
        "confidence,variance,model_version,updated_at",
        filters,
    )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["as_of_date"] = df["as_of_date"].map(_as_of_date)
    return df


def load_gk_minutes(
    client,
    *,
    season_id: Optional[int] = None,
    team_sm_id: Optional[int] = None,
) -> pd.DataFrame:
    """Season minutes played per player (for GK weighting)."""
    # Join via matches for season filter when possible
    match_filters: dict[str, Any] = {}
    if season_id is not None:
        match_filters["season_id"] = season_id
    matches = _paginate(
        client,
        "glpm_matches",
        "sm_id,season_id",
        match_filters or None,
    )
    if not matches:
        return pd.DataFrame(columns=["player_sm_id", "team_sm_id", "minutes_played"])

    match_ids = {int(m["sm_id"]) for m in matches}
    season_by_match = {int(m["sm_id"]): int(m["season_id"]) for m in matches}

    stats_filters: dict[str, Any] = {}
    if team_sm_id is not None:
        stats_filters["team_sm_id"] = team_sm_id
    stats = _paginate(
        client,
        "glpm_match_player_stats",
        "match_sm_id,player_sm_id,team_sm_id,minutes_played",
        stats_filters or None,
    )
    if not stats:
        return pd.DataFrame(columns=["player_sm_id", "team_sm_id", "minutes_played"])

    rows = []
    for s in stats:
        mid = int(s["match_sm_id"])
        if mid not in match_ids:
            continue
        rows.append(
            {
                "player_sm_id": int(s["player_sm_id"]),
                "team_sm_id": int(s["team_sm_id"]),
                "season_id": season_by_match[mid],
                "minutes_played": float(s.get("minutes_played") or 0.0),
            }
        )
    if not rows:
        return pd.DataFrame(columns=["player_sm_id", "team_sm_id", "minutes_played"])
    df = pd.DataFrame(rows)
    return (
        df.groupby(["player_sm_id", "team_sm_id", "season_id"], as_index=False)[
            "minutes_played"
        ]
        .sum()
    )


def load_rating_history(
    client,
    *,
    season_id: Optional[int] = None,
    team_sm_id: Optional[int] = None,
    layer: str = "primary",
) -> pd.DataFrame:
    filters: dict[str, Any] = {"layer": layer}
    if season_id is not None:
        filters["season_id"] = season_id
    if team_sm_id is not None:
        filters["team_sm_id"] = team_sm_id
    rows = _paginate(
        client,
        "glpm_rating_history",
        "team_sm_id,season_id,as_of_date,layer,name,rating,confidence,variance",
        filters,
    )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["as_of_date"] = df["as_of_date"].map(_as_of_date)
    return df


def upsert_rating_vectors(
    client,
    vectors: list[RatingVector],
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    counts = {"vectors": 0, "primaries": 0}
    if not vectors:
        return counts

    vector_rows = [v.to_db_row() for v in vectors]
    primary_rows: list[dict[str, Any]] = []
    for v in vectors:
        primary_rows.extend(v.primary_upsert_rows())

    counts["vectors"] = len(vector_rows)
    counts["primaries"] = len(primary_rows)

    if dry_run:
        return counts

    for i in range(0, len(vector_rows), 500):
        client.table("glpm_team_rating_vectors").upsert(
            vector_rows[i : i + 500],
            on_conflict="team_sm_id,season_id,as_of_date",
        ).execute()

    if primary_rows:
        for i in range(0, len(primary_rows), 500):
            client.table("glpm_team_primary_ratings").upsert(
                primary_rows[i : i + 500],
                on_conflict="team_sm_id,season_id,rating_type,as_of_date",
            ).execute()

    return counts


def insert_prediction_history(
    client,
    rows: list[dict[str, Any]],
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Archive Match Prediction Models outputs into ``glpm_prediction_history``.

    Each call inserts new rows (append-only history); nothing is overwritten.
    """
    counts = {"predictions": 0}
    if not rows:
        return counts
    counts["predictions"] = len(rows)
    if dry_run:
        return counts
    for i in range(0, len(rows), 500):
        client.table("glpm_prediction_history").insert(rows[i : i + 500]).execute()
    return counts


def load_latest_rating_vector(
    client,
    *,
    team_sm_id: int,
    season_id: Optional[int] = None,
) -> Optional[RatingVector]:
    """
    Load the most recent Rating Vector for a team (optionally within a season).

    Returns ``None`` when no row exists.
    """
    filters: dict[str, Any] = {"team_sm_id": int(team_sm_id)}
    if season_id is not None:
        filters["season_id"] = int(season_id)
    rows = _paginate(
        client,
        "glpm_team_rating_vectors",
        "*",
        filters,
        order=("as_of_date", True),
    )
    if not rows:
        return None
    row = rows[0]
    ratings = {
        "attack": row.get("r_attack"),
        "defence": row.get("r_defence"),
        "goalkeeper": row.get("r_goalkeeper"),
        "build_up": row.get("r_build_up"),
        "possession": row.get("r_possession"),
        "pressing": row.get("r_pressing"),
        "finishing": row.get("r_finishing"),
    }
    return RatingVector.from_mapping(
        team_sm_id=int(row["team_sm_id"]),
        season_id=int(row["season_id"]),
        as_of_date=_as_of_date(row.get("as_of_date")),
        ratings={k: float(v) if v is not None else float("nan") for k, v in ratings.items()},
        metadata=row.get("metadata") if isinstance(row.get("metadata"), dict) else None,
        model_version=str(row.get("model_version") or MODEL_VERSION),
    )


def load_finished_matches(
    client,
    *,
    season_id: Optional[int] = None,
    competition_id: Optional[int] = None,
) -> pd.DataFrame:
    """
    Load finished fixtures with scores for walk-forward validation.

    A match is finished when both ``home_score`` and ``away_score`` are non-null.
    Ordered by ``(gameweek, kickoff_at, match_date, sm_id)``.
    """
    filters: dict[str, Any] = {}
    if season_id is not None:
        filters["season_id"] = season_id
    if competition_id is not None:
        filters["competition_id"] = competition_id
    rows = _paginate(
        client,
        "glpm_matches",
        "sm_id,competition_id,season_id,gameweek,match_date,kickoff_at,"
        "home_team_sm_id,away_team_sm_id,home_score,away_score,status",
        filters,
        order=("match_date", False),
    )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df = df[df["home_score"].notna() & df["away_score"].notna()].copy()
    if df.empty:
        return df
    df["match_date"] = df["match_date"].map(_as_of_date)
    df["sm_id"] = df["sm_id"].astype(int)
    df["season_id"] = df["season_id"].astype(int)
    df["home_team_sm_id"] = df["home_team_sm_id"].astype(int)
    df["away_team_sm_id"] = df["away_team_sm_id"].astype(int)
    df["home_score"] = df["home_score"].astype(int)
    df["away_score"] = df["away_score"].astype(int)
    # Sort: gameweek nulls last, then kickoff / date / id
    gw = df["gameweek"]
    df["_gw_sort"] = gw.apply(
        lambda x: int(x) if x is not None and str(x) != "nan" else 10**9
    )
    df = df.sort_values(
        ["_gw_sort", "kickoff_at", "match_date", "sm_id"],
        na_position="last",
    ).reset_index(drop=True)
    return df.drop(columns=["_gw_sort"])


def load_match_team_xg(
    client,
    match_ids: list[int],
) -> pd.DataFrame:
    """Load per-team event xG from ``glpm_match_team_stats`` for given matches."""
    if not match_ids:
        return pd.DataFrame(columns=["match_sm_id", "team_sm_id", "xg"])
    rows: list[dict] = []
    # Chunk IN filters to avoid oversized query strings
    for i in range(0, len(match_ids), 200):
        chunk = match_ids[i : i + 200]
        start = 0
        while True:
            q = (
                client.table("glpm_match_team_stats")
                .select("match_sm_id,team_sm_id,xg")
                .in_("match_sm_id", chunk)
                .range(start, start + PAGE_SIZE - 1)
            )
            resp = q.execute()
            batch = resp.data or []
            rows.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            start += PAGE_SIZE
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=["match_sm_id", "team_sm_id", "xg"])
    df["match_sm_id"] = df["match_sm_id"].astype(int)
    df["team_sm_id"] = df["team_sm_id"].astype(int)
    return df


def insert_validation_logs(
    client,
    rows: list[dict[str, Any]],
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Append model-validation / backtest rows to ``glpm_validation_logs``.

    Expects ``layer='VAL'`` for Chapter 13 metrics; L1/L2 ingest rows use the
    TypeScript writer instead.
    """
    counts = {"validation_logs": 0}
    if not rows:
        return counts
    counts["validation_logs"] = len(rows)
    if dry_run:
        return counts
    for i in range(0, len(rows), 500):
        client.table("glpm_validation_logs").insert(rows[i : i + 500]).execute()
    return counts


def metadata_from_primary_row(row: dict[str, Any] | pd.Series) -> RatingMetadata:
    r = row if isinstance(row, dict) else row.to_dict()
    return RatingMetadata(
        current_value=float(r["rating"]),
        confidence=float(r.get("confidence") or 0.5),
        matches_used=int(r.get("matches_used") or 0),
        last_updated=_as_of_date(r.get("as_of_date") or r.get("updated_at")),
        variance=float(r.get("variance") or 0.0),
        recent_trend=(r.get("recent_trend") or "flat"),  # type: ignore[arg-type]
        trend_delta=float(r.get("trend_delta") or 0.0),
        historical_peak=(
            float(r["historical_peak"])
            if r.get("historical_peak") is not None
            else float(r["rating"])
        ),
        historical_low=(
            float(r["historical_low"])
            if r.get("historical_low") is not None
            else float(r["rating"])
        ),
    )

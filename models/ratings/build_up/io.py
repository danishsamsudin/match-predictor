"""
Supabase IO for Build-Up Rating training and persistence.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from typing import Any, Optional

import pandas as pd

PAGE_SIZE = 1000
MODEL_VERSION = "build_up_v1"
RATING_TYPE = "build_up"

DOMAINS = ("progression", "retention", "distribution")
COMPONENTS = (
    "ball_progression",
    "vertical_line_breaking",
    "press_resistance",
    "security",
    "distribution_accuracy",
    "tempo",
)


def get_supabase_client():
    from supabase import create_client

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for Build-Up ratings IO"
        )
    return create_client(url.rstrip("/").removesuffix("/rest/v1"), key)


def _paginate(client, table: str, columns: str, filters: Optional[dict] = None) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        q = client.table(table).select(columns).range(start, start + PAGE_SIZE - 1)
        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)
        resp = q.execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def load_match_team_frame(
    client,
    *,
    season_id: Optional[int] = None,
) -> pd.DataFrame:
    matches = _paginate(
        client,
        "glpm_matches",
        "sm_id, season_id, match_date, kickoff_at, home_team_sm_id, away_team_sm_id, duration_minutes, status",
        {"season_id": season_id} if season_id is not None else None,
    )
    if not matches:
        return pd.DataFrame()

    match_df = pd.DataFrame(matches).rename(columns={"sm_id": "match_sm_id"})
    match_ids = set(int(x) for x in match_df["match_sm_id"].tolist())

    stats_df = pd.DataFrame(_paginate(client, "glpm_match_team_stats", "*"))
    if stats_df.empty:
        return pd.DataFrame()
    stats_df = stats_df[stats_df["match_sm_id"].astype(int).isin(match_ids)].copy()
    merged = stats_df.merge(match_df, on="match_sm_id", how="left")

    def opponent_id(row: pd.Series) -> Any:
        return row.get("away_team_sm_id") if bool(row.get("is_home")) else row.get("home_team_sm_id")

    merged["opponent_team_sm_id"] = merged.apply(opponent_id, axis=1)

    opp = merged[
        ["match_sm_id", "team_sm_id", "ppda", "high_turnovers", "pass_completion_pct",
         "progressive_passes", "passes", "clearances", "final_third_entries"]
    ].rename(
        columns={
            "team_sm_id": "opponent_team_sm_id",
            "ppda": "opp_ppda",
            "high_turnovers": "opp_high_turnovers",
            "pass_completion_pct": "opp_pass_completion_pct",
            "progressive_passes": "opp_progressive_passes",
            "passes": "opp_passes",
            "clearances": "opp_clearances",
            "final_third_entries": "opp_final_third_entries",
        }
    )
    merged = merged.merge(opp, on=["match_sm_id", "opponent_team_sm_id"], how="left")

    # Prefer stored ppda_allowed (pressure faced) over joined opponent ppda.
    if "ppda_allowed" in merged.columns:
        merged["opp_ppda"] = merged["ppda_allowed"].combine_first(merged.get("opp_ppda"))

    # Optional counterpart primary ratings
    try:
        press_rows = _paginate(
            client,
            "glpm_team_primary_ratings",
            "team_sm_id, season_id, rating, as_of_date",
            {"rating_type": "pressing"},
        )
        if press_rows:
            press_df = pd.DataFrame(press_rows).sort_values("as_of_date")
            latest = press_df.groupby("team_sm_id", as_index=False).tail(1)
            latest = latest.rename(
                columns={"team_sm_id": "opponent_team_sm_id", "rating": "pressing_rating"}
            )[["opponent_team_sm_id", "pressing_rating"]]
            merged = merged.merge(latest, on="opponent_team_sm_id", how="left")
    except Exception:
        pass

    return merged


def load_l2_features(client, match_ids: list[int]) -> pd.DataFrame:
    if not match_ids:
        return pd.DataFrame()
    df = pd.DataFrame(_paginate(client, "glpm_match_team_features", "*"))
    if df.empty:
        return df
    return df[df["match_sm_id"].astype(int).isin(set(match_ids))].copy()


def _as_of_date(value: Any) -> str:
    if value is None:
        return date.today().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def upsert_build_up_ratings(
    client,
    team_summary: pd.DataFrame,
    *,
    model_version: str = MODEL_VERSION,
    dry_run: bool = False,
) -> dict[str, int]:
    counts = {"primary": 0, "domain": 0, "component": 0, "history": 0}
    if team_summary.empty:
        return counts

    now = datetime.now(timezone.utc).isoformat()
    primary_rows: list[dict[str, Any]] = []
    domain_rows: list[dict[str, Any]] = []
    component_rows: list[dict[str, Any]] = []
    history_rows: list[dict[str, Any]] = []

    for _, row in team_summary.iterrows():
        team_id = int(row["team_sm_id"])
        season_id = int(row["season_id"]) if pd.notna(row.get("season_id")) else None
        as_of = _as_of_date(row.get("as_of_date"))
        base = {
            "team_sm_id": team_id,
            "season_id": season_id,
            "as_of_date": as_of,
            "model_version": model_version,
            "updated_at": now,
        }

        primary_rows.append(
            {
                **base,
                "rating_type": RATING_TYPE,
                "rating": float(row["rating_build_up"]),
                "confidence": float(row.get("conf_build_up", 0.5)),
                "variance": float(row.get("var_build_up", 0.0)),
            }
        )
        history_rows.append(
            {
                "team_sm_id": team_id,
                "season_id": season_id,
                "as_of_date": as_of,
                "layer": "primary",
                "name": RATING_TYPE,
                "rating": float(row["rating_build_up"]),
                "confidence": float(row.get("conf_build_up", 0.5)),
                "variance": float(row.get("var_build_up", 0.0)),
                "model_version": model_version,
                "recorded_at": now,
            }
        )

        for d in DOMAINS:
            col = f"rating_domain_{d}"
            if col not in row or pd.isna(row[col]):
                continue
            domain_rows.append(
                {
                    **base,
                    "rating_type": RATING_TYPE,
                    "domain": d,
                    "rating": float(row[col]),
                    "confidence": float(row.get(f"conf_domain_{d}", 0.5)),
                    "variance": float(row.get(f"var_domain_{d}", 0.0)),
                }
            )
            history_rows.append(
                {
                    "team_sm_id": team_id,
                    "season_id": season_id,
                    "as_of_date": as_of,
                    "layer": "domain",
                    "name": d,
                    "rating": float(row[col]),
                    "confidence": float(row.get(f"conf_domain_{d}", 0.5)),
                    "variance": float(row.get(f"var_domain_{d}", 0.0)),
                    "model_version": model_version,
                    "recorded_at": now,
                }
            )

        for c in COMPONENTS:
            col = f"rating_comp_{c}"
            if col not in row or pd.isna(row[col]):
                continue
            component_rows.append(
                {
                    **base,
                    "rating_type": RATING_TYPE,
                    "component": c,
                    "rating": float(row[col]),
                    "confidence": float(row.get(f"conf_comp_{c}", 0.5)),
                    "variance": float(row.get(f"var_comp_{c}", 0.0)),
                }
            )
            history_rows.append(
                {
                    "team_sm_id": team_id,
                    "season_id": season_id,
                    "as_of_date": as_of,
                    "layer": "component",
                    "name": c,
                    "rating": float(row[col]),
                    "confidence": float(row.get(f"conf_comp_{c}", 0.5)),
                    "variance": float(row.get(f"var_comp_{c}", 0.0)),
                    "model_version": model_version,
                    "recorded_at": now,
                }
            )

    counts["primary"] = len(primary_rows)
    counts["domain"] = len(domain_rows)
    counts["component"] = len(component_rows)
    counts["history"] = len(history_rows)

    if dry_run:
        return counts

    if primary_rows:
        client.table("glpm_team_primary_ratings").upsert(
            primary_rows, on_conflict="team_sm_id,season_id,rating_type,as_of_date"
        ).execute()
    if domain_rows:
        client.table("glpm_team_domain_ratings").upsert(
            domain_rows,
            on_conflict="team_sm_id,season_id,rating_type,domain,as_of_date",
        ).execute()
    if component_rows:
        client.table("glpm_team_component_ratings").upsert(
            component_rows,
            on_conflict="team_sm_id,season_id,rating_type,component,as_of_date",
        ).execute()
    if history_rows:
        for i in range(0, len(history_rows), 500):
            client.table("glpm_rating_history").insert(history_rows[i : i + 500]).execute()

    return counts

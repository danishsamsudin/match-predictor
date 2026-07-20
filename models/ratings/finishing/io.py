"""
Supabase IO for Finishing Rating training and persistence.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from typing import Any, Optional

import pandas as pd

PAGE_SIZE = 1000
MODEL_VERSION = "finishing_v1"

SHOT_COLUMNS = (
    "match_sm_id, team_sm_id, pos_x, pos_y, pre_shot_xg, "
    "is_on_target, is_goal, is_blocked, is_opportunity, is_penalty, "
    "is_set_piece, is_counter_attack, body_part_tag, goal_zone_tag"
)


def get_supabase_client():
    from supabase import create_client

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for Finishing ratings IO"
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


def _as_of_primary_rating(
    ratings_df: pd.DataFrame,
    *,
    team_id: Any,
    match_date: Any,
    season_id: Any,
    rating_col: str = "rating",
) -> Optional[float]:
    if ratings_df.empty or match_date is None:
        return None
    md = pd.to_datetime(match_date)
    cand = ratings_df[
        (ratings_df["team_sm_id"] == team_id) & (ratings_df["as_of_date"] <= md)
    ]
    if season_id is not None and "season_id" in cand.columns:
        season_cand = cand[cand["season_id"] == season_id]
        if not season_cand.empty:
            cand = season_cand
    if cand.empty:
        return None
    return float(cand.sort_values("as_of_date").iloc[-1][rating_col])


def load_match_team_frame(
    client,
    *,
    season_id: Optional[int] = None,
) -> pd.DataFrame:
    """
    Load Layer 1 stats joined with match metadata, opponent ids, and as-of
    opponent Defence / Goalkeeper primary ratings.
    """
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

    stats_rows = _paginate(client, "glpm_match_team_stats", "*")
    stats_df = pd.DataFrame(stats_rows)
    if stats_df.empty:
        return pd.DataFrame()
    stats_df = stats_df[stats_df["match_sm_id"].astype(int).isin(match_ids)].copy()

    merged = stats_df.merge(match_df, on="match_sm_id", how="left")

    def opponent_id(row: pd.Series) -> Any:
        if bool(row.get("is_home")):
            return row.get("away_team_sm_id")
        return row.get("home_team_sm_id")

    merged["opponent_team_sm_id"] = merged.apply(opponent_id, axis=1)

    # Opponent defensive / GK proxies for bootstrap adjustment
    opp_cols = ["match_sm_id", "team_sm_id", "xg_conceded"]
    rename_map = {
        "team_sm_id": "opponent_team_sm_id",
        "xg_conceded": "opp_xg_conceded",
    }
    if "goals_prevented" in merged.columns:
        opp_cols.append("goals_prevented")
        rename_map["goals_prevented"] = "opp_goals_prevented"

    opp_def = merged[opp_cols].rename(columns=rename_map)
    merged = merged.merge(opp_def, on=["match_sm_id", "opponent_team_sm_id"], how="left")

    # Join opponent as-of Defence & Goalkeeper primary ratings
    for rating_type, col_name in (
        ("defence", "defence_rating"),
        ("goalkeeper", "goalkeeper_rating"),
    ):
        rows = _paginate(
            client,
            "glpm_team_primary_ratings",
            "team_sm_id, season_id, as_of_date, rating",
            {"rating_type": rating_type},
        )
        if not rows:
            merged[col_name] = None
            continue
        rdf = pd.DataFrame(rows)
        rdf["as_of_date"] = pd.to_datetime(rdf["as_of_date"])
        vals: list[Optional[float]] = []
        for _, row in merged.iterrows():
            vals.append(
                _as_of_primary_rating(
                    rdf,
                    team_id=row["opponent_team_sm_id"],
                    match_date=row.get("match_date"),
                    season_id=row.get("season_id"),
                )
            )
        merged[col_name] = vals

    return merged


def load_shots_by_match_team(
    client, match_ids: list[int]
) -> dict[tuple[int, int], list[dict[str, Any]]]:
    if not match_ids:
        return {}
    rows = _paginate(client, "glpm_match_shots", SHOT_COLUMNS)
    out: dict[tuple[int, int], list[dict[str, Any]]] = {}
    id_set = set(match_ids)
    for r in rows:
        mid = int(r["match_sm_id"])
        if mid not in id_set:
            continue
        key = (mid, int(r["team_sm_id"]))
        out.setdefault(key, []).append(r)
    return out


def _as_of_date(value: Any) -> str:
    if value is None:
        return date.today().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def upsert_finishing_ratings(
    client,
    team_summary: pd.DataFrame,
    *,
    model_version: str = MODEL_VERSION,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Persist latest primary / domain / component ratings plus history rows.

    ``team_summary`` must contain one row per team with calibrated columns:
    rating_finishing, conf_finishing, var_finishing, domain_*, comp_*, season_id, as_of_date.
    """
    counts = {"primary": 0, "domain": 0, "component": 0, "history": 0}
    if team_summary.empty:
        return counts

    now = datetime.now(timezone.utc).isoformat()
    primary_rows: list[dict[str, Any]] = []
    domain_rows: list[dict[str, Any]] = []
    component_rows: list[dict[str, Any]] = []
    history_rows: list[dict[str, Any]] = []

    domains = ("shot_execution", "chance_conversion", "finishing_composure")
    components = (
        "shot_accuracy",
        "shot_technique",
        "finishing_efficiency",
        "clinical_finishing",
        "one_on_one_finishing",
        "pressure_finishing",
    )

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
                "rating_type": "finishing",
                "rating": float(row["rating_finishing"]),
                "confidence": float(row.get("conf_finishing", 0.5)),
                "variance": float(row.get("var_finishing", 0.0)),
            }
        )
        history_rows.append(
            {
                "team_sm_id": team_id,
                "season_id": season_id,
                "as_of_date": as_of,
                "layer": "primary",
                "name": "finishing",
                "rating": float(row["rating_finishing"]),
                "confidence": float(row.get("conf_finishing", 0.5)),
                "variance": float(row.get("var_finishing", 0.0)),
                "model_version": model_version,
                "recorded_at": now,
            }
        )

        for d in domains:
            col = f"rating_domain_{d}"
            if col not in row or pd.isna(row[col]):
                continue
            domain_rows.append(
                {
                    **base,
                    "rating_type": "finishing",
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

        for c in components:
            col = f"rating_comp_{c}"
            if col not in row or pd.isna(row[col]):
                continue
            component_rows.append(
                {
                    **base,
                    "rating_type": "finishing",
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

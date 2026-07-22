"""
Supabase IO for Goalkeeper Rating training and persistence (player grain).
"""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from typing import Any, Optional

import pandas as pd

PAGE_SIZE = 1000
MODEL_VERSION = "gk_v1"


def get_supabase_client():
    from supabase import create_client

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for GK ratings IO"
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


def _load_gk_proxy_frame_from_team_stats(
    client,
    *,
    season_id: Optional[int] = None,
) -> pd.DataFrame:
    """
    Build GK player-match rows from team stats + lineup GK ids in stored payloads.
    Used when glpm_match_player_stats was not populated during initial ingest.
    """
    matches = _paginate(
        client,
        "glpm_matches",
        "sm_id, season_id, match_date, home_team_sm_id, away_team_sm_id, status",
        {"season_id": season_id} if season_id is not None else None,
    )
    if not matches:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    for m in matches:
        status = str(m.get("status") or "")
        if status.lower() == "not started":
            continue
        match_id = int(m["sm_id"])
        home_id = int(m["home_team_sm_id"])
        away_id = int(m["away_team_sm_id"])

        payload_resp = (
            client.table("glpm_provider_payloads")
            .select("payload")
            .eq("provider", "sportmonks")
            .eq("entity_type", "match")
            .eq("entity_key", str(match_id))
            .limit(1)
            .execute()
        )
        if not payload_resp.data:
            continue
        fixture = payload_resp.data[0].get("payload") or {}
        lineups = fixture.get("lineups") or []

        ts_resp = (
            client.table("glpm_match_team_stats")
            .select("*")
            .eq("match_sm_id", match_id)
            .execute()
        )
        team_stats = {int(r["team_sm_id"]): r for r in (ts_resp.data or [])}

        for team_id, opp_id in ((home_id, away_id), (away_id, home_id)):
            ts = team_stats.get(team_id)
            opp = team_stats.get(opp_id)
            if not ts:
                continue
            gk_lineup = _find_gk_lineup(lineups, team_id)
            if not gk_lineup:
                continue
            player_id = gk_lineup.get("player_id")
            if not player_id:
                continue
            psxg = ts.get("psxg_faced")
            saves = ts.get("gk_saves")
            gc = None
            if opp and opp.get("goals") is not None:
                gc = opp.get("goals")
            if psxg is None and saves is None and gc is None:
                continue
            rows.append(
                {
                    "match_sm_id": match_id,
                    "player_sm_id": int(player_id),
                    "team_sm_id": team_id,
                    "season_id": m.get("season_id"),
                    "match_date": m.get("match_date"),
                    "home_team_sm_id": home_id,
                    "away_team_sm_id": away_id,
                    "is_goalkeeper": True,
                    "minutes_played": 90,
                    "psxg_faced": psxg,
                    "gk_saves": saves,
                    "goals_conceded": gc,
                    "shots_faced": ts.get("shots_conceded") or (opp.get("shots") if opp else None),
                    "sot_faced": opp.get("shots_on_target") if opp else None,
                    "payload": {"source": "sportmonks_team_proxy_io"},
                }
            )

    return pd.DataFrame(rows)


def _find_gk_lineup(lineups: list[dict], team_id: int) -> Optional[dict]:
    gks = [
        lu
        for lu in lineups
        if int(lu.get("team_id") or 0) == team_id
        and (
            int(lu.get("position_id") or 0) in (24, 25)
            or "goalkeeper" in str(lu.get("position", {}).get("name", "")).lower()
        )
    ]
    if not gks:
        return None
    starter = next((g for g in gks if g.get("type_id") == 11), gks[0])
    return starter


def load_gk_player_frame(
    client,
    *,
    season_id: Optional[int] = None,
) -> pd.DataFrame:
    """
    Load GK player-match rows joined with match metadata and as-of Defence ratings.
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

    stats_rows = _paginate(client, "glpm_match_player_stats", "*")
    stats_df = pd.DataFrame(stats_rows)
    if stats_df.empty:
        return pd.DataFrame()
    stats_df = stats_df[stats_df["match_sm_id"].astype(int).isin(match_ids)].copy()
    if "is_goalkeeper" in stats_df.columns:
        stats_df = stats_df[stats_df["is_goalkeeper"] == True].copy()  # noqa: E712

    if stats_df.empty:
        stats_df = _load_gk_proxy_frame_from_team_stats(client, season_id=season_id)

    if stats_df.empty:
        return pd.DataFrame()

    merged = stats_df.merge(match_df, on="match_sm_id", how="left")

    def is_home_row(row: pd.Series) -> bool:
        return int(row.get("team_sm_id") or 0) == int(row.get("home_team_sm_id") or -1)

    merged["is_home"] = merged.apply(is_home_row, axis=1)

    # Team xGA for defence bootstrap
    team_stats = _paginate(client, "glpm_match_team_stats", "match_sm_id, team_sm_id, xg_conceded")
    if team_stats:
        ts = pd.DataFrame(team_stats)
        merged = merged.merge(ts, on=["match_sm_id", "team_sm_id"], how="left")

    # Join as-of defence primary ratings
    def_ratings = _paginate(
        client,
        "glpm_team_primary_ratings",
        "team_sm_id, season_id, as_of_date, rating",
        {"rating_type": "defence"},
    )
    if def_ratings:
        dr = pd.DataFrame(def_ratings).rename(columns={"rating": "defence_rating"})
        dr["as_of_date"] = pd.to_datetime(dr["as_of_date"])
        merged["match_date_dt"] = pd.to_datetime(merged["match_date"])
        # As-of join: latest defence rating with as_of_date <= match_date
        pieces = []
        for _, row in merged.iterrows():
            cand = dr[
                (dr["team_sm_id"] == row["team_sm_id"])
                & (dr["as_of_date"] <= row["match_date_dt"])
            ]
            if season_id is not None:
                cand = cand[cand["season_id"] == row.get("season_id")]
            if cand.empty:
                pieces.append(None)
            else:
                pieces.append(float(cand.sort_values("as_of_date").iloc[-1]["defence_rating"]))
        merged["defence_rating"] = pieces
        merged = merged.drop(columns=["match_date_dt"], errors="ignore")

    # Domain defence ratings (prevention / protection / control)
    for domain, col in (
        ("prevention", "prevention_rating"),
        ("protection", "protection_rating"),
        ("control", "control_rating"),
    ):
        dom_rows = _paginate(
            client,
            "glpm_team_domain_ratings",
            "team_sm_id, season_id, as_of_date, rating",
            {"domain": domain},
        )
        if not dom_rows:
            continue
        dd = pd.DataFrame(dom_rows).rename(columns={"rating": col})
        dd["as_of_date"] = pd.to_datetime(dd["as_of_date"])
        merged["match_date_dt"] = pd.to_datetime(merged["match_date"])
        vals = []
        for _, row in merged.iterrows():
            cand = dd[
                (dd["team_sm_id"] == row["team_sm_id"])
                & (dd["as_of_date"] <= row["match_date_dt"])
            ]
            if cand.empty:
                vals.append(None)
            else:
                vals.append(float(cand.sort_values("as_of_date").iloc[-1][col]))
        merged[col] = vals
        merged = merged.drop(columns=["match_date_dt"], errors="ignore")

    return merged


def load_shots_by_gk(
    client, match_ids: list[int]
) -> dict[tuple[int, int], list[dict[str, Any]]]:
    """Shots faced keyed by (match_sm_id, gk_player_sm_id)."""
    if not match_ids:
        return {}
    rows = _paginate(
        client,
        "glpm_match_shots",
        "match_sm_id, team_sm_id, gk_player_sm_id, pos_x, pos_y, pre_shot_xg, post_shot_xg, "
        "is_goal, is_on_target, is_penalty, is_counter_attack, is_set_piece",
    )
    out: dict[tuple[int, int], list[dict[str, Any]]] = {}
    id_set = set(match_ids)
    for r in rows:
        mid = int(r["match_sm_id"])
        if mid not in id_set:
            continue
        gk = r.get("gk_player_sm_id")
        if gk is None:
            continue
        key = (mid, int(gk))
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


def upsert_goalkeeper_ratings(
    client,
    player_summary: pd.DataFrame,
    *,
    model_version: str = MODEL_VERSION,
    dry_run: bool = False,
) -> dict[str, int]:
    """Persist latest primary / domain / component GK ratings plus history rows."""
    counts = {"primary": 0, "domain": 0, "component": 0, "history": 0}
    if player_summary.empty:
        return counts

    now = datetime.now(timezone.utc).isoformat()
    primary_rows: list[dict[str, Any]] = []
    domain_rows: list[dict[str, Any]] = []
    component_rows: list[dict[str, Any]] = []
    history_rows: list[dict[str, Any]] = []

    domains = ("goal_prevention", "goalkeeper_involvement")
    components = (
        "shot_stopping",
        "area_command",
        "distribution",
        "sweeper",
        "penalty",
    )

    for _, row in player_summary.iterrows():
        player_id = int(row["player_sm_id"])
        team_id = int(row["team_sm_id"]) if pd.notna(row.get("team_sm_id")) else None
        season_id = int(row["season_id"]) if pd.notna(row.get("season_id")) else None
        as_of = _as_of_date(row.get("as_of_date"))
        base = {
            "player_sm_id": player_id,
            "team_sm_id": team_id,
            "season_id": season_id,
            "as_of_date": as_of,
            "model_version": model_version,
            "updated_at": now,
        }

        primary_rows.append(
            {
                **base,
                "rating_type": "goalkeeper",
                "rating": float(row["rating_goalkeeper"]),
                "confidence": float(row.get("conf_goalkeeper", 0.5)),
                "variance": float(row.get("var_goalkeeper", 0.0)),
            }
        )
        history_rows.append(
            {
                "player_sm_id": player_id,
                "team_sm_id": team_id,
                "season_id": season_id,
                "as_of_date": as_of,
                "layer": "primary",
                "name": "goalkeeper",
                "rating": float(row["rating_goalkeeper"]),
                "confidence": float(row.get("conf_goalkeeper", 0.5)),
                "variance": float(row.get("var_goalkeeper", 0.0)),
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
                    "domain": d,
                    "rating": float(row[col]),
                    "confidence": float(row.get(f"conf_domain_{d}", 0.5)),
                    "variance": float(row.get(f"var_domain_{d}", 0.0)),
                }
            )
            history_rows.append(
                {
                    "player_sm_id": player_id,
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
                    "component": c,
                    "rating": float(row[col]),
                    "confidence": float(row.get(f"conf_comp_{c}", 0.5)),
                    "variance": float(row.get(f"var_comp_{c}", 0.0)),
                }
            )
            history_rows.append(
                {
                    "player_sm_id": player_id,
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
        client.table("glpm_player_primary_ratings").upsert(
            primary_rows, on_conflict="player_sm_id,season_id,rating_type,as_of_date"
        ).execute()
    if domain_rows:
        client.table("glpm_player_domain_ratings").upsert(
            domain_rows, on_conflict="player_sm_id,season_id,domain,as_of_date"
        ).execute()
    if component_rows:
        client.table("glpm_player_component_ratings").upsert(
            component_rows, on_conflict="player_sm_id,season_id,component,as_of_date"
        ).execute()
    if history_rows:
        for i in range(0, len(history_rows), 500):
            client.table("glpm_player_rating_history").insert(
                history_rows[i : i + 500]
            ).execute()

    return counts

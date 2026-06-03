"""
Deep SofaScore → Supabase ingest: club leagues by tournament season, plus
international friendlies/qualifiers via per-team event history (since Nov 2022).
National sides come from `fifa_ranking_snapshots` (latest snapshot, all Sofascore ids),
with a fallback to `src/lib/data/world-cup-2026-teams.ts` (48 World Cup teams).

Writes synced_fixtures, synced_events, and synced_team_statistics. Goal averages
are computed from finished matches; corners/fouls/cards/SoT in team rows are
placeholders until you backfill per-match stats:

  python scripts/backfill_event_statistics.py 39 80
  npm run lineups:backfill -- 39 40

Requires: pip install curl_cffi supabase
Env: reads match-predictor/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from curl_cffi import requests
from supabase import Client, create_client


def load_env_local() -> None:
    """Load match-predictor/.env.local when vars are not already exported."""
    env_path = Path(__file__).resolve().parent / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        if "=" not in t:
            continue
        key, _, val = t.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


load_env_local()

# =====================================================================
# 1. DATABASE CONNECTIVITY
# =====================================================================
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ""
).strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit(
        "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY "
        "in .env.local or your shell before running seed_database.py"
    )
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# =====================================================================
# 2. COMPETITION CONFIG
# =====================================================================
CLUB_LEAGUE_CATALOG = {
    39: {"tournament_id": 17, "label": "Premier League"},
    140: {"tournament_id": 8, "label": "La Liga"},
    78: {"tournament_id": 35, "label": "Bundesliga"},
    135: {"tournament_id": 23, "label": "Serie A"},
    61: {"tournament_id": 34, "label": "Ligue 1"},
    88: {"tournament_id": 37, "label": "Eredivisie"},
    2: {"tournament_id": 7, "label": "UEFA Champions League"},
    3: {"tournament_id": 679, "label": "UEFA Europa League"},
}

WORLD_CUP_TEAMS_CATALOG = (
    Path(__file__).resolve().parent / "src/lib/data/world-cup-2026-teams.ts"
)

REFERENCE_LEAGUE_WORLD_CUP = 1
UNIQUE_TOURNAMENT_WORLD_CUP = 16
# November 1, 2022 UTC — start of previous World Cup cycle window
PREVIOUS_WC_TIMESTAMP = 1667260800

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def fetch_json(url: str) -> Optional[Any]:
    res = requests.get(url, headers=HEADERS, impersonate="chrome", timeout=30)
    if res.status_code != 200:
        return None
    return res.json()


def kickoff_iso(event: dict) -> str:
    ts = event.get("startTimestamp", int(datetime.now(timezone.utc).timestamp()))
    return (
        datetime.fromtimestamp(ts, tz=timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def venue_city(event: dict) -> str:
    return (event.get("venue") or {}).get("city", {}).get("name") or "Unknown"


def upsert_fixture_and_event(
    event: dict,
    *,
    platform_id: int,
    league_label: str,
    unique_tournament_id: int,
    season_id: int,
    synced_at: str,
) -> None:
    if not event.get("homeTeam") or not event.get("awayTeam"):
        return

    m_id = int(event["id"])
    h_id = int(event["homeTeam"]["id"])
    a_id = int(event["awayTeam"]["id"])
    status_obj = event.get("status") or {}
    is_finished = status_obj.get("type") == "finished"
    iso_kickoff = kickoff_iso(event)

    supabase.table("synced_fixtures").upsert(
        {
            "event_id": m_id,
            "league_id": platform_id,
            "league_name": league_label,
            "season": 2025,
            "kickoff_at": iso_kickoff,
            "venue_city": venue_city(event),
            "home_team_id": h_id,
            "home_team_name": event["homeTeam"]["name"],
            "away_team_id": a_id,
            "away_team_name": event["awayTeam"]["name"],
            "synced_at": synced_at,
        },
        on_conflict="event_id",
    ).execute()

    if "tournament" in event and isinstance(event["tournament"], dict):
        event["tournament"]["uniqueTournament"] = {"id": unique_tournament_id}

    supabase.table("synced_events").upsert(
        {
            "event_id": m_id,
            "unique_tournament_id": unique_tournament_id,
            "season_id": season_id,
            "reference_league_id": platform_id,
            "kickoff_at": iso_kickoff,
            "status_type": "Finished" if is_finished else "NotStarted",
            "payload": event,
            "synced_at": synced_at,
        },
        on_conflict="event_id",
    ).execute()


def accumulate_team_matrix(event: Dict[str, Any], team_matrix: Dict[int, Dict[str, int]]) -> None:
    status_obj = event.get("status") or {}
    if status_obj.get("type") != "finished":
        return
    if not event.get("homeTeam") or not event.get("awayTeam"):
        return

    h_id = int(event["homeTeam"]["id"])
    a_id = int(event["awayTeam"]["id"])
    home_score_obj = event.get("homeScore") or {}
    away_score_obj = event.get("awayScore") or {}
    h_score = int(home_score_obj.get("current", home_score_obj.get("display", 0)))
    a_score = int(away_score_obj.get("current", away_score_obj.get("display", 0)))

    for t_idx in (h_id, a_id):
        if t_idx not in team_matrix:
            team_matrix[t_idx] = {
                "home_gf": 0,
                "home_ga": 0,
                "home_games": 0,
                "away_gf": 0,
                "away_ga": 0,
                "away_games": 0,
            }

    team_matrix[h_id]["home_gf"] += h_score
    team_matrix[h_id]["home_ga"] += a_score
    team_matrix[h_id]["home_games"] += 1
    team_matrix[a_id]["away_gf"] += a_score
    team_matrix[a_id]["away_ga"] += h_score
    team_matrix[a_id]["away_games"] += 1


def upsert_team_statistics(
    team_matrix: Dict[int, Dict[str, int]],
    *,
    unique_tournament_id: int,
    season_id: int,
    reference_league_id: int,
    synced_at: str,
    source: str,
) -> None:
    for team_id, metrics in team_matrix.items():
        avg_home_gf = (
            metrics["home_gf"] / metrics["home_games"] if metrics["home_games"] > 0 else 1.35
        )
        avg_home_ga = (
            metrics["home_ga"] / metrics["home_games"] if metrics["home_games"] > 0 else 1.35
        )
        avg_away_gf = (
            metrics["away_gf"] / metrics["away_games"] if metrics["away_games"] > 0 else 1.35
        )
        avg_away_ga = (
            metrics["away_ga"] / metrics["away_games"] if metrics["away_games"] > 0 else 1.35
        )

        supabase.table("synced_team_statistics").upsert(
            {
                "team_id": team_id,
                "unique_tournament_id": unique_tournament_id,
                "season_id": season_id,
                "reference_league_id": reference_league_id,
                "metrics_home": {
                    "goalsFor": round(avg_home_gf, 3),
                    "goalsAgainst": round(avg_home_ga, 3),
                    "corners": 5.4,
                    "fouls": 10.2,
                    "yellowCards": 1.8,
                    "redCards": 0.05,
                    "shotsOnTarget": 4.8,
                },
                "metrics_away": {
                    "goalsFor": round(avg_away_gf, 3),
                    "goalsAgainst": round(avg_away_ga, 3),
                    "corners": 4.2,
                    "fouls": 11.2,
                    "yellowCards": 2.1,
                    "redCards": 0.07,
                    "shotsOnTarget": 3.8,
                },
                "payload": {"source": source},
                "synced_at": synced_at,
            },
            on_conflict="team_id,unique_tournament_id,season_id",
        ).execute()


def crawl_tournament_events(tournament_id: int, season_id: int) -> List[Dict[str, Any]]:
    events_list: List[Dict[str, Any]] = []
    page = 0
    while True:
        url = (
            f"https://api.sofascore.com/api/v1/unique-tournament/{tournament_id}"
            f"/season/{season_id}/events/last/{page}"
        )
        page_res = fetch_json(url)
        if not page_res:
            break
        page_events = page_res.get("events", [])
        if not page_events:
            break
        events_list.extend(page_events)
        page += 1
        time.sleep(0.1)
        if page > 20:
            break
    return events_list


def resolve_current_season(tournament_id: int) -> Optional[Tuple[int, str]]:
    season_url = f"https://api.sofascore.com/api/v1/unique-tournament/{tournament_id}/seasons"
    season_res = fetch_json(season_url)
    if not season_res:
        return None
    seasons = season_res.get("seasons", [])
    if not seasons:
        return None
    current = seasons[0]
    return int(current["id"]), current.get("name", "Unknown")


def load_national_teams_from_world_cup_catalog() -> List[Dict[str, Any]]:
    """Fallback: parse WORLD_CUP_2026_TEAMS from src/lib/data/world-cup-2026-teams.ts."""
    if not WORLD_CUP_TEAMS_CATALOG.is_file():
        return []
    text = WORLD_CUP_TEAMS_CATALOG.read_text(encoding="utf-8")
    teams: List[Dict[str, Any]] = []
    for match in re.finditer(r'\{ id: (\d+), name: "([^"]+)" \}', text):
        teams.append({"id": int(match.group(1)), "name": match.group(2)})
    return teams


def load_national_teams_from_db() -> List[Dict[str, Any]]:
    """
    All national sides in fifa_ranking_snapshots for the latest (year, semester)
    that have a Sofascore team id (211 teams as of 2026-1, includes all WC 2026 sides).
    """
    snap_res = (
        supabase.table("fifa_ranking_snapshots")
        .select("ranking_year, semester")
        .order("ranking_year", desc=True)
        .order("semester", desc=True)
        .limit(1)
        .execute()
    )
    snap_rows = snap_res.data or []
    if not snap_rows:
        return []

    year = int(snap_rows[0]["ranking_year"])
    semester = int(snap_rows[0]["semester"])
    rows_res = (
        supabase.table("fifa_ranking_snapshots")
        .select("team_name, sofascore_team_id, rank")
        .eq("ranking_year", year)
        .eq("semester", semester)
        .not_.is_("sofascore_team_id", "null")
        .order("rank")
        .execute()
    )

    teams: List[Dict[str, Any]] = []
    seen_ids: set[int] = set()
    for row in rows_res.data or []:
        team_id = row.get("sofascore_team_id")
        if team_id is None:
            continue
        tid = int(team_id)
        if tid in seen_ids:
            continue
        seen_ids.add(tid)
        teams.append({"id": tid, "name": row["team_name"]})

    return teams


def resolve_national_teams() -> List[Dict[str, Any]]:
    from_db = load_national_teams_from_db()
    if from_db:
        return from_db

    fallback = load_national_teams_from_world_cup_catalog()
    if fallback:
        print(
            "   ⚠️ No fifa_ranking_snapshots in Supabase; "
            f"using {len(fallback)} teams from world-cup-2026-teams.ts."
        )
        return fallback

    raise SystemExit(
        "No national teams to seed. Run `npm run fifa:import` (or import FIFA rankings) "
        "so fifa_ranking_snapshots is populated, or ensure world-cup-2026-teams.ts exists."
    )


def harvest_team_history(team_id: int) -> List[Dict[str, Any]]:
    collected: List[Dict[str, Any]] = []
    page = 0
    reached_edge = False

    while not reached_edge:
        url = f"https://api.sofascore.com/api/v1/team/{team_id}/events/last/{page}"
        res = requests.get(url, headers=HEADERS, impersonate="chrome", timeout=30)
        if res.status_code != 200:
            break
        events = res.json().get("events", [])
        if not events:
            break

        for event in events:
            timestamp = event.get("startTimestamp", 0)
            if timestamp < PREVIOUS_WC_TIMESTAMP:
                reached_edge = True
                break
            collected.append(event)

        page += 1
        time.sleep(0.1)
        if page > 25:
            break

    return collected


def main() -> None:
    synced_at = iso_now()
    print("⏰ Launching deep seasonal and international historical crawler...")

    # -----------------------------------------------------------------
    # PART A: Club + European competitions (tournament season crawl)
    # -----------------------------------------------------------------
    for platform_id, meta in CLUB_LEAGUE_CATALOG.items():
        t_id = meta["tournament_id"]
        print(f"\n🔄 Syncing club league ID {platform_id}: {meta['label']}...")
        try:
            resolved = resolve_current_season(t_id)
            if not resolved:
                print("   ⚠️ Could not resolve season.")
                continue
            season_id, season_name = resolved
            print(f"   Current campaign: {season_name} (ID: {season_id})")

            events_list = crawl_tournament_events(t_id, season_id)

            season_url = f"https://api.sofascore.com/api/v1/unique-tournament/{t_id}/seasons"
            season_res = fetch_json(season_url) or {}
            seasons = season_res.get("seasons", [])
            if not events_list and len(seasons) > 1:
                fallback_id = int(seasons[1]["id"])
                print(f"   💡 Falling back to prior season ID {fallback_id}...")
                events_list = crawl_tournament_events(t_id, fallback_id)
                season_id = fallback_id

            upcoming_url = (
                f"https://api.sofascore.com/api/v1/unique-tournament/{t_id}"
                f"/season/{season_id}/events/next/0"
            )
            upcoming_res = fetch_json(upcoming_url) or {}
            upcoming_events = upcoming_res.get("events", []) if upcoming_res else []

            all_events = events_list + upcoming_events
            if not all_events:
                print("   ⚠️ No fixtures found.")
                continue

            team_matrix: Dict[int, Dict[str, int]] = {}
            for event in all_events:
                upsert_fixture_and_event(
                    event,
                    platform_id=platform_id,
                    league_label=meta["label"],
                    unique_tournament_id=t_id,
                    season_id=season_id,
                    synced_at=synced_at,
                )
                accumulate_team_matrix(event, team_matrix)

            if team_matrix:
                upsert_team_statistics(
                    team_matrix,
                    unique_tournament_id=t_id,
                    season_id=season_id,
                    reference_league_id=platform_id,
                    synced_at=synced_at,
                    source="Club seasonal crawl",
                )

            print(f"   ✅ Saved {len(all_events)} club fixtures.")
        except Exception as exc:
            print(f"   ❌ Error syncing league {platform_id}: {exc}")

    # -----------------------------------------------------------------
    # PART B: International deep history (friendlies, qualifiers, cups)
    # -----------------------------------------------------------------
    print("\n" + "=" * 70)
    print("🌎 Starting deep international matrix harvesting (since Nov 2022)...")

    national_teams = resolve_national_teams()
    print(f"   Using {len(national_teams)} national teams from database catalog.")

    wc_season = resolve_current_season(UNIQUE_TOURNAMENT_WORLD_CUP)
    intl_season_id = int(wc_season[0]) if wc_season else 58210

    all_national_events: List[Dict[str, Any]] = []
    for team in national_teams:
        team_id = team["id"]
        print(f"   📥 Harvesting history for: {team['name']}...")
        team_events = harvest_team_history(team_id)
        all_national_events.extend(team_events)
        print(f"      -> Collected {len(team_events)} matches")

    seen_event_ids: set = set()
    unique_national_events: List[Dict[str, Any]] = []
    for ev in all_national_events:
        eid = ev["id"]
        if eid in seen_event_ids:
            continue
        seen_event_ids.add(eid)
        unique_national_events.append(ev)

    print(f"\n📊 Seeding {len(unique_national_events)} unique international fixtures...")

    intl_team_matrix: Dict[int, Dict[str, int]] = {}
    for event in unique_national_events:
        upsert_fixture_and_event(
            event,
            platform_id=REFERENCE_LEAGUE_WORLD_CUP,
            league_label="International Football Match",
            unique_tournament_id=UNIQUE_TOURNAMENT_WORLD_CUP,
            season_id=intl_season_id,
            synced_at=synced_at,
        )
        accumulate_team_matrix(event, intl_team_matrix)

    if intl_team_matrix:
        print("💾 Updating Poisson team parameters for national sides...")
        upsert_team_statistics(
            intl_team_matrix,
            unique_tournament_id=UNIQUE_TOURNAMENT_WORLD_CUP,
            season_id=intl_season_id,
            reference_league_id=REFERENCE_LEAGUE_WORLD_CUP,
            synced_at=synced_at,
            source="Deep team history ingestion",
        )

    print("\n✨ Deep global sync complete. Friendlies and cross-clashes are cached under league ID 1.")


if __name__ == "__main__":
    main()

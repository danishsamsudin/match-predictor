#!/usr/bin/env python3
"""
Backfill synced_event_statistics from SofaScore (direct API, no RapidAPI quota).

Covers every finished match in synced_events — all leagues, teams, and competitions
stored on the platform. Skips events that already have a statistics row.

Requires: pip install curl_cffi supabase
Env: reads match-predictor/.env.local

Usage:
  python scripts/backfill_event_statistics.py [mode] [max_fetches]

  mode (default: platform)
    platform  Every finished match in synced_events (default for npm run stats:backfill)
    db        Only reference_league_id values that exist in synced_events
    all       Catalog leagues plus any extra leagues found in synced_events
    <id>      Single reference_league_id (e.g. 39)

  max_fetches
    0 = no cap (every missing finished match in scope)
    N = stop after N successful stores this run

Examples:
  npm run stats:backfill
  npm run stats:backfill:batch
  python scripts/backfill_event_statistics.py platform 500
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from curl_cffi import requests
from supabase import Client, create_client

# Mirrors src/lib/data/football-reference.ts FOOTBALL_LEAGUES ids
CATALOG_LEAGUE_IDS = [
    39, 140, 78, 135, 61, 88, 2, 3,
    40, 141, 79, 136, 62, 253, 307,
    848, 1, 4, 5, 6,
]

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

FINISHED_STATUS_VALUES = frozenset({"finished", "ended"})
EVENT_PAGE_SIZE = 500
STATS_LOOKUP_CHUNK = 200
DEFAULT_SLEEP_SEC = 0.12


def load_env_local() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env.local"
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


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sleep_sec() -> float:
    raw = os.environ.get("STATS_BACKFILL_SLEEP", "").strip()
    if not raw:
        return DEFAULT_SLEEP_SEC
    try:
        return max(0.0, float(raw))
    except ValueError:
        return DEFAULT_SLEEP_SEC


def fetch_json(url: str) -> Optional[Any]:
    res = requests.get(url, headers=HEADERS, impersonate="chrome", timeout=30)
    if res.status_code != 200:
        return None
    return res.json()


def has_statistics_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    stats = payload.get("statistics")
    return isinstance(stats, list) and len(stats) > 0


def is_finished_event(row: dict[str, Any]) -> bool:
    status_type = (row.get("status_type") or "").strip().lower()
    if status_type in FINISHED_STATUS_VALUES:
        return True
    payload = row.get("payload") or {}
    if not isinstance(payload, dict):
        return False
    event_status = (payload.get("status") or {}).get("type") or ""
    return str(event_status).strip().lower() in FINISHED_STATUS_VALUES


def event_has_teams(row: dict[str, Any]) -> bool:
    payload = row.get("payload") or {}
    if not isinstance(payload, dict):
        return False
    home = payload.get("homeTeam") or {}
    away = payload.get("awayTeam") or {}
    return bool(home.get("id")) and bool(away.get("id"))


def discover_league_ids_from_db(supabase: Client) -> list[int]:
    seen: set[int] = set()
    offset = 0
    while True:
        res = (
            supabase.table("synced_events")
            .select("reference_league_id")
            .range(offset, offset + EVENT_PAGE_SIZE - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        for row in rows:
            league_id = row.get("reference_league_id")
            if league_id is not None:
                seen.add(int(league_id))
        if len(rows) < EVENT_PAGE_SIZE:
            break
        offset += EVENT_PAGE_SIZE
    return sorted(seen)


def resolve_league_filter(mode: str, supabase: Client) -> Optional[list[int]]:
    lowered = mode.strip().lower()
    if lowered == "platform":
        return None
    if lowered == "db":
        ids = discover_league_ids_from_db(supabase)
        return ids
    if lowered == "all":
        return sorted(set(CATALOG_LEAGUE_IDS) | set(discover_league_ids_from_db(supabase)))
    return [int(mode)]


def existing_stats_for_events(supabase: Client, event_ids: list[int]) -> set[int]:
    found: set[int] = set()
    for i in range(0, len(event_ids), STATS_LOOKUP_CHUNK):
        chunk = event_ids[i : i + STATS_LOOKUP_CHUNK]
        if not chunk:
            continue
        res = (
            supabase.table("synced_event_statistics")
            .select("event_id")
            .in_("event_id", chunk)
            .execute()
        )
        for row in res.data or []:
            found.add(int(row["event_id"]))
    return found


def store_statistics(
    supabase: Client, event_id: int, data: Any, synced_at: str
) -> None:
    supabase.table("synced_event_statistics").upsert(
        {
            "event_id": event_id,
            "payload": data,
            "synced_at": synced_at,
        }
    ).execute()


XG_STAT_NAMES = [
    "Expected goals",
    "Expected Goals",
    "xG",
    "Expected goals (xG)",
    "Expected goals on target (xGOT)",
]
SHOTS_STAT_NAMES = ["Total shots", "Shots", "Shots total", "Total Shots"]
SOT_STAT_NAMES = ["Shots on target", "Shots on goal", "Shots On Target", "On target"]


def _find_stat_value(payload: Any, name: str, side: str) -> Optional[float]:
    if not isinstance(payload, dict):
        return None
    target = name.lower()
    for period in payload.get("statistics") or []:
        if not isinstance(period, dict):
            continue
        for group in period.get("groups") or []:
            if not isinstance(group, dict):
                continue
            for item in group.get("statisticsItems") or []:
                if not isinstance(item, dict):
                    continue
                if str(item.get("name", "")).lower() != target:
                    continue
                raw = item.get(side)
                if raw is None:
                    return None
                if isinstance(raw, (int, float)):
                    return float(raw)
                try:
                    return float(str(raw).replace("%", ""))
                except ValueError:
                    return None
    return None


def _read_stat(payload: Any, names: list[str], side: str) -> Optional[float]:
    for name in names:
        value = _find_stat_value(payload, name, side)
        if value is not None:
            return value
    return None


def extract_match_process_metrics(payload: Any) -> dict[str, Optional[float]]:
    return {
        "home_xg": _read_stat(payload, XG_STAT_NAMES, "home"),
        "away_xg": _read_stat(payload, XG_STAT_NAMES, "away"),
        "home_shots": _read_stat(payload, SHOTS_STAT_NAMES, "home"),
        "away_shots": _read_stat(payload, SHOTS_STAT_NAMES, "away"),
        "home_sot": _read_stat(payload, SOT_STAT_NAMES, "home"),
        "away_sot": _read_stat(payload, SOT_STAT_NAMES, "away"),
    }


def international_match_tier_weight(competition: Optional[str]) -> float:
    c = (competition or "").lower()
    if not c:
        return 0.85
    if any(k in c for k in ("friendl", "preparatory", "preparation", "test match")):
        return 0.32
    if any(
        k in c
        for k in (
            "qualif",
            "play-off",
            "playoff",
            "inter-confederation",
            "wcq",
            "afc",
            "caf",
            "concacaf",
            "conmebol",
            "uefa",
        )
    ):
        return 1.0
    if any(
        k in c
        for k in (
            "world cup",
            "euro",
            "copa",
            "nations league",
            "continental",
            "afcon",
            "gold cup",
            "asian cup",
            "finals",
        )
    ):
        return 1.12
    return 0.88


def _event_date_iso(event: dict[str, Any]) -> Optional[str]:
    start_time = event.get("startTime")
    if isinstance(start_time, str) and start_time:
        return start_time[:10]
    ts = event.get("startTimestamp")
    if isinstance(ts, (int, float)) and ts > 0:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()
    return None


def _competition_label(event: dict[str, Any]) -> str:
    tournament = event.get("tournament") or {}
    if not isinstance(tournament, dict):
        return ""
    unique = tournament.get("uniqueTournament") or {}
    if isinstance(unique, dict) and unique.get("name"):
        return str(unique["name"])
    return str(tournament.get("name") or "")


def upsert_process_metrics_from_stats(
    supabase: Client,
    event_id: int,
    event: dict[str, Any],
    stats_payload: Any,
    synced_at: str,
) -> bool:
    metrics = extract_match_process_metrics(stats_payload)
    if all(v is None for v in metrics.values()):
        return False

    home = event.get("homeTeam") or {}
    away = event.get("awayTeam") or {}
    home_id = home.get("id") if isinstance(home, dict) else None
    away_id = away.get("id") if isinstance(away, dict) else None
    if not home_id or not away_id:
        return False

    competition = _competition_label(event)
    row = {
        "event_id": event_id,
        "source": "sofascore",
        "match_date": _event_date_iso(event),
        "home_team_id": int(home_id),
        "away_team_id": int(away_id),
        **metrics,
        "competition_tier": international_match_tier_weight(competition),
        "payload": {"competition": competition},
        "synced_at": synced_at,
    }
    supabase.table("national_match_process_metrics").upsert(
        row, on_conflict="event_id"
    ).execute()
    return True


def fetch_and_store(
    supabase: Client,
    event_id: int,
    event_row: dict[str, Any],
    synced_at: str,
    pause: float,
) -> bool:
    url = f"https://api.sofascore.com/api/v1/event/{event_id}/statistics"
    data = fetch_json(url)
    time.sleep(pause)
    if not has_statistics_payload(data):
        return False
    store_statistics(supabase, event_id, data, synced_at)
    payload = event_row.get("payload") or {}
    if isinstance(payload, dict):
        upsert_process_metrics_from_stats(supabase, event_id, payload, data, synced_at)
    return True


def iter_event_pages(
    supabase: Client,
    league_ids: Optional[list[int]],
) -> Any:
    offset = 0
    while True:
        query = (
            supabase.table("synced_events")
            .select("event_id, reference_league_id, payload, kickoff_at, status_type")
            .order("kickoff_at", desc=True)
        )
        if league_ids is not None:
            if len(league_ids) == 1:
                query = query.eq("reference_league_id", league_ids[0])
            else:
                query = query.in_("reference_league_id", league_ids)
        res = query.range(offset, offset + EVENT_PAGE_SIZE - 1).execute()
        rows = res.data or []
        if not rows:
            break
        yield rows
        if len(rows) < EVENT_PAGE_SIZE:
            break
        offset += EVENT_PAGE_SIZE


def backfill_scope(
    supabase: Client,
    *,
    mode_label: str,
    league_ids: Optional[list[int]],
    max_fetches: int,
    synced_at: str,
) -> None:
    pause = sleep_sec()
    stored = 0
    failed = 0
    skipped_existing = 0
    skipped_not_finished = 0
    scanned = 0

    print(
        f"Backfilling statistics ({mode_label}), "
        f"max_fetches={'unlimited' if max_fetches == 0 else max_fetches}..."
    )

    for page in iter_event_pages(supabase, league_ids):
        candidates: list[dict[str, Any]] = []
        for row in page:
            scanned += 1
            if not is_finished_event(row) or not event_has_teams(row):
                skipped_not_finished += 1
                continue
            candidates.append(row)

        if not candidates:
            continue

        event_ids = [int(row["event_id"]) for row in candidates]
        already = existing_stats_for_events(supabase, event_ids)

        for row in candidates:
            event_id = int(row["event_id"])
            if event_id in already:
                skipped_existing += 1
                continue
            if max_fetches > 0 and stored >= max_fetches:
                print(
                    f"Reached max_fetches={max_fetches}. Re-run to continue "
                    "(already-synced events are skipped)."
                )
                print(
                    f"Done ({mode_label}). scanned={scanned} "
                    f"already_had_stats={skipped_existing} "
                    f"not_finished={skipped_not_finished} "
                    f"stored={stored} failed={failed}"
                )
                return

            league_id = row.get("reference_league_id")
            if fetch_and_store(supabase, event_id, row, synced_at, pause):
                stored += 1
                print(f"  ok {event_id} (league {league_id})")
            else:
                failed += 1
                print(f"  skip {event_id} (league {league_id}): no statistics")

    print(
        f"Done ({mode_label}). scanned={scanned} "
        f"already_had_stats={skipped_existing} "
        f"not_finished={skipped_not_finished} "
        f"stored={stored} failed={failed}"
    )


def main() -> None:
    load_env_local()
    mode = sys.argv[1] if len(sys.argv) > 1 else "platform"
    max_fetches = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    supabase_url = (
        os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip()
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not supabase_key:
        raise SystemExit(
            "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
        )

    supabase: Client = create_client(supabase_url, supabase_key)
    synced_at = iso_now()

    league_ids = resolve_league_filter(mode, supabase)
    if league_ids is not None and not league_ids:
        raise SystemExit("No leagues in scope. Run seed:sofascore or sync events first.")

    lowered = mode.strip().lower()
    if lowered == "platform":
        label = "all platform matches in synced_events"
    elif lowered == "db":
        label = f"matches in {len(league_ids)} league(s) from synced_events"
    elif lowered == "all":
        label = f"matches in {len(league_ids)} catalog + DB league(s)"
    else:
        label = f"matches in league {mode}"

    backfill_scope(
        supabase,
        mode_label=label,
        league_ids=league_ids,
        max_fetches=max_fetches,
        synced_at=synced_at,
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Import StatsBomb Open Data international tournament xG into national_match_process_metrics.

Downloads match + event JSON from https://github.com/statsbomb/open-data and upserts
process metrics for World Cup, Euro, and Copa competitions.

Usage (from match-predictor/):
  pip install requests supabase
  python scripts/import_statsbomb_international.py [--max-matches N]
"""

from __future__ import annotations

import argparse
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests
from supabase import Client, create_client

OPEN_DATA_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
INTERNATIONAL_COMPETITIONS = {
    43: "FIFA World Cup",
    55: "FIFA World Cup",
    16: "UEFA Euro",
    223: "Copa America",
}

TEAM_NAME_TO_ID: dict[str, int] = {
    "algeria": 4691,
    "argentina": 4819,
    "australia": 4741,
    "austria": 4718,
    "belgium": 4717,
    "bosnia and herzegovina": 4479,
    "brazil": 4748,
    "cabo verde": 4753,
    "canada": 4752,
    "colombia": 4820,
    "cote divoire": 4768,
    "côte d'ivoire": 4768,
    "croatia": 4715,
    "curacao": 55827,
    "curaçao": 55827,
    "czechia": 4714,
    "dr congo": 4823,
    "ecuador": 4757,
    "egypt": 4758,
    "england": 4713,
    "france": 4481,
    "germany": 4711,
    "ghana": 4764,
    "haiti": 7229,
    "iran": 4766,
    "iraq": 4767,
    "japan": 4770,
    "jordan": 4771,
    "mexico": 4781,
    "morocco": 4778,
    "netherlands": 4705,
    "new zealand": 4784,
    "norway": 4475,
    "panama": 5164,
    "paraguay": 4789,
    "portugal": 4704,
    "qatar": 4792,
    "saudi arabia": 4834,
    "scotland": 4695,
    "senegal": 4739,
    "south africa": 4736,
    "south korea": 4735,
    "korea republic": 4735,
    "spain": 4698,
    "sweden": 4688,
    "switzerland": 4699,
    "tunisia": 4729,
    "turkiye": 4700,
    "türkiye": 4700,
    "uruguay": 4725,
    "usa": 4724,
    "united states": 4724,
    "uzbekistan": 4723,
}


def load_env_local() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#") or "=" not in t:
            continue
        key, _, val = t.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def norm_key(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def resolve_team_id(name: str) -> Optional[int]:
    return TEAM_NAME_TO_ID.get(norm_key(name))


def statsbomb_event_id(match_id: int) -> int:
    return -9_000_000 - int(match_id)


def international_match_tier_weight(competition: Optional[str]) -> float:
    c = (competition or "").lower()
    if "world cup" in c:
        return 1.12
    if "euro" in c:
        return 1.12
    if "copa" in c:
        return 1.12
    return 1.0


def fetch_json(url: str) -> Any:
    res = requests.get(url, timeout=60)
    res.raise_for_status()
    return res.json()


def aggregate_shot_xg(
    events: list[dict[str, Any]], match: dict[str, Any]
) -> tuple[float, float, int, int]:
    home_sb_id = match.get("home_team", {}).get("home_team_id") or match.get("home_team", {}).get("id")
    away_sb_id = match.get("away_team", {}).get("away_team_id") or match.get("away_team", {}).get("id")

    home_xg = 0.0
    away_xg = 0.0
    home_shots = 0
    away_shots = 0

    for event in events:
        if event.get("type", {}).get("name") != "Shot":
            continue
        tid = event.get("team", {}).get("id")
        xg = event.get("shot", {}).get("statsbomb_xg")
        if xg is None or tid is None:
            continue
        if tid == home_sb_id:
            home_xg += float(xg)
            home_shots += 1
        elif tid == away_sb_id:
            away_xg += float(xg)
            away_shots += 1
    return home_xg, away_xg, home_shots, away_shots


def create_supabase_client() -> Client:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or "").strip()
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
    return create_client(url, key)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-matches", type=int, default=0, help="Limit matches imported (0 = all)")
    args = parser.parse_args()

    load_env_local()
    supabase = create_supabase_client()
    synced_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    competitions = fetch_json(f"{OPEN_DATA_BASE}/competitions.json")
    target_ids = {
        int(row["competition_id"])
        for row in competitions
        if int(row["competition_id"]) in INTERNATIONAL_COMPETITIONS
    }

    rows: list[dict[str, Any]] = []
    imported = 0

    for comp in competitions:
        comp_id = int(comp["competition_id"])
        if comp_id not in target_ids:
            continue
        season_id = int(comp["season_id"])
        comp_name = INTERNATIONAL_COMPETITIONS.get(comp_id, comp.get("competition_name", ""))
        matches = fetch_json(f"{OPEN_DATA_BASE}/matches/{comp_id}/{season_id}.json")

        for match in matches:
            if args.max_matches > 0 and imported >= args.max_matches:
                break

            match_id = int(match["match_id"])
            home_name = match.get("home_team", {}).get("home_team_name") or match.get("home_team", {}).get("name", "")
            away_name = match.get("away_team", {}).get("away_team_name") or match.get("away_team", {}).get("name", "")
            home_id = resolve_team_id(home_name)
            away_id = resolve_team_id(away_name)
            if not home_id or not away_id:
                continue

            events = fetch_json(f"{OPEN_DATA_BASE}/events/{match_id}.json")
            home_xg, away_xg, home_shots, away_shots = aggregate_shot_xg(events, match)
            if home_xg <= 0 and away_xg <= 0:
                continue

            match_date = (match.get("match_date") or "")[:10] or None
            rows.append(
                {
                    "event_id": statsbomb_event_id(match_id),
                    "source": "statsbomb",
                    "match_date": match_date,
                    "home_team_id": home_id,
                    "away_team_id": away_id,
                    "home_xg": round(home_xg, 3),
                    "away_xg": round(away_xg, 3),
                    "home_shots": home_shots,
                    "away_shots": away_shots,
                    "home_sot": None,
                    "away_sot": None,
                    "competition_tier": international_match_tier_weight(comp_name),
                    "payload": {
                        "competition": comp_name,
                        "statsbomb_match_id": match_id,
                        "statsbomb_competition_id": comp_id,
                        "statsbomb_season_id": season_id,
                    },
                    "synced_at": synced_at,
                }
            )
            imported += 1

        if args.max_matches > 0 and imported >= args.max_matches:
            break

    if not rows:
        print("No StatsBomb international rows to upsert.")
        return

    for i in range(0, len(rows), 200):
        supabase.table("national_match_process_metrics").upsert(
            rows[i : i + 200], on_conflict="event_id"
        ).execute()

    print(f"Upserted {len(rows)} StatsBomb process metric rows.")


if __name__ == "__main__":
    main()

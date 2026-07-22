#!/usr/bin/env python3
"""
Download unique transparent PNG logos for every 25/26 club in the GLPM home leagues:
Premier League, Eredivisie, Serie A, Bundesliga, Championship.

Saves:
  public/team-logos/{sofascoreTeamId}.png
  data/glpm/team-logos-2526/manifest.json
  data/glpm/team-logos-2526/by-league/{league-slug}/{team-id}-{slug}.png  (copies)

Requires RAPIDAPI_KEY in .env.local.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "team-logos"
CURATED_DIR = ROOT / "data" / "glpm" / "team-logos-2526"
BY_LEAGUE_DIR = CURATED_DIR / "by-league"
MANIFEST_PATH = CURATED_DIR / "manifest.json"
REPAIR_MAP_PATH = ROOT / "scripts" / "team-logo-api-repair.json"

# SofaScore uniqueTournamentId + exact 25/26 seasonId
LEAGUES = [
    {"name": "Premier League", "slug": "premier-league", "tournamentId": 17, "seasonId": 76986},
    {"name": "Eredivisie", "slug": "eredivisie", "tournamentId": 37, "seasonId": 77012},
    {"name": "Serie A", "slug": "serie-a", "tournamentId": 23, "seasonId": 76457},
    {"name": "Bundesliga", "slug": "bundesliga", "tournamentId": 35, "seasonId": 77333},
    {"name": "Championship", "slug": "championship", "tournamentId": 18, "seasonId": 77347},
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env.local"
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2)
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        env[key] = val
    return env


def sofascore_host(env: dict[str, str]) -> str:
    host = (env.get("FOOTBALL_PRIMARY_PROVIDER") or "sofascore.p.rapidapi.com").strip()
    host = re.sub(r"^https?://", "", host).rstrip("/")
    return host or "sofascore.p.rapidapi.com"


def http_get_json(url: str, headers: dict[str, str]) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode("utf-8"))


def http_get_bytes(url: str, headers: dict[str, str] | None = None) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=60) as res:
            data = res.read()
        return data if data and len(data) >= 200 else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "team"


def to_rgba_png(raw: bytes) -> bytes | None:
    """Decode any Pillow-supported image and re-encode as transparent PNG."""
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGBA")
        # Reject near-empty / tiny garbage
        if img.width < 16 or img.height < 16:
            return None
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        data = out.getvalue()
        return data if len(data) >= 200 else None
    except Exception:
        return None


def has_transparency(png: bytes) -> bool:
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    alpha = img.getchannel("A")
    # True if any pixel is not fully opaque
    extrema = alpha.getextrema()
    return extrema[0] < 255


def collect_teams(api_key: str, host: str) -> list[dict]:
    headers = {"x-rapidapi-key": api_key, "x-rapidapi-host": host}
    teams: list[dict] = []
    seen: set[int] = set()

    for league in LEAGUES:
        params = urllib.parse.urlencode(
            {
                "tournamentId": league["tournamentId"],
                "seasonId": league["seasonId"],
                "type": "total",
            }
        )
        url = f"https://{host}/tournaments/get-standings?{params}"
        data = http_get_json(url, headers)
        count = 0
        for group in data.get("standings") or []:
            for row in group.get("rows") or []:
                team = row.get("team") or {}
                tid = team.get("id")
                name = team.get("name")
                if not tid or not name:
                    continue
                tid = int(tid)
                if tid in seen:
                    continue
                seen.add(tid)
                teams.append(
                    {
                        "id": tid,
                        "name": name,
                        "shortName": team.get("shortName") or name,
                        "slug": team.get("slug") or slugify(name),
                        "league": league["name"],
                        "leagueSlug": league["slug"],
                        "tournamentId": league["tournamentId"],
                        "seasonId": league["seasonId"],
                        "season": "25/26",
                    }
                )
                count += 1
        print(f"  {league['name']}: {count} teams (season {league['seasonId']})")
        time.sleep(0.15)

    return teams


def download_logo(api_key: str, host: str, team_id: int, repair: dict[int, int]) -> bytes | None:
    headers = {"x-rapidapi-key": api_key, "x-rapidapi-host": host}
    url = f"https://{host}/teams/get-logo?teamId={team_id}"
    raw = http_get_bytes(url, headers)
    png = to_rgba_png(raw) if raw else None
    if png:
        return png

    api_id = repair.get(team_id)
    if api_id is not None:
        raw = http_get_bytes(f"https://media.api-sports.io/football/teams/{api_id}.png")
        png = to_rgba_png(raw) if raw else None
        if png:
            return png
    return None


def main() -> int:
    env = load_env()
    api_key = env.get("RAPIDAPI_KEY") or env.get("FOOTBALL_API_KEY")
    if not api_key:
        print("Missing RAPIDAPI_KEY in .env.local", file=sys.stderr)
        return 1

    host = sofascore_host(env)
    repair_raw = json.loads(REPAIR_MAP_PATH.read_text()) if REPAIR_MAP_PATH.exists() else {}
    repair = {int(k): int(v) for k, v in repair_raw.items()}

    print(f"SofaScore host: {host}")
    print("Fetching 25/26 standings for GLPM home leagues…")
    teams = collect_teams(api_key, host)
    print(f"Total unique teams: {len(teams)}")

    if len(teams) < 90:
        print(f"ERROR: expected ~100 teams, got {len(teams)}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    BY_LEAGUE_DIR.mkdir(parents=True, exist_ok=True)

    hashes: dict[str, list[dict]] = {}
    ok = 0
    fail = 0
    opaque = 0
    entries: list[dict] = []

    for team in teams:
        tid = team["id"]
        png = download_logo(api_key, host, tid, repair)
        if not png:
            fail += 1
            print(f"✗ {tid} {team['name']}")
            continue

        digest = hashlib.sha256(png).hexdigest()
        hashes.setdefault(digest, []).append(team)
        transparent = has_transparency(png)
        if not transparent:
            opaque += 1

        dest = OUT_DIR / f"{tid}.png"
        dest.write_bytes(png)

        league_dir = BY_LEAGUE_DIR / team["leagueSlug"]
        league_dir.mkdir(parents=True, exist_ok=True)
        curated = league_dir / f"{tid}-{team['slug']}.png"
        curated.write_bytes(png)

        entries.append(
            {
                **team,
                "path": f"/team-logos/{tid}.png",
                "curatedPath": str(curated.relative_to(ROOT)),
                "sha256": digest,
                "bytes": len(png),
                "transparent": transparent,
            }
        )
        flag = "" if transparent else " (no alpha pixels)"
        print(f"✓ {tid} {team['name']}{flag}")
        ok += 1
        time.sleep(0.09)

    dups = {h: v for h, v in hashes.items() if len(v) > 1}
    if dups:
        print("\nERROR: duplicate logo content detected:")
        for h, group in dups.items():
            print(f"  {h[:12]}… → {[ (t['id'], t['name']) for t in group ]}")
        fail += len(dups)

    by_league: dict[str, list[dict]] = {}
    for e in entries:
        by_league.setdefault(e["league"], []).append(
            {
                "id": e["id"],
                "name": e["name"],
                "shortName": e["shortName"],
                "slug": e["slug"],
                "path": e["path"],
                "curatedPath": e["curatedPath"],
                "sha256": e["sha256"],
                "transparent": e["transparent"],
            }
        )

    manifest = {
        "season": "25/26",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "leagues": [lg["name"] for lg in LEAGUES],
        "teamCount": len(entries),
        "uniqueHashes": len(hashes),
        "opaqueCount": opaque,
        "failedCount": fail,
        "storage": {
            "web": "public/team-logos/{sofascoreTeamId}.png",
            "curated": "data/glpm/team-logos-2526/by-league/{league}/{id}-{slug}.png",
        },
        "byLeague": by_league,
        "teams": entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    print(
        f"\nDone: {ok} saved, {fail} failed, {opaque} without alpha pixels, "
        f"{len(hashes)} unique hashes → {OUT_DIR} + {CURATED_DIR}"
    )
    if fail or dups:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

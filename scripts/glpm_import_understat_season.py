#!/usr/bin/env python3
"""
Scrape Understat season aggregates and patch Attack / Defence / Finishing on
glpm_team_rating_vectors (percentile within each league).

Understat coverage: EPL, Serie A, Bundesliga (not Championship / Eredivisie).

Usage:
  python3 scripts/glpm_import_understat_season.py
  python3 scripts/glpm_import_understat_season.py --league epl --season 2025
  python3 scripts/glpm_import_understat_season.py --all --dry-run
  python3 scripts/glpm_import_understat_season.py --from-cache  # use data/understat/*/league-table.json
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import ssl
import sys
import urllib.request
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from glpm_fetch_ppda import TEAM_NAME_MAP  # noqa: E402

MODEL_VERSION = "understat_season_v1"
UNDERSTAT_BASE = "https://understat.com"
UNDERSTAT_UA = (
    "Mozilla/5.0 (compatible; match-predictor-understat-season/1.0)"
)


@dataclass(frozen=True)
class LeagueSeasonConfig:
    key: str
    label: str
    understat_slug: str
    season_year: int
    season_label: str
    season_sm_id: int
    competition_sm_id: int
    expected_teams: int
    as_of_date: str
    data_dir: Path


# SportMonks season ids from src/lib/sportmonks/constants.ts
LEAGUE_SEASONS: list[LeagueSeasonConfig] = [
    LeagueSeasonConfig(
        key="epl-2025",
        label="Premier League",
        understat_slug="EPL",
        season_year=2025,
        season_label="2025/26",
        season_sm_id=25583,
        competition_sm_id=8,
        expected_teams=20,
        as_of_date="2026-05-24",
        data_dir=ROOT / "data" / "understat" / "epl-2025-26",
    ),
    LeagueSeasonConfig(
        key="epl-2026",
        label="Premier League",
        understat_slug="EPL",
        season_year=2026,
        season_label="2026/27",
        season_sm_id=28083,
        competition_sm_id=8,
        expected_teams=20,
        as_of_date="2026-09-07",
        data_dir=ROOT / "data" / "understat" / "epl-2026-27",
    ),
    LeagueSeasonConfig(
        key="serie_a-2025",
        label="Serie A",
        understat_slug="Serie_A",
        season_year=2025,
        season_label="2025/26",
        season_sm_id=25533,
        competition_sm_id=384,
        expected_teams=20,
        as_of_date="2026-05-24",
        data_dir=ROOT / "data" / "understat" / "serie-a-2025-26",
    ),
    LeagueSeasonConfig(
        key="serie_a-2026",
        label="Serie A",
        understat_slug="Serie_A",
        season_year=2026,
        season_label="2026/27",
        season_sm_id=27895,
        competition_sm_id=384,
        expected_teams=20,
        as_of_date="2026-09-07",
        data_dir=ROOT / "data" / "understat" / "serie-a-2026-27",
    ),
    LeagueSeasonConfig(
        key="bundesliga-2025",
        label="Bundesliga",
        understat_slug="Bundesliga",
        season_year=2025,
        season_label="2025/26",
        season_sm_id=25646,
        competition_sm_id=82,
        expected_teams=18,
        as_of_date="2026-05-17",
        data_dir=ROOT / "data" / "understat" / "bundesliga-2025-26",
    ),
    LeagueSeasonConfig(
        key="bundesliga-2026",
        label="Bundesliga",
        understat_slug="Bundesliga",
        season_year=2026,
        season_label="2026/27",
        season_sm_id=28321,
        competition_sm_id=82,
        expected_teams=18,
        as_of_date="2026-09-07",
        data_dir=ROOT / "data" / "understat" / "bundesliga-2026-27",
    ),
]

# Keep legacy PL path readable by older tooling / overlay checks.
LEGACY_PL_DIR = ROOT / "data" / "understat" / "pl-2025-26"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k, v in os.environ.items():
        env.setdefault(k, v)
    return env


def rest(
    env: dict[str, str],
    method: str,
    path: str,
    body: Any = None,
    *,
    prefer: str | None = None,
) -> Any:
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = Request(f"{base}/rest/v1/{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:800]}") from e


def percentile_scores(values: list[float], *, higher_is_better: bool) -> list[float]:
    n = len(values)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: values[i], reverse=higher_is_better)
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg_rank = (i + j) / 2.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    if n == 1:
        pcts = [0.5]
    else:
        pcts = [1.0 - (r / (n - 1)) for r in ranks]

    edges_p = [0.0, 0.05, 0.20, 0.40, 0.60, 0.80, 0.95, 1.0]
    edges_s = [20.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
    out: list[float] = []
    for p in pcts:
        for a, b, sa, sb in zip(edges_p, edges_p[1:], edges_s, edges_s[1:]):
            if p <= b or b == 1.0:
                t = 0.0 if b == a else (p - a) / (b - a)
                out.append(round(sa + t * (sb - sa), 2))
                break
    return out


def _read_body(resp: Any) -> bytes:
    raw = resp.read()
    encoding = (resp.headers.get("Content-Encoding") or "").lower()
    if encoding == "gzip" or raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    if encoding == "deflate":
        try:
            return zlib.decompress(raw)
        except zlib.error:
            return zlib.decompress(raw, -zlib.MAX_WBITS)
    return raw


def fetch_understat_league(slug: str, season_year: int) -> dict[str, Any]:
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(),
        urllib.request.HTTPSHandler(context=ctx),
    )
    warm = urllib.request.Request(
        f"{UNDERSTAT_BASE}/league/{slug}/{season_year}",
        headers={"User-Agent": UNDERSTAT_UA, "Accept-Encoding": "gzip, deflate"},
    )
    with opener.open(warm, timeout=60) as resp:
        _read_body(resp)

    headers = {
        "User-Agent": UNDERSTAT_UA,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Encoding": "gzip, deflate",
        "Referer": f"{UNDERSTAT_BASE}/league/{slug}/{season_year}",
    }
    api = urllib.request.Request(
        f"{UNDERSTAT_BASE}/getLeagueData/{slug}/{season_year}",
        headers=headers,
    )
    with opener.open(api, timeout=60) as resp:
        raw = _read_body(resp).decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise RuntimeError(f"Unexpected Understat payload for {slug}/{season_year}")
    return {
        "dates": data.get("dates") or data.get("datesData") or [],
        "teams": data.get("teams") or data.get("teamsData") or {},
        "players": data.get("players") or data.get("playersData") or [],
    }


def build_league_table(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Aggregate Understat team history into a season table.

    History rows are per-match: sum xG/xGA/xpts/scored/missed/pts and count
    results from the ``result`` field (w/d/l).
    """
    teams = payload.get("teams") or {}
    team_iter = teams.values() if isinstance(teams, dict) else teams
    rows: list[dict[str, Any]] = []
    for team in team_iter:
        title = str(team.get("title") or "")
        history = team.get("history") or []
        if not isinstance(history, list) or not history:
            continue
        wins = draws = loses = goals = ga = points = 0
        xg = xga = xpts = 0.0
        for h in history:
            xg += float(h.get("xG") or 0)
            xga += float(h.get("xGA") or 0)
            xpts += float(h.get("xpts") or 0)
            goals += int(h.get("scored") or 0)
            ga += int(h.get("missed") or 0)
            result = str(h.get("result") or "").lower()
            if result == "w":
                wins += 1
                points += 3
            elif result == "d":
                draws += 1
                points += 1
            elif result == "l":
                loses += 1
            else:
                # Fallback if result missing: use per-row pts/wins fields.
                points += int(h.get("pts") or 0)
                wins += int(h.get("wins") or 0)
                draws += int(h.get("draws") or 0)
                loses += int(h.get("loses") or 0)
        rows.append(
            {
                "team": title,
                "matches": len(history),
                "wins": wins,
                "draws": draws,
                "loses": loses,
                "goals": goals,
                "ga": ga,
                "points": points,
                "xG": round(xg, 4),
                "xGA": round(xga, 4),
                "xPTS": round(xpts, 4),
            }
        )
    rows.sort(key=lambda r: (-r["points"], -(r["goals"] - r["ga"]), -r["goals"]))
    for i, r in enumerate(rows, start=1):
        r["number"] = i
    return rows


def normalize_players(payload: dict[str, Any]) -> list[dict[str, Any]]:
    players = payload.get("players") or []
    if isinstance(players, dict):
        players = list(players.values())
    out: list[dict[str, Any]] = []
    for p in players:
        if not isinstance(p, dict):
            continue
        out.append(
            {
                "id": p.get("id"),
                "player_name": p.get("player_name") or p.get("name"),
                "team": p.get("team_title") or p.get("team"),
                "games": p.get("games"),
                "time": p.get("time"),
                "goals": p.get("goals"),
                "xG": p.get("xG"),
                "assists": p.get("assists"),
                "xA": p.get("xA"),
                "shots": p.get("shots"),
                "key_passes": p.get("key_passes"),
                "yellow_cards": p.get("yellow_cards"),
                "red_cards": p.get("red_cards"),
                "position": p.get("position"),
                "npg": p.get("npg"),
                "npxG": p.get("npxG"),
                "xGChain": p.get("xGChain"),
                "xGBuildup": p.get("xGBuildup"),
            }
        )
    return out


def import_league(
    cfg: LeagueSeasonConfig,
    *,
    env: dict[str, str],
    dry_run: bool,
    from_cache: bool,
    min_matches: int,
) -> dict[str, Any]:
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    table_path = cfg.data_dir / "league-table.json"
    players_path = cfg.data_dir / "players.json"
    manifest_path = cfg.data_dir / "import-manifest.json"

    if from_cache and table_path.exists() and players_path.exists():
        table = json.loads(table_path.read_text(encoding="utf-8"))
        players = json.loads(players_path.read_text(encoding="utf-8"))
        scraped = False
    else:
        payload = fetch_understat_league(cfg.understat_slug, cfg.season_year)
        table = build_league_table(payload)
        players = normalize_players(payload)
        scraped = True
        table_path.write_text(json.dumps(table, indent=2), encoding="utf-8")
        players_path.write_text(json.dumps(players, indent=2), encoding="utf-8")
        # Mirror legacy PL path for older overlay checks.
        if cfg.season_sm_id == 25583:
            LEGACY_PL_DIR.mkdir(parents=True, exist_ok=True)
            (LEGACY_PL_DIR / "league-table.json").write_text(
                json.dumps(table, indent=2), encoding="utf-8"
            )
            (LEGACY_PL_DIR / "players.json").write_text(
                json.dumps(players, indent=2), encoding="utf-8"
            )

    if not isinstance(table, list) or not table:
        raise RuntimeError(f"{cfg.key}: empty league table")

    # Skip very early seasons unless explicitly forced via low min_matches.
    max_matches = max(int(r.get("matches") or 0) for r in table)
    if max_matches < min_matches:
        return {
            "key": cfg.key,
            "skipped": True,
            "reason": f"only {max_matches} matches played (min {min_matches})",
            "teams": len(table),
        }

    teams = rest(env, "GET", "glpm_teams?select=sm_id,name,official_name&limit=2000")
    by_name: dict[str, int] = {}
    for t in teams:
        by_name[str(t["name"]).strip().lower()] = int(t["sm_id"])
        off = t.get("official_name")
        if isinstance(off, str) and off.strip():
            by_name.setdefault(off.strip().lower(), int(t["sm_id"]))

    rows: list[dict[str, Any]] = []
    unmatched: list[str] = []
    for row in table:
        us_name = str(row["team"])
        glpm_name = TEAM_NAME_MAP.get(us_name, us_name)
        team_id = by_name.get(glpm_name.lower())
        if team_id is None:
            unmatched.append(us_name)
            continue
        matches = max(int(row.get("matches") or 0), 1)
        xg = float(row["xG"])
        xga = float(row["xGA"])
        gf = int(row["goals"])
        rows.append(
            {
                "understat_team": us_name,
                "glpm_team": glpm_name,
                "team_sm_id": team_id,
                "league_rank": int(row["number"]),
                "matches": int(row["matches"]),
                "wins": int(row["wins"]),
                "draws": int(row["draws"]),
                "losses": int(row.get("loses") or row.get("losses") or 0),
                "goals_for": gf,
                "goals_against": int(row["ga"]),
                "points": int(row["points"]),
                "xg": xg,
                "xga": xga,
                "xpts": float(row.get("xPTS") or row.get("xpts") or 0),
                "xg_p90": xg / matches,
                "xga_p90": xga / matches,
                "goals_minus_xg": gf - xg,
                "payload": row,
            }
        )

    if unmatched:
        raise RuntimeError(f"{cfg.key}: unmatched Understat teams: {unmatched}")
    if abs(len(rows) - cfg.expected_teams) > 2:
        raise RuntimeError(
            f"{cfg.key}: expected ~{cfg.expected_teams} teams, got {len(rows)}"
        )

    attack_scores = percentile_scores([r["xg"] for r in rows], higher_is_better=True)
    defence_scores = percentile_scores([r["xga"] for r in rows], higher_is_better=False)
    finishing_scores = percentile_scores(
        [r["goals_minus_xg"] for r in rows], higher_is_better=True
    )

    existing = (
        rest(
            env,
            "GET",
            (
                f"glpm_team_rating_vectors?season_id=eq.{cfg.season_sm_id}"
                "&select=team_sm_id,as_of_date,r_goalkeeper,r_build_up,r_possession,r_pressing,metadata"
                "&order=as_of_date.desc"
            ),
        )
        or []
    )
    existing_by_id: dict[int, dict[str, Any]] = {}
    as_of_date = cfg.as_of_date
    for x in existing:
        tid = int(x["team_sm_id"])
        if tid not in existing_by_id:
            existing_by_id[tid] = x
        prev_as_of = str(x.get("as_of_date") or "")
        if prev_as_of > as_of_date:
            as_of_date = prev_as_of

    now = datetime.now(timezone.utc).isoformat()
    upserts: list[dict[str, Any]] = []
    players_by_team: dict[str, list[dict[str, Any]]] = {}
    for p in players:
        team = p.get("team")
        if isinstance(team, str):
            players_by_team.setdefault(team, []).append(p)

    for i, r in enumerate(rows):
        r_attack = attack_scores[i]
        r_defence = defence_scores[i]
        r_finishing = finishing_scores[i]
        quality_overall = round((r_attack + r_defence + r_finishing) / 3.0, 2)
        team_players = players_by_team.get(r["understat_team"], [])

        prev = existing_by_id.get(int(r["team_sm_id"]), {})
        r_goalkeeper = float(prev.get("r_goalkeeper") or 60.0)
        r_build_up = float(prev.get("r_build_up") or 60.0)
        r_possession = float(prev.get("r_possession") or 60.0)
        r_pressing = float(prev.get("r_pressing") or 60.0)
        if r_goalkeeper == 50.0:
            r_goalkeeper = 60.0
        if r_build_up == 50.0:
            r_build_up = 60.0
        if r_possession == 50.0:
            r_possession = 60.0
        if r_pressing == 50.0:
            r_pressing = 60.0

        prev_meta = prev.get("metadata") if isinstance(prev.get("metadata"), dict) else {}
        meta = {
            **prev_meta,
            "source": "understat_season_import",
            "season_label": cfg.season_label,
            "imported_at": now,
            "understat": {
                "league": cfg.label,
                "slug": cfg.understat_slug,
                "season_year": cfg.season_year,
                "league_rank": r["league_rank"],
                "points": r["points"],
                "xg": r["xg"],
                "xga": r["xga"],
                "xpts": r["xpts"],
                "goals_for": r["goals_for"],
                "goals_against": r["goals_against"],
                "goals_minus_xg": round(r["goals_minus_xg"], 4),
                "player_rows": len(team_players),
            },
            "derived": {
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_finishing": r_finishing,
                "quality_overall": quality_overall,
                "method": "season_xg_percentile_within_league",
            },
        }

        upserts.append(
            {
                "team_sm_id": r["team_sm_id"],
                "season_id": cfg.season_sm_id,
                "as_of_date": as_of_date,
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_goalkeeper": r_goalkeeper,
                "r_build_up": r_build_up,
                "r_possession": r_possession,
                "r_pressing": r_pressing,
                "r_finishing": r_finishing,
                "metadata": meta,
                "model_version": MODEL_VERSION,
                "updated_at": now,
            }
        )
        r["r_attack"] = r_attack
        r["r_defence"] = r_defence
        r["r_finishing"] = r_finishing
        r["quality_overall"] = quality_overall

    ranked = sorted(rows, key=lambda x: -x["quality_overall"])
    manifest = {
        "key": cfg.key,
        "season_label": cfg.season_label,
        "season_sm_id": cfg.season_sm_id,
        "competition_sm_id": cfg.competition_sm_id,
        "as_of_date": as_of_date,
        "model_version": MODEL_VERSION,
        "scraped": scraped,
        "from_cache": from_cache and not scraped,
        "teams_imported": len(rows),
        "players_imported": len(players),
        "max_matches": max_matches,
        "leaderboard_preview": [
            {
                "rank": i + 1,
                "team": r["glpm_team"],
                "quality_overall": r["quality_overall"],
                "r_attack": r["r_attack"],
                "r_defence": r["r_defence"],
                "r_finishing": r["r_finishing"],
                "xg": r["xg"],
                "xga": r["xga"],
                "points": r["points"],
            }
            for i, r in enumerate(ranked)
        ],
        "dry_run": dry_run,
        "not_covered": [
            "Championship (no Understat)",
            "Eredivisie (no Understat)",
        ],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (cfg.data_dir / "teams-normalized.json").write_text(
        json.dumps(rows, indent=2), encoding="utf-8"
    )

    print(f"\n=== {cfg.label} {cfg.season_label} (sm {cfg.season_sm_id}) ===")
    print(f"Mapped {len(rows)} teams, {len(players)} players (max MP={max_matches})")
    for row in manifest["leaderboard_preview"][:5]:
        print(
            f"  {row['rank']:2d}. {row['team']:<28} "
            f"A {row['r_attack']:5.1f} D {row['r_defence']:5.1f} FR {row['r_finishing']:5.1f}  "
            f"qual {row['quality_overall']:5.1f}"
        )

    if dry_run:
        print("Dry run - no Supabase writes")
        return manifest

    rest(
        env,
        "POST",
        "glpm_team_rating_vectors?on_conflict=team_sm_id,season_id,as_of_date",
        upserts,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"Upserted {len(upserts)} vectors @ {as_of_date}")
    return manifest


def resolve_configs(args: argparse.Namespace) -> list[LeagueSeasonConfig]:
    if args.season_id is not None:
        out = [c for c in LEAGUE_SEASONS if c.season_sm_id == args.season_id]
        if not out:
            raise SystemExit(f"No config for season-id {args.season_id}")
        return out

    if args.all:
        return list(LEAGUE_SEASONS)

    if args.league is None and args.season is None:
        # Default: completed Understat seasons only (skip early current year).
        return [c for c in LEAGUE_SEASONS if c.season_year == 2025]

    out: list[LeagueSeasonConfig] = []
    for cfg in LEAGUE_SEASONS:
        if args.league:
            league = args.league.lower().replace("-", "_")
            if league not in cfg.key and league not in cfg.understat_slug.lower():
                continue
        if args.season is not None and cfg.season_year != args.season:
            continue
        out.append(cfg)

    if not out:
        raise SystemExit("No matching league/season configs")
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--from-cache", action="store_true")
    parser.add_argument("--all", action="store_true", help="Import every configured league/season")
    parser.add_argument("--league", type=str, default=None, help="epl | serie_a | bundesliga")
    parser.add_argument("--season", type=int, default=None, help="Understat season start year e.g. 2025")
    parser.add_argument("--season-id", type=int, default=None, help="SportMonks season id")
    parser.add_argument(
        "--min-matches",
        type=int,
        default=10,
        help="Skip seasons with fewer than N matches played per club (default 10)",
    )
    args = parser.parse_args()

    env = load_env()
    for required in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not env.get(required):
            raise SystemExit(f"Missing {required} in .env.local")

    configs = resolve_configs(args)
    results = []
    for cfg in configs:
        try:
            results.append(
                import_league(
                    cfg,
                    env=env,
                    dry_run=args.dry_run,
                    from_cache=args.from_cache,
                    min_matches=args.min_matches,
                )
            )
        except Exception as exc:
            print(f"FAILED {cfg.key}: {exc}")
            results.append({"key": cfg.key, "ok": False, "error": str(exc)})

    ok = sum(1 for r in results if r.get("ok", True) and not r.get("skipped"))
    skipped = sum(1 for r in results if r.get("skipped"))
    failed = sum(1 for r in results if r.get("ok") is False)
    print(f"\nDone: imported={ok} skipped={skipped} failed={failed}")
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

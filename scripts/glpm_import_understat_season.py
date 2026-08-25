#!/usr/bin/env python3
"""
Import Understat-style season aggregates (league table + players) for PL 2025/26.

Updates Attack / Defence / Finishing on glpm_team_rating_vectors from real season
xG / xGA / Goals−xG (percentile within the league).

Also writes normalized artifacts under data/understat/pl-2025-26/.

Usage:
  python3 scripts/glpm_import_understat_season.py
  python3 scripts/glpm_import_understat_season.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "understat" / "pl-2025-26"
TABLE_PATH = DATA_DIR / "league-table.json"
PLAYERS_PATH = DATA_DIR / "players.json"
MANIFEST_PATH = DATA_DIR / "import-manifest.json"

SEASON_LABEL = "2025/26"
SEASON_SM_ID = 25583
COMPETITION_SM_ID = 8
AS_OF_DATE = "2026-05-24"
MODEL_VERSION = "understat_season_v1"

TEAM_NAME_MAP: dict[str, str] = {
    "Arsenal": "Arsenal",
    "Aston Villa": "Aston Villa",
    "Bournemouth": "AFC Bournemouth",
    "Brentford": "Brentford",
    "Brighton": "Brighton & Hove Albion",
    "Burnley": "Burnley",
    "Chelsea": "Chelsea",
    "Crystal Palace": "Crystal Palace",
    "Everton": "Everton",
    "Fulham": "Fulham",
    "Leeds": "Leeds United",
    "Liverpool": "Liverpool",
    "Manchester City": "Manchester City",
    "Manchester United": "Manchester United",
    "Newcastle United": "Newcastle United",
    "Nottingham Forest": "Nottingham Forest",
    "Sunderland": "Sunderland",
    "Tottenham": "Tottenham Hotspur",
    "West Ham": "West Ham United",
    "Wolverhampton Wanderers": "Wolverhampton Wanderers",
}


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not TABLE_PATH.exists() or not PLAYERS_PATH.exists():
        raise SystemExit(f"Missing input files under {DATA_DIR}")

    table = json.loads(TABLE_PATH.read_text(encoding="utf-8"))
    players = json.loads(PLAYERS_PATH.read_text(encoding="utf-8"))
    if not isinstance(table, list) or not isinstance(players, list):
        raise SystemExit("Expected JSON arrays for league table and players")

    env = load_env()
    for required in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not env.get(required):
            raise SystemExit(f"Missing {required} in .env.local")

    teams = rest(env, "GET", "glpm_teams?select=sm_id,name,official_name&limit=1000")
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
                "losses": int(row["loses"]),
                "goals_for": gf,
                "goals_against": int(row["ga"]),
                "points": int(row["points"]),
                "xg": xg,
                "xga": xga,
                "xpts": float(row.get("xPTS") or 0),
                "xg_p90": xg / matches,
                "xga_p90": xga / matches,
                "goals_minus_xg": gf - xg,
                "payload": row,
            }
        )

    if unmatched:
        raise SystemExit(f"Unmatched Understat teams: {unmatched}")
    if len(rows) != 20:
        raise SystemExit(f"Expected 20 PL teams, got {len(rows)}")

    attack_scores = percentile_scores([r["xg"] for r in rows], higher_is_better=True)
    defence_scores = percentile_scores([r["xga"] for r in rows], higher_is_better=False)
    finishing_scores = percentile_scores(
        [r["goals_minus_xg"] for r in rows], higher_is_better=True
    )

    players_by_team: dict[str, list[dict[str, Any]]] = {}
    for p in players:
        players_by_team.setdefault(str(p["team"]), []).append(p)

    existing = rest(
        env,
        "GET",
        (
            f"glpm_team_rating_vectors?season_id=eq.{SEASON_SM_ID}"
            f"&as_of_date=eq.{AS_OF_DATE}"
            "&select=team_sm_id,r_goalkeeper,r_build_up,r_possession,r_pressing,metadata"
        ),
    ) or []
    existing_by_id = {int(x["team_sm_id"]): x for x in existing}

    now = datetime.now(timezone.utc).isoformat()
    upserts: list[dict[str, Any]] = []
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
        # Replace neutral 50 defaults with 60 so style dims don't drag quality Overall down.
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
            "season_label": SEASON_LABEL,
            "imported_at": now,
            "understat": {
                "league_rank": r["league_rank"],
                "points": r["points"],
                "xg": r["xg"],
                "xga": r["xga"],
                "xpts": r["xpts"],
                "goals_for": r["goals_for"],
                "goals_against": r["goals_against"],
                "goals_minus_xg": round(r["goals_minus_xg"], 4),
                "player_rows": len(team_players),
                "player_xg_sum": round(
                    sum(float(p.get("xG") or 0) for p in team_players), 4
                ),
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
                "season_id": SEASON_SM_ID,
                "as_of_date": AS_OF_DATE,
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
        "season_label": SEASON_LABEL,
        "season_sm_id": SEASON_SM_ID,
        "competition_sm_id": COMPETITION_SM_ID,
        "as_of_date": AS_OF_DATE,
        "model_version": MODEL_VERSION,
        "teams_imported": len(rows),
        "players_imported": len(players),
        "player_teams_in_file": len({p["team"] for p in players}),
        "sufficient_for": [
            "PL Attack / Defence / Finishing season priors",
            "League Hub ranking sanity for PL 2025/26",
            "Finishing over/under-performance (Goals − xG)",
        ],
        "not_sufficient_for": [
            "Match-level GLPM training (needs per-match xG/xGA)",
            "Pressing / Build-up / Possession / GK dimensions",
            "Other leagues (Serie A, Bundesliga, …)",
            "Live in-play prediction features",
        ],
        "note": (
            "Season aggregates only. Updated Attack/Defence/Finishing from "
            "xG/xGA/Goals−xG percentiles within PL."
        ),
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
        "dry_run": bool(args.dry_run),
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (DATA_DIR / "teams-normalized.json").write_text(
        json.dumps(rows, indent=2), encoding="utf-8"
    )
    (DATA_DIR / "players-normalized.json").write_text(
        json.dumps(players, indent=2), encoding="utf-8"
    )

    print(f"Mapped {len(rows)} teams, {len(players)} players")
    print("Quality leaderboard (Understat season xG → A/D/FR):")
    for row in manifest["leaderboard_preview"][:10]:
        print(
            f"  {row['rank']:2d}. {row['team']:<28} "
            f"A {row['r_attack']:5.1f} D {row['r_defence']:5.1f} FR {row['r_finishing']:5.1f}  "
            f"qual {row['quality_overall']:5.1f}  "
            f"(xG {row['xg']:.1f} xGA {row['xga']:.1f}, {row['points']} pts)"
        )

    if args.dry_run:
        print("Dry run — no Supabase writes")
        return 0

    rest(
        env,
        "POST",
        "glpm_team_rating_vectors?on_conflict=team_sm_id,season_id,as_of_date",
        upserts,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"Upserted {len(upserts)} rating vectors for season {SEASON_SM_ID} @ {AS_OF_DATE}")
    print(f"Manifest: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

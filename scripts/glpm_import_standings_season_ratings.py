#!/usr/bin/env python3
"""
Patch Attack / Defence / Finishing from finished-match GF/GA for leagues
Understat does not cover (Championship, Eredivisie).

Uses season goal percentiles (not true xG). Better than SportMonks shot-proxy
ML when real xG coverage is zero.

Usage:
  python3 scripts/glpm_import_standings_season_ratings.py
  python3 scripts/glpm_import_standings_season_ratings.py --season-id 25597
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
MODEL_VERSION = "standings_goals_season_v1"

# Reuse percentile helper from understat importer.
import sys

sys.path.insert(0, str(ROOT / "scripts"))
from glpm_import_understat_season import percentile_scores  # noqa: E402

SEASONS = [
    {
        "key": "eredivisie-2025",
        "label": "Eredivisie",
        "season_sm_id": 25597,
        "competition_sm_id": 72,
        "as_of_date": "2026-05-18",
        "expected_teams": 18,
        "data_dir": ROOT / "data" / "standings-ratings" / "eredivisie-2025-26",
    },
    {
        "key": "championship-2025",
        "label": "Championship",
        "season_sm_id": 25648,
        "competition_sm_id": 9,
        "as_of_date": "2026-05-03",
        "expected_teams": 24,
        "data_dir": ROOT / "data" / "standings-ratings" / "championship-2025-26",
    },
    {
        "key": "eredivisie-2026",
        "label": "Eredivisie",
        "season_sm_id": 27958,
        "competition_sm_id": 72,
        "as_of_date": "2026-09-07",
        "expected_teams": 18,
        "data_dir": ROOT / "data" / "standings-ratings" / "eredivisie-2026-27",
        "min_matches": 6,
    },
    {
        "key": "championship-2026",
        "label": "Championship",
        "season_sm_id": 27903,
        "competition_sm_id": 9,
        "as_of_date": "2026-09-07",
        "expected_teams": 24,
        "data_dir": ROOT / "data" / "standings-ratings" / "championship-2026-27",
        "min_matches": 6,
    },
]


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


def build_table_from_matches(env: dict[str, str], season_id: int) -> list[dict[str, Any]]:
    matches = (
        rest(
            env,
            "GET",
            (
                f"glpm_matches?season_id=eq.{season_id}"
                "&home_score=not.is.null&away_score=not.is.null"
                "&select=home_team_sm_id,away_team_sm_id,home_score,away_score"
                "&limit=2000"
            ),
        )
        or []
    )
    stats: dict[int, dict[str, float]] = {}

    def bump(team: int) -> dict[str, float]:
        if team not in stats:
            stats[team] = {
                "mp": 0,
                "w": 0,
                "d": 0,
                "l": 0,
                "gf": 0,
                "ga": 0,
                "pts": 0,
            }
        return stats[team]

    for m in matches:
        home = int(m["home_team_sm_id"])
        away = int(m["away_team_sm_id"])
        hs = int(m["home_score"])
        aws = int(m["away_score"])
        h = bump(home)
        a = bump(away)
        h["mp"] += 1
        a["mp"] += 1
        h["gf"] += hs
        h["ga"] += aws
        a["gf"] += aws
        a["ga"] += hs
        if hs > aws:
            h["w"] += 1
            h["pts"] += 3
            a["l"] += 1
        elif hs < aws:
            a["w"] += 1
            a["pts"] += 3
            h["l"] += 1
        else:
            h["d"] += 1
            a["d"] += 1
            h["pts"] += 1
            a["pts"] += 1

    teams = rest(env, "GET", "glpm_teams?select=sm_id,name&limit=2000") or []
    name_by_id = {int(t["sm_id"]): str(t["name"]) for t in teams}

    rows = []
    for tid, s in stats.items():
        rows.append(
            {
                "team_sm_id": tid,
                "team": name_by_id.get(tid, f"Team {tid}"),
                "matches": int(s["mp"]),
                "wins": int(s["w"]),
                "draws": int(s["d"]),
                "loses": int(s["l"]),
                "goals": int(s["gf"]),
                "ga": int(s["ga"]),
                "points": int(s["pts"]),
                # Proxy xG fields so the same percentile pipeline applies.
                "xG": float(s["gf"]),
                "xGA": float(s["ga"]),
                "xPTS": float(s["pts"]),
            }
        )
    rows.sort(key=lambda r: (-r["points"], -(r["goals"] - r["ga"]), -r["goals"]))
    for i, r in enumerate(rows, start=1):
        r["number"] = i
    return rows


def import_season(cfg: dict[str, Any], env: dict[str, str], *, dry_run: bool) -> dict[str, Any]:
    season_id = int(cfg["season_sm_id"])
    min_matches = int(cfg.get("min_matches") or 10)
    table = build_table_from_matches(env, season_id)
    if not table:
        return {"key": cfg["key"], "skipped": True, "reason": "no finished matches"}

    max_mp = max(r["matches"] for r in table)
    if max_mp < min_matches:
        return {
            "key": cfg["key"],
            "skipped": True,
            "reason": f"only {max_mp} matches (min {min_matches})",
        }

    attack = percentile_scores([r["xG"] for r in table], higher_is_better=True)
    defence = percentile_scores([r["xGA"] for r in table], higher_is_better=False)
    # No true xG - use goal difference as finishing / conversion proxy.
    finishing = percentile_scores(
        [r["goals"] - r["ga"] for r in table], higher_is_better=True
    )

    existing = (
        rest(
            env,
            "GET",
            (
                f"glpm_team_rating_vectors?season_id=eq.{season_id}"
                "&select=team_sm_id,as_of_date,r_goalkeeper,r_build_up,r_possession,r_pressing,metadata"
                "&order=as_of_date.desc"
            ),
        )
        or []
    )
    existing_by_id: dict[int, dict[str, Any]] = {}
    latest_as_of = str(cfg["as_of_date"])
    for x in existing:
        tid = int(x["team_sm_id"])
        if tid not in existing_by_id:
            existing_by_id[tid] = x
        as_of = str(x.get("as_of_date") or "")
        if as_of > latest_as_of:
            latest_as_of = as_of
    as_of_date = latest_as_of

    now = datetime.now(timezone.utc).isoformat()
    upserts = []
    preview = []
    for i, r in enumerate(table):
        r_attack = attack[i]
        r_defence = defence[i]
        r_finishing = finishing[i]
        quality = round((r_attack + r_defence + r_finishing) / 3.0, 2)
        prev = existing_by_id.get(int(r["team_sm_id"]), {})
        r_gk = float(prev.get("r_goalkeeper") or 60.0)
        r_bu = float(prev.get("r_build_up") or 60.0)
        r_po = float(prev.get("r_possession") or 60.0)
        r_pr = float(prev.get("r_pressing") or 60.0)
        if r_gk == 50.0:
            r_gk = 60.0
        if r_bu == 50.0:
            r_bu = 60.0
        if r_po == 50.0:
            r_po = 60.0
        if r_pr == 50.0:
            r_pr = 60.0
        prev_meta = prev.get("metadata") if isinstance(prev.get("metadata"), dict) else {}
        meta = {
            **prev_meta,
            "source": "standings_goals_season_import",
            "season_label": cfg["label"],
            "imported_at": now,
            "standings": {
                "league_rank": r["number"],
                "points": r["points"],
                "goals_for": r["goals"],
                "goals_against": r["ga"],
                "matches": r["matches"],
            },
            "derived": {
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_finishing": r_finishing,
                "quality_overall": quality,
                "method": "season_goals_percentile_within_league",
                "note": "GF/GA proxy - Understat unavailable for this league",
            },
        }
        upserts.append(
            {
                "team_sm_id": r["team_sm_id"],
                "season_id": season_id,
                "as_of_date": as_of_date,
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_goalkeeper": r_gk,
                "r_build_up": r_bu,
                "r_possession": r_po,
                "r_pressing": r_pr,
                "r_finishing": r_finishing,
                "metadata": meta,
                "model_version": MODEL_VERSION,
                "updated_at": now,
            }
        )
        preview.append(
            {
                "rank": 0,
                "team": r["team"],
                "quality_overall": quality,
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_finishing": r_finishing,
                "points": r["points"],
            }
        )

    preview.sort(key=lambda x: -x["quality_overall"])
    for i, p in enumerate(preview, start=1):
        p["rank"] = i

    data_dir: Path = cfg["data_dir"]
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "key": cfg["key"],
        "season_sm_id": season_id,
        "competition_sm_id": cfg["competition_sm_id"],
        "as_of_date": as_of_date,
        "model_version": MODEL_VERSION,
        "teams_imported": len(upserts),
        "max_matches": max_mp,
        "leaderboard_preview": preview,
        "dry_run": dry_run,
    }
    (data_dir / "import-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    (data_dir / "league-table.json").write_text(
        json.dumps(table, indent=2), encoding="utf-8"
    )

    print(f"\n=== {cfg['label']} season {season_id} (GF/GA overlay) ===")
    for row in preview[:5]:
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    env = load_env()
    for required in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not env.get(required):
            raise SystemExit(f"Missing {required}")

    configs = SEASONS
    if args.season_id is not None:
        configs = [c for c in SEASONS if c["season_sm_id"] == args.season_id]
        if not configs:
            raise SystemExit(f"No config for season-id {args.season_id}")
    elif not args.all:
        # Default: completed 2025/26 only.
        configs = [c for c in SEASONS if "2025" in c["key"]]

    failed = 0
    for cfg in configs:
        try:
            import_season(cfg, env, dry_run=args.dry_run)
        except Exception as exc:
            print(f"FAILED {cfg['key']}: {exc}")
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

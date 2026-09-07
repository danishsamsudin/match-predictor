#!/usr/bin/env python3
"""
Delete collapsed (non-discriminating) rating vectors for a season.

Use after an early-season league-run wrote identical Attack/Defence/… for every
club. Predict/hub will then fall back to the prior trained season.

  python3 scripts/glpm_purge_collapsed_vectors.py --season-id 28083
  python3 scripts/glpm_purge_collapsed_vectors.py --season-id 28083 --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _load_dotenv() -> None:
    for path in (REPO_ROOT / ".env.local", REPO_ROOT / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key and key not in __import__("os").environ:
                __import__("os").environ[key] = val


def main() -> int:
    parser = argparse.ArgumentParser(description="Purge collapsed GLPM rating vectors")
    parser.add_argument("--season-id", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Delete even if not collapsed")
    args = parser.parse_args()

    _load_dotenv()
    from core.io import get_supabase_client
    from models.ratings.discrimination import scores_discriminate

    client = get_supabase_client()
    rows = (
        client.table("glpm_team_rating_vectors")
        .select("team_sm_id,as_of_date,r_attack,r_defence,r_build_up,r_possession,r_pressing,r_finishing")
        .eq("season_id", args.season_id)
        .order("as_of_date", desc=True)
        .execute()
        .data
        or []
    )
    latest: dict[int, dict] = {}
    for row in rows:
        tid = int(row["team_sm_id"])
        if tid not in latest:
            latest[tid] = row

    attacks = [float(r["r_attack"]) for r in latest.values() if r.get("r_attack") is not None]
    collapsed = len(attacks) >= 2 and not scores_discriminate(attacks)
    if not collapsed and not args.force:
        print(
            json.dumps(
                {
                    "season_id": args.season_id,
                    "n_teams": len(latest),
                    "collapsed": False,
                    "action": "noop",
                },
                indent=2,
            )
        )
        return 0

    if args.dry_run:
        print(
            json.dumps(
                {
                    "season_id": args.season_id,
                    "n_teams": len(latest),
                    "collapsed": collapsed,
                    "action": "would_delete",
                    "sample_attack": attacks[:5],
                },
                indent=2,
            )
        )
        return 0

    client.table("glpm_team_rating_vectors").delete().eq(
        "season_id", args.season_id
    ).execute()
    # Also clear collapsed domain / component / primary tables for this season
    for table in (
        "glpm_team_primary_ratings",
        "glpm_team_domain_ratings",
        "glpm_team_component_ratings",
    ):
        client.table(table).delete().eq("season_id", args.season_id).execute()

    print(
        json.dumps(
            {
                "season_id": args.season_id,
                "n_teams": len(latest),
                "collapsed": collapsed,
                "action": "deleted",
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

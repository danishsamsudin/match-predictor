#!/usr/bin/env python3
"""
Assemble GLPM Rating Vectors from primary rating tables (Chapter 10.14).

Usage (from repo root):
  python3 scripts/glpm_assemble_rating_vectors.py --season-id 12345
  python3 scripts/glpm_assemble_rating_vectors.py --season-id 12345 --as-of 2025-12-01
  python3 scripts/glpm_assemble_rating_vectors.py --season-id 12345 --team-id 10 --dry-run
  python3 scripts/glpm_assemble_rating_vectors.py --synthetic
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

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


def build_synthetic_frames():
    """Minimal long-form primaries + player GK for smoke tests."""
    as_of = "2025-11-15"
    team_rows = []
    for team in (1, 2):
        for i, rtype in enumerate(
            ("attack", "defence", "build_up", "possession", "pressing", "finishing")
        ):
            team_rows.append(
                {
                    "team_sm_id": team,
                    "season_id": 99,
                    "rating_type": rtype,
                    "as_of_date": as_of,
                    "rating": 70.0 + team + i,
                    "confidence": 0.7,
                    "variance": 16.0,
                    "matches_used": 10,
                    "recent_trend": "flat",
                    "trend_delta": 0.0,
                    "historical_peak": 80.0,
                    "historical_low": 60.0,
                    "model_version": "synth_v1",
                }
            )
    player_gk = pd.DataFrame(
        [
            {
                "player_sm_id": 100,
                "team_sm_id": 1,
                "season_id": 99,
                "rating_type": "goalkeeper",
                "as_of_date": as_of,
                "rating": 82.0,
                "confidence": 0.8,
                "variance": 9.0,
                "model_version": "gk_v1",
            },
            {
                "player_sm_id": 101,
                "team_sm_id": 1,
                "season_id": 99,
                "rating_type": "goalkeeper",
                "as_of_date": as_of,
                "rating": 70.0,
                "confidence": 0.5,
                "variance": 25.0,
                "model_version": "gk_v1",
            },
            {
                "player_sm_id": 200,
                "team_sm_id": 2,
                "season_id": 99,
                "rating_type": "goalkeeper",
                "as_of_date": as_of,
                "rating": 75.0,
                "confidence": 0.6,
                "variance": 12.0,
                "model_version": "gk_v1",
            },
        ]
    )
    minutes = pd.DataFrame(
        [
            {"player_sm_id": 100, "team_sm_id": 1, "season_id": 99, "minutes_played": 2700},
            {"player_sm_id": 101, "team_sm_id": 1, "season_id": 99, "minutes_played": 300},
            {"player_sm_id": 200, "team_sm_id": 2, "season_id": 99, "minutes_played": 3000},
        ]
    )
    history = pd.DataFrame(
        [
            {
                "team_sm_id": 1,
                "season_id": 99,
                "as_of_date": "2025-10-01",
                "layer": "primary",
                "name": "attack",
                "rating": 68.0,
                "confidence": 0.5,
                "variance": 20.0,
            },
            {
                "team_sm_id": 1,
                "season_id": 99,
                "as_of_date": as_of,
                "layer": "primary",
                "name": "attack",
                "rating": 72.0,
                "confidence": 0.7,
                "variance": 16.0,
            },
        ]
    )
    return pd.DataFrame(team_rows), player_gk, minutes, history, as_of


def main() -> int:
    parser = argparse.ArgumentParser(description="Assemble GLPM Rating Vectors")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--as-of", type=str, default=None, help="YYYY-MM-DD")
    parser.add_argument("--team-id", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--synthetic", action="store_true")
    args = parser.parse_args()

    from core.vector_assembly import assemble_season_vectors
    from core.io import upsert_rating_vectors

    if args.synthetic:
        team_primaries, player_gk, minutes, history, as_of = build_synthetic_frames()
        vectors = assemble_season_vectors(
            99,
            as_of_date=as_of,
            team_primaries=team_primaries,
            player_gk=player_gk,
            gk_minutes=minutes,
            history=history,
        )
        summary = {
            "mode": "synthetic",
            "n_vectors": len(vectors),
            "sample": {
                "team_sm_id": vectors[0].team_sm_id,
                "R": vectors[0].to_array().tolist(),
                "complete": vectors[0].is_complete(),
            },
        }
        print(json.dumps(summary, indent=2))
        # Sanity: team 1 GK should be minutes-weighted ~80.8
        gk = vectors[0].get("goalkeeper")
        expected = (82.0 * 2700 + 70.0 * 300) / 3000
        assert abs(gk - expected) < 0.05, (gk, expected)
        assert vectors[0].is_complete()
        print("synthetic assemble OK")
        return 0

    _load_dotenv()
    if args.season_id is None:
        parser.error("--season-id is required unless --synthetic")

    from core.io import get_supabase_client

    client = get_supabase_client()
    team_ids = [args.team_id] if args.team_id else None
    vectors = assemble_season_vectors(
        args.season_id,
        as_of_date=args.as_of,
        client=client,
        team_ids=team_ids,
    )
    counts = upsert_rating_vectors(client, vectors, dry_run=args.dry_run)
    print(
        json.dumps(
            {
                "season_id": args.season_id,
                "as_of": args.as_of,
                "n_vectors": len(vectors),
                "complete": sum(1 for v in vectors if v.is_complete()),
                "upsert": counts,
                "dry_run": args.dry_run,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

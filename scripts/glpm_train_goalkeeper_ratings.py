#!/usr/bin/env python3
"""
Train / estimate GLPM hierarchical Goalkeeper Ratings (Chapter 5).

Usage (from repo root):
  python3 scripts/glpm_train_goalkeeper_ratings.py --season-id 12345
  python3 scripts/glpm_train_goalkeeper_ratings.py --season-id 12345 --dry-run
  python3 scripts/glpm_train_goalkeeper_ratings.py --synthetic
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
    env_local = REPO_ROOT / ".env.local"
    env_file = REPO_ROOT / ".env"
    for path in (env_local, env_file):
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


def build_synthetic_frame(n_keepers: int = 6, matches_per_gk: int = 8):
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(42)
    rows = []
    match_id = 1
    for round_i in range(matches_per_gk):
        for gk in range(1, n_keepers + 1):
            team = gk
            opp = ((gk) % n_keepers) + 1
            date = f"2025-08-{1 + round_i:02d}"
            skill = 0.5 + 0.1 * gk
            psxg = float(rng.uniform(0.8, 2.5))
            # Better keepers concede fewer relative to PSxG
            gc = max(0, int(rng.poisson(max(0.1, psxg * (1.2 - 0.08 * gk)))))
            saves = int(rng.integers(2, 8) + skill)
            sot = saves + gc
            pens_faced = int(rng.integers(0, 2))
            pens_saved = int(rng.integers(0, pens_faced + 1)) if pens_faced else 0
            rows.append(
                {
                    "match_sm_id": match_id,
                    "player_sm_id": 1000 + gk,
                    "team_sm_id": team,
                    "opponent_team_sm_id": opp,
                    "is_home": gk % 2 == 0,
                    "match_date": date,
                    "season_id": 1,
                    "minutes_played": 90,
                    "is_goalkeeper": True,
                    "psxg_faced": psxg,
                    "goals_conceded": gc,
                    "gk_saves": saves,
                    "sot_faced": sot,
                    "shots_faced": sot + int(rng.integers(2, 8)),
                    "crosses_faced": int(rng.integers(5, 20)),
                    "claims_attempted": int(rng.integers(1, 6)),
                    "claims_successful": int(rng.integers(0, 5)),
                    "punches": int(rng.integers(0, 3)),
                    "aerial_duels_won": int(rng.integers(0, 4)),
                    "passes": int(rng.integers(15, 40)),
                    "passes_completed": int(rng.integers(10, 35)),
                    "long_passes": int(rng.integers(5, 15)),
                    "long_passes_completed": int(rng.integers(2, 12)),
                    "progressive_passes": int(rng.integers(1, 8)),
                    "progressive_pass_distance": float(rng.uniform(20, 120)),
                    "passes_under_pressure": int(rng.integers(2, 10)),
                    "passes_under_pressure_completed": int(rng.integers(1, 8)),
                    "def_actions_outside_box": int(rng.integers(0, 5)),
                    "sweeper_clearances": int(rng.integers(0, 3)),
                    "through_ball_interceptions": int(rng.integers(0, 3)),
                    "recoveries_outside_box": int(rng.integers(0, 4)),
                    "avg_defensive_action_x": float(rng.uniform(10, 35)),
                    "penalties_faced": pens_faced,
                    "penalties_saved": pens_saved,
                    "penalty_psxg_faced": pens_faced * 0.76 if pens_faced else 0.0,
                    "defence_rating": 45.0 + 5.0 * (gk % 3),
                    "xg_conceded": float(rng.uniform(0.6, 2.0)),
                    "payload": {},
                }
            )
            match_id += 1
    return pd.DataFrame(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train GLPM Goalkeeper Ratings")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Run pipeline on synthetic data (no Supabase)",
    )
    parser.add_argument("--no-artifacts", action="store_true")
    args = parser.parse_args()

    from models.ratings.goalkeeper.pipeline import GoalkeeperRatingPipeline

    pipeline = GoalkeeperRatingPipeline()

    if args.synthetic:
        frame = build_synthetic_frame()
        result = pipeline.run_from_frames(
            frame, persist_artifacts=not args.no_artifacts
        )
        summary = result.player_summary[
            ["player_sm_id", "rating_goalkeeper", "rating_domain_goal_prevention"]
        ].sort_values("rating_goalkeeper", ascending=False)
        print(summary.to_string(index=False))
        print(
            json.dumps(
                {
                    "keepers": len(result.player_summary),
                    "matches": int(result.match_frame["match_sm_id"].nunique()),
                    "model_version": result.model_version,
                },
                indent=2,
            )
        )
        return 0

    _load_dotenv()
    from models.ratings.goalkeeper.io import get_supabase_client

    client = get_supabase_client()
    result = pipeline.run_from_supabase(
        client,
        season_id=args.season_id,
        dry_run=args.dry_run,
        persist_artifacts=not args.no_artifacts,
    )
    print(
        json.dumps(
            {
                "keepers": len(result.player_summary),
                "match_rows": len(result.match_frame),
                "model_version": result.model_version,
                "dry_run": args.dry_run,
                "top": result.player_summary.sort_values(
                    "rating_goalkeeper", ascending=False
                )
                .head(5)[["player_sm_id", "rating_goalkeeper"]]
                .to_dict(orient="records"),
            },
            indent=2,
            default=str,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

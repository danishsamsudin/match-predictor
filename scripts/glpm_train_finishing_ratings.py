#!/usr/bin/env python3
"""
Train / estimate GLPM hierarchical Finishing Ratings (Chapter 9).

Usage (from repo root):
  python3 scripts/glpm_train_finishing_ratings.py --season-id 12345
  python3 scripts/glpm_train_finishing_ratings.py --season-id 12345 --dry-run
  python3 scripts/glpm_train_finishing_ratings.py --synthetic   # smoke without Supabase
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


def build_synthetic_frame(n_teams: int = 6, matches_per_team: int = 8):
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(42)
    rows = []
    match_id = 1
    for round_i in range(matches_per_team):
        teams = list(range(1, n_teams + 1))
        rng.shuffle(teams)
        for i in range(0, n_teams, 2):
            home, away = teams[i], teams[i + 1]
            date = f"2025-08-{1 + round_i:02d}"
            for team, opp, is_home in ((home, away, True), (away, home, False)):
                finish = 0.6 + 0.1 * team
                shots = int(rng.integers(8, 18))
                xg = float(rng.uniform(0.8, 2.0))
                # Stronger finishers overperform xG
                goals = max(0, int(round(xg + rng.normal(0.3 * (finish - 1.0), 0.4))))
                sot = max(goals, int(shots * rng.uniform(0.3, 0.55)))
                big = max(1, shots // 5)
                rows.append(
                    {
                        "match_sm_id": match_id,
                        "team_sm_id": team,
                        "opponent_team_sm_id": opp,
                        "is_home": is_home,
                        "match_date": date,
                        "season_id": 1,
                        "duration_minutes": 90,
                        "goals": goals,
                        "shots": shots,
                        "shots_on_target": sot,
                        "xg": xg,
                        "npxg": xg * 0.9,
                        "big_chances": big,
                        "big_chances_missed": max(0, big - min(goals, big)),
                        "xg_conceded": float(rng.uniform(0.5, 2.0)),
                        "goals_prevented": float(rng.uniform(-0.5, 0.8)),
                        "opp_xg_conceded": float(rng.uniform(0.5, 2.0)),
                        "opp_goals_prevented": float(rng.uniform(-0.5, 0.8)),
                        "defence_rating": float(40 + 5 * opp),
                        "goalkeeper_rating": float(45 + 4 * opp),
                    }
                )
            match_id += 1
    return pd.DataFrame(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train GLPM Finishing Ratings")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Run pipeline on synthetic data (no Supabase)",
    )
    parser.add_argument("--no-artifacts", action="store_true")
    args = parser.parse_args()

    from models.ratings.finishing.pipeline import FinishingRatingPipeline

    pipeline = FinishingRatingPipeline()

    if args.synthetic:
        frame = build_synthetic_frame()
        result = pipeline.run_from_frames(
            frame, persist_artifacts=not args.no_artifacts
        )
        summary = result.team_summary[
            ["team_sm_id", "rating_finishing", "rating_domain_chance_conversion"]
        ].sort_values("rating_finishing", ascending=False)
        print(summary.to_string(index=False))
        print(
            json.dumps(
                {
                    "teams": len(result.team_summary),
                    "matches": int(result.match_frame["match_sm_id"].nunique()),
                    "model_version": result.model_version,
                },
                indent=2,
            )
        )
        return 0

    _load_dotenv()
    from models.ratings.finishing.io import get_supabase_client

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
                "teams": len(result.team_summary),
                "match_rows": len(result.match_frame),
                "model_version": result.model_version,
                "dry_run": args.dry_run,
                "top": result.team_summary.sort_values("rating_finishing", ascending=False)
                .head(5)[["team_sm_id", "rating_finishing"]]
                .to_dict(orient="records"),
            },
            indent=2,
            default=str,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

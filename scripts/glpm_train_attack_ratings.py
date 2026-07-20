#!/usr/bin/env python3
"""
Train / estimate GLPM hierarchical Attack Ratings (Chapter 3).

Usage (from repo root):
  python3 scripts/glpm_train_attack_ratings.py --season-id 12345
  python3 scripts/glpm_train_attack_ratings.py --season-id 12345 --dry-run
  python3 scripts/glpm_train_attack_ratings.py --synthetic   # smoke without Supabase
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
                strength = 0.7 + 0.1 * team
                shots = int(rng.integers(8, 20) * strength)
                xg = float(rng.uniform(0.6, 2.2) * strength / 1.2)
                rows.append(
                    {
                        "match_sm_id": match_id,
                        "team_sm_id": team,
                        "opponent_team_sm_id": opp,
                        "is_home": is_home,
                        "match_date": date,
                        "season_id": 1,
                        "duration_minutes": 90,
                        "shots": shots,
                        "xg": xg,
                        "npxg": xg * 0.9,
                        "open_play_xg": xg * 0.75,
                        "set_piece_xg": xg * 0.2,
                        "big_chances": max(1, shots // 5),
                        "box_entries": shots + int(rng.integers(5, 15)),
                        "touches_in_box": shots + int(rng.integers(3, 12)),
                        "progressive_passes": int(rng.integers(20, 60)),
                        "progressive_carries": int(rng.integers(10, 40)),
                        "final_third_entries": int(rng.integers(20, 50)),
                        "passes": int(rng.integers(300, 600)),
                        "possession_pct": float(rng.uniform(35, 65)),
                        "field_tilt": float(rng.uniform(30, 70)),
                        "territory_pct": float(rng.uniform(40, 60)),
                        "ball_recoveries": int(rng.integers(30, 70)),
                        "xg_conceded": float(rng.uniform(0.5, 2.0)),
                        "shots_conceded": int(rng.integers(5, 18)),
                        "box_entries_allowed": int(rng.integers(10, 30)),
                        "opp_xg_conceded": float(rng.uniform(0.5, 2.0)),
                    }
                )
            match_id += 1
    return pd.DataFrame(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train GLPM Attack Ratings")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Run pipeline on synthetic data (no Supabase)",
    )
    parser.add_argument("--no-artifacts", action="store_true")
    args = parser.parse_args()

    from models.ratings.attack.pipeline import AttackRatingPipeline

    pipeline = AttackRatingPipeline()

    if args.synthetic:
        frame = build_synthetic_frame()
        result = pipeline.run_from_frames(
            frame, persist_artifacts=not args.no_artifacts
        )
        summary = result.team_summary[
            ["team_sm_id", "rating_attack", "rating_domain_creation"]
        ].sort_values("rating_attack", ascending=False)
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
    from models.ratings.attack.io import get_supabase_client

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
                "top": result.team_summary.sort_values("rating_attack", ascending=False)
                .head(5)[["team_sm_id", "rating_attack"]]
                .to_dict(orient="records"),
            },
            indent=2,
            default=str,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

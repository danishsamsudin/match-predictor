#!/usr/bin/env python3
"""
Run GLPM Match Prediction Models (Chapter 12) from Home / Away xG.

Usage (from repo root):
  python3 scripts/glpm_predict_match.py --home-xg 1.6 --away-xg 1.1
  python3 scripts/glpm_predict_match.py --home-xg 1.6 --away-xg 1.1 --dry-run
  python3 scripts/glpm_predict_match.py --home-xg 1.6 --away-xg 1.1 \\
      --match-id 100 --home-team-id 1 --away-team-id 2 --season-id 99
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
    parser = argparse.ArgumentParser(
        description="GLPM Dixon–Coles match predictions from expected goals"
    )
    parser.add_argument("--home-xg", type=float, required=True, help="Home expected goals")
    parser.add_argument("--away-xg", type=float, required=True, help="Away expected goals")
    parser.add_argument(
        "--rho",
        type=float,
        default=None,
        help="Dixon–Coles ρ (default: engine PredictionConfig rho)",
    )
    parser.add_argument("--match-id", type=int, default=None, help="glpm_matches.sm_id")
    parser.add_argument("--home-team-id", type=int, default=None, help="Home team sm_id")
    parser.add_argument("--away-team-id", type=int, default=None, help="Away team sm_id")
    parser.add_argument("--season-id", type=int, default=None, help="Season sm_id")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and print prediction without writing to Supabase",
    )
    args = parser.parse_args()

    from engine.predictions import PredictionConfig, predict_match

    cfg = PredictionConfig()
    if args.rho is not None:
        cfg = PredictionConfig(rho=args.rho)

    result = predict_match(args.home_xg, args.away_xg, config=cfg)
    row = result.to_upsert_row(
        match_sm_id=args.match_id,
        home_team_sm_id=args.home_team_id,
        away_team_sm_id=args.away_team_id,
        season_id=args.season_id,
    )

    summary = {
        "home_xg": result.home_xg,
        "away_xg": result.away_xg,
        "home_win": result.home_win,
        "draw": result.draw,
        "away_win": result.away_win,
        "btts_yes": result.btts_yes,
        "btts_no": result.btts_no,
        "over_under": result.over_under,
        "rho": result.rho,
        "model_version": result.model_version,
        "executed_at": result.executed_at,
        "score_matrix_shape": list(result.score_matrix.shape),
    }

    if args.dry_run:
        print(json.dumps({"dry_run": True, "prediction": summary}, indent=2))
        return 0

    _load_dotenv()
    from core.io import get_supabase_client, insert_prediction_history

    client = get_supabase_client()
    counts = insert_prediction_history(client, [row], dry_run=False)
    print(
        json.dumps(
            {"inserted": counts, "prediction": summary},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

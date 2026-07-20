#!/usr/bin/env python3
"""
End-to-end GLPM matchup: Rating Vectors → xG Engine → Dixon–Coles markets.

Usage (from repo root):
  python3 scripts/glpm_predict_from_vectors.py \\
      --home-team-id 33 --away-team-id 50 --season-id 23614
  python3 scripts/glpm_predict_from_vectors.py \\
      --home-team-id 33 --away-team-id 50 --dry-run
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
        description="GLPM end-to-end prediction from team rating vectors"
    )
    parser.add_argument("--home-team-id", type=int, required=True, help="Home team sm_id")
    parser.add_argument("--away-team-id", type=int, required=True, help="Away team sm_id")
    parser.add_argument("--season-id", type=int, default=None, help="Season sm_id filter")
    parser.add_argument("--match-id", type=int, default=None, help="glpm_matches.sm_id")
    parser.add_argument("--neutral", action="store_true", help="Neutral venue (no home boost)")
    parser.add_argument("--home-rest-days", type=float, default=7.0)
    parser.add_argument("--away-rest-days", type=float, default=7.0)
    parser.add_argument("--home-travel-km", type=float, default=0.0)
    parser.add_argument("--away-travel-km", type=float, default=0.0)
    parser.add_argument("--venue-altitude-m", type=float, default=None)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and print without writing to Supabase",
    )
    args = parser.parse_args()

    _load_dotenv()

    from core.io import get_supabase_client, insert_prediction_history, load_latest_rating_vector
    from engine import MatchContext, estimate_expected_goals, predict_match

    client = get_supabase_client()
    home = load_latest_rating_vector(
        client, team_sm_id=args.home_team_id, season_id=args.season_id
    )
    away = load_latest_rating_vector(
        client, team_sm_id=args.away_team_id, season_id=args.season_id
    )
    if home is None:
        print(
            json.dumps(
                {
                    "error": f"No rating vector for home team {args.home_team_id}"
                    + (f" season {args.season_id}" if args.season_id else "")
                }
            ),
            file=sys.stderr,
        )
        return 1
    if away is None:
        print(
            json.dumps(
                {
                    "error": f"No rating vector for away team {args.away_team_id}"
                    + (f" season {args.season_id}" if args.season_id else "")
                }
            ),
            file=sys.stderr,
        )
        return 1

    context = MatchContext(
        is_neutral_venue=bool(args.neutral),
        home_rest_days=float(args.home_rest_days),
        away_rest_days=float(args.away_rest_days),
        home_travel_km=float(args.home_travel_km),
        away_travel_km=float(args.away_travel_km),
        venue_altitude_m=args.venue_altitude_m,
    )
    xg = estimate_expected_goals(home, away, context)
    result = predict_match(xg)

    season_id = args.season_id
    if season_id is None:
        season_id = int(home.season_id) if home.season_id is not None else None

    row = result.to_upsert_row(
        match_sm_id=args.match_id,
        home_team_sm_id=args.home_team_id,
        away_team_sm_id=args.away_team_id,
        season_id=season_id,
    )

    summary = {
        "home_team_sm_id": args.home_team_id,
        "away_team_sm_id": args.away_team_id,
        "season_id": season_id,
        "home_as_of": home.as_of_date,
        "away_as_of": away.as_of_date,
        "home_xg": result.home_xg,
        "away_xg": result.away_xg,
        "home_win": result.home_win,
        "draw": result.draw,
        "away_win": result.away_win,
        "btts_yes": result.btts_yes,
        "btts_no": result.btts_no,
        "over_under": result.over_under,
        "interactions": xg.interactions,
        "context": xg.context,
        "xg_model_version": xg.model_version,
        "pred_model_version": result.model_version,
        "executed_at": result.executed_at,
    }

    if args.dry_run:
        print(json.dumps({"dry_run": True, "prediction": summary}, indent=2))
        return 0

    counts = insert_prediction_history(client, [row], dry_run=False)
    print(json.dumps({"inserted": counts, "prediction": summary}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Bayesian rolling update of GLPM Rating Vectors (Chapter 3.19 / 4.21.4).

Walks chronological as_of_dates per team, treating engine primaries as
observations and previous posteriors as priors with time decay.

Usage (from repo root):
  python3 scripts/glpm_bayesian_update_vectors.py --season-id 12345
  python3 scripts/glpm_bayesian_update_vectors.py --season-id 12345 --half-life 90 --dry-run
  python3 scripts/glpm_bayesian_update_vectors.py --synthetic
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


def build_synthetic_timeline() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Two observation dates for one team across all dimensions."""
    rows = []
    for as_of, base in (("2025-09-01", 60.0), ("2025-11-01", 75.0)):
        for rtype in (
            "attack",
            "defence",
            "build_up",
            "possession",
            "pressing",
            "finishing",
            "goalkeeper",
        ):
            rows.append(
                {
                    "team_sm_id": 1,
                    "season_id": 99,
                    "rating_type": rtype,
                    "as_of_date": as_of,
                    "rating": base,
                    "confidence": 0.8,
                    "variance": 16.0,
                    "matches_used": 1 if as_of.endswith("09-01") else 2,
                    "recent_trend": "flat",
                    "trend_delta": 0.0,
                    "historical_peak": base,
                    "historical_low": base,
                    "model_version": "synth_v1",
                }
            )
    return pd.DataFrame(rows), pd.DataFrame(), pd.DataFrame()


def run_bayesian_season(
    *,
    season_id: int,
    team_primaries: pd.DataFrame,
    player_gk: pd.DataFrame,
    gk_minutes: pd.DataFrame,
    history: pd.DataFrame | None = None,
    half_life_days: float = 90.0,
    team_ids: list[int] | None = None,
) -> list:
    from core.bayesian import initial_prior_vector, update_vector
    from core.vector_assembly import (
        assemble_rating_vector_from_frames,
        observation_dates_for_team,
    )

    if team_ids is None:
        ids = set()
        if not team_primaries.empty:
            ids |= {
                int(x)
                for x in team_primaries.loc[
                    team_primaries["season_id"].astype(int) == int(season_id), "team_sm_id"
                ]
            }
        if not player_gk.empty:
            ids |= {
                int(x)
                for x in player_gk.loc[
                    player_gk["season_id"].astype(int) == int(season_id), "team_sm_id"
                ].dropna()
            }
        team_ids = sorted(ids)

    posteriors = []
    for tid in team_ids:
        dates = observation_dates_for_team(
            team_primaries,
            team_sm_id=tid,
            season_id=season_id,
            player_gk=player_gk,
        )
        if not dates:
            continue
        state = initial_prior_vector(
            team_sm_id=tid,
            season_id=season_id,
            as_of_date=dates[0],
        )
        for d in dates:
            obs = assemble_rating_vector_from_frames(
                team_sm_id=tid,
                season_id=season_id,
                as_of_date=d,
                team_primaries=team_primaries,
                player_gk=player_gk,
                gk_minutes=gk_minutes,
                history=history,
            )
            state = update_vector(state, obs, half_life_days=half_life_days, as_of_date=d)
            posteriors.append(state)
    return posteriors


def main() -> int:
    parser = argparse.ArgumentParser(description="Bayesian update GLPM Rating Vectors")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--team-id", type=int, default=None)
    parser.add_argument("--half-life", type=float, default=90.0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--synthetic", action="store_true")
    args = parser.parse_args()

    from core.io import upsert_rating_vectors

    if args.synthetic:
        team_primaries, player_gk, minutes = build_synthetic_timeline()
        vectors = run_bayesian_season(
            season_id=99,
            team_primaries=team_primaries,
            player_gk=player_gk,
            gk_minutes=minutes,
            half_life_days=args.half_life,
        )
        first = vectors[0]
        last = vectors[-1]
        # Posterior after high observation should exceed prior mean 50 and move toward 75
        assert last.get("attack") > first.get("attack")
        assert 50.0 < last.get("attack") < 75.0 or last.get("attack") >= 60.0
        print(
            json.dumps(
                {
                    "mode": "synthetic",
                    "n_snapshots": len(vectors),
                    "first_attack": first.get("attack"),
                    "last_attack": last.get("attack"),
                    "last_matches": last.metadata["attack"].matches_used,
                    "last_var": last.metadata["attack"].variance,
                },
                indent=2,
            )
        )
        print("synthetic bayesian OK")
        return 0

    _load_dotenv()
    if args.season_id is None:
        parser.error("--season-id is required unless --synthetic")

    from core.io import (
        get_supabase_client,
        load_gk_minutes,
        load_player_gk_ratings,
        load_rating_history,
        load_team_primary_ratings,
    )

    client = get_supabase_client()
    team_primaries = load_team_primary_ratings(client, season_id=args.season_id)
    player_gk = load_player_gk_ratings(client, season_id=args.season_id)
    minutes = load_gk_minutes(client, season_id=args.season_id)
    history = load_rating_history(client, season_id=args.season_id)

    team_ids = [args.team_id] if args.team_id else None
    vectors = run_bayesian_season(
        season_id=args.season_id,
        team_primaries=team_primaries,
        player_gk=player_gk,
        gk_minutes=minutes,
        history=history,
        half_life_days=args.half_life,
        team_ids=team_ids,
    )
    # Persist latest per team only for primary overwrite + all snapshots as vectors
    counts = upsert_rating_vectors(client, vectors, dry_run=args.dry_run)
    print(
        json.dumps(
            {
                "season_id": args.season_id,
                "n_snapshots": len(vectors),
                "half_life_days": args.half_life,
                "upsert": counts,
                "dry_run": args.dry_run,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

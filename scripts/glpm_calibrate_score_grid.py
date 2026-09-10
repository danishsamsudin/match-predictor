#!/usr/bin/env python3
"""
Calibrate GLPM score-grid params {mu, rho, k} for a competition.

Uses prior full season + current season YTD with exponential time weighting.
Primary objective: exact-score log loss. Guardrail: 1X2 Brier.

Usage (from repo root):
  python3 scripts/glpm_calibrate_score_grid.py --competition-id 8
  python3 scripts/glpm_calibrate_score_grid.py --competition-id 8 --season-id 25583 --season-id 28083
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _load_dotenv() -> None:
    import os

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
            if key and key not in os.environ:
                os.environ[key] = val


def _finite(x: float) -> float | None:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return float(x)


def _resolve_season_ids(client, competition_id: int, explicit: list[int] | None) -> list[int]:
    if explicit:
        return explicit
    rows = (
        client.table("glpm_seasons")
        .select("sm_id,start_date,name")
        .eq("competition_id", competition_id)
        .order("start_date", desc=True)
        .limit(2)
        .execute()
    )
    data = rows.data or []
    if len(data) < 1:
        raise SystemExit(f"No seasons found for competition_id={competition_id}")
    # Newest two: current + prior
    return [int(r["sm_id"]) for r in data[:2]][::-1]  # chronological


def _competition_name(client, competition_id: int) -> str:
    res = (
        client.table("glpm_competitions")
        .select("name")
        .eq("sm_id", competition_id)
        .maybe_single()
        .execute()
    )
    row = res.data
    if isinstance(row, dict) and row.get("name"):
        return str(row["name"])
    return f"competition-{competition_id}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Calibrate GLPM score-grid {mu, rho, k} for a competition"
    )
    parser.add_argument("--competition-id", type=int, required=True)
    parser.add_argument(
        "--season-id",
        type=int,
        action="append",
        dest="season_ids",
        help="Explicit season sm_ids (default: newest two for the competition)",
    )
    parser.add_argument("--half-life-days", type=float, default=220.0)
    parser.add_argument("--min-matches", type=int, default=3)
    parser.add_argument(
        "--brier-guardrail",
        type=float,
        default=0.025,
        help="Max allowed 1X2 Brier regression vs locked baseline",
    )
    parser.add_argument(
        "--mode-11-penalty",
        type=float,
        default=0.12,
        help="Soft penalty on share of fixtures with 1-1 as mode",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print results without writing the calibration artifact",
    )
    args = parser.parse_args()

    _load_dotenv()
    from core.io import get_supabase_client
    from engine.score_grid_calibration import (
        build_fixture_cache_from_prediction_history,
        calibrate_score_grid,
        save_artifact,
    )

    client = get_supabase_client()
    season_ids = _resolve_season_ids(client, args.competition_id, args.season_ids)
    name = _competition_name(client, args.competition_id)

    print(
        json.dumps(
            {
                "competition_id": args.competition_id,
                "competition_name": name,
                "season_ids": season_ids,
                "half_life_days": args.half_life_days,
            },
            indent=2,
        )
    )
    print("Building fixture λ cache from prediction history…", flush=True)
    fixtures = build_fixture_cache_from_prediction_history(
        season_ids,
        client=client,
        half_life_days=args.half_life_days,
    )
    print(f"History fixtures: {len(fixtures)}", flush=True)

    from engine.score_grid_calibration import build_fixture_cache_from_team_goal_rates

    print("Adding Maher expanding-rate fixtures for sparse seasons…", flush=True)
    maher = build_fixture_cache_from_team_goal_rates(
        season_ids,
        client=client,
        half_life_days=args.half_life_days,
    )
    seen = {f.match_sm_id for f in fixtures}
    added = 0
    for fx in maher:
        if fx.match_sm_id not in seen:
            fixtures.append(fx)
            seen.add(fx.match_sm_id)
            added += 1
    print(f"Maher-added fixtures: {added}", flush=True)

    if len(fixtures) < 30:
        print(
            f"Cache still small ({len(fixtures)}); supplementing with PIT vectors…",
            flush=True,
        )
        from engine.score_grid_calibration import build_fixture_cache as build_pit

        pit = build_pit(
            season_ids,
            client=client,
            half_life_days=args.half_life_days,
            min_matches=args.min_matches,
        )
        for fx in pit:
            if fx.match_sm_id not in seen:
                fixtures.append(fx)
                seen.add(fx.match_sm_id)
    print(f"Cached fixtures: {len(fixtures)}", flush=True)
    if not fixtures:
        raise SystemExit("No fixtures available for calibration")

    artifact = calibrate_score_grid(
        fixtures,
        competition_id=args.competition_id,
        competition_name=name,
        season_ids=season_ids,
        half_life_days=args.half_life_days,
        brier_guardrail=args.brier_guardrail,
        mode_11_penalty=args.mode_11_penalty,
    )

    payload = artifact.to_dict()
    for section in ("baseline", "calibrated"):
        for k, v in list(payload[section].items()):
            if isinstance(v, float):
                payload[section][k] = _finite(v)

    print(json.dumps(payload, indent=2))
    if args.dry_run:
        print("dry-run — artifact not written")
        return 0

    path = save_artifact(artifact)
    print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

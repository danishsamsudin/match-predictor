#!/usr/bin/env python3
"""
Run GLPM Chapter 13 matchweek walk-forward validation / backtesting.

Usage (from repo root):
  python3 scripts/glpm_run_validation.py --season-id 12345 --dry-run
  python3 scripts/glpm_run_validation.py --season-id 12345 --season-id 67890
  python3 scripts/glpm_run_validation.py --season-id 12345 --min-matches 3
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


def _finite(x: float) -> float | None:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return float(x)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="GLPM matchweek walk-forward validation (Chapter 13)"
    )
    parser.add_argument(
        "--season-id",
        type=int,
        action="append",
        required=True,
        dest="season_ids",
        help="Season sm_id (repeatable for multiple domestic leagues)",
    )
    parser.add_argument(
        "--min-matches",
        type=int,
        default=3,
        help="Minimum prior matches_used on each team before scoring (default: 3)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute metrics without writing validation logs or prediction history",
    )
    args = parser.parse_args()

    _load_dotenv()
    from core.io import get_supabase_client
    from core.validation import build_validation_log_rows, run_matchweek_backtest

    client = None if args.dry_run else get_supabase_client()
    # Even in dry-run we need a client to load matches unless we only print — load always
    if client is None:
        client = get_supabase_client()

    reports = []
    for season_id in args.season_ids:
        report = run_matchweek_backtest(
            season_id,
            client=client,
            min_matches=args.min_matches,
            dry_run=args.dry_run,
            persist_predictions=not args.dry_run,
            persist_validation_logs=not args.dry_run,
        )
        summary = report.to_summary_dict()
        # JSON-safe floats
        for k, v in list(summary.items()):
            if isinstance(v, float):
                summary[k] = _finite(v)
        reports.append(
            {
                "season_id": season_id,
                "summary": summary,
                "n_validation_log_rows": len(build_validation_log_rows(report)),
                "matchweeks": len(report.matchweeks),
            }
        )

    print(json.dumps({"dry_run": args.dry_run, "reports": reports}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

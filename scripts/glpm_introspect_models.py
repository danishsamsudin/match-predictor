#!/usr/bin/env python3
"""
Extract GLPM model weights and diffs for league-run reporting.

Usage:
  python3 scripts/glpm_introspect_models.py --season-id 25583 \\
      --before data/reports/.glpm-artifact-snapshots/25583/before \\
      --output data/reports/.glpm-introspection-25583.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from models.ratings.introspection import build_introspection, save_introspection


def main() -> int:
    parser = argparse.ArgumentParser(description="GLPM model introspection")
    parser.add_argument("--season-id", type=int, required=True)
    parser.add_argument(
        "--current-root",
        type=Path,
        default=REPO_ROOT / "models/ratings",
        help="Root containing engine artifact dirs",
    )
    parser.add_argument(
        "--before",
        type=Path,
        default=None,
        help="Snapshot of artifacts before this training run",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    before = args.before if args.before and args.before.exists() else None
    result = build_introspection(
        season_id=args.season_id,
        current_root=args.current_root,
        before_root=before,
    )
    save_introspection(result, args.output)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "total_variables": result.summary.get("total_variables"),
                "changed_count": result.summary.get("changed_count"),
                "is_first_run": result.is_first_run,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

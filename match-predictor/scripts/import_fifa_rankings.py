#!/usr/bin/env python3
"""
Import FIFA men's world ranking history into Supabase.

Sources:
  - Kaggle (1992–2024): lucasyukioimafuko/fifa-mens-world-ranking
  - Sofascore saved HTML (2026): data/imports/fbref/world-cup/FIFA Football Rankings 2026 - Sofascore.html

Usage (from match-predictor/):
  pip install kagglehub supabase python-dotenv
  source .env.local
  python scripts/import_fifa_rankings.py

  # Kaggle CSV only:
  python scripts/import_fifa_rankings.py --skip-sofascore

  # Sofascore 2026 only:
  python scripts/import_fifa_rankings.py --skip-kaggle --sofascore-html path/to/file.html
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("fifa_rankings_import")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV_CACHE = ROOT / "data" / "imports" / "fifa" / "fifa_mens_rank.csv"
DEFAULT_SOFASCORE_HTML = (
    ROOT
    / "data"
    / "imports"
    / "fbref"
    / "world-cup"
    / "FIFA Football Rankings 2026 - Sofascore.html"
)
MAX_KAGGLE_YEAR = 2024

FIFA_DATASET_ALIASES: dict[str, str] = {
    "usa": "usa",
    "united states": "usa",
    "korea republic": "south korea",
    "republic of korea": "south korea",
    "ir iran": "iran",
    "iran": "iran",
    "cape verde islands": "cabo verde",
    "cape verde": "cabo verde",
    "cabo verde": "cabo verde",
    "bosnia and herzegovina": "bosnia & herzegovina",
    "curacao": "curaçao",
    "turkey": "türkiye",
    "côte d'ivoire": "côte d'ivoire",
    "cote d'ivoire": "côte d'ivoire",
    "ivory coast": "côte d'ivoire",
    "congo dr": "dr congo",
    "democratic republic of the congo": "dr congo",
    "dr congo": "dr congo",
}


def _norm_key(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def normalize_fifa_team_name(name: str) -> str:
    key = _norm_key(name)
    if key in FIFA_DATASET_ALIASES:
        return FIFA_DATASET_ALIASES[key]
    return key


def _parse_float(value: str) -> Optional[float]:
    if value is None:
        return None
    raw = str(value).strip().replace(",", "")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_int(value: str) -> Optional[int]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return int(float(raw))
    except ValueError:
        return None


def resolve_csv_path(csv_arg: Optional[str]) -> Path:
    if csv_arg:
        path = Path(csv_arg).expanduser()
        if not path.is_file():
            raise FileNotFoundError(f"CSV not found: {path}")
        return path

    if DEFAULT_CSV_CACHE.is_file():
        logger.info("Using cached CSV at %s", DEFAULT_CSV_CACHE)
        return DEFAULT_CSV_CACHE

    try:
        import kagglehub
    except ImportError as exc:
        raise RuntimeError(
            "Install kagglehub: pip install kagglehub"
        ) from exc

    logger.info("Downloading dataset via kagglehub...")
    cache_path = Path(
        kagglehub.dataset_download("lucasyukioimafuko/fifa-mens-world-ranking")
    )
    matches = list(cache_path.rglob("fifa_mens_rank.csv"))
    if not matches:
        raise FileNotFoundError(f"No fifa_mens_rank.csv under {cache_path}")
    source = matches[0]
    DEFAULT_CSV_CACHE.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_CSV_CACHE.write_bytes(source.read_bytes())
    logger.info("Cached CSV to %s", DEFAULT_CSV_CACHE)
    return DEFAULT_CSV_CACHE


def load_rows(csv_path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            year = _parse_int(raw.get("date", ""))
            semester = _parse_int(raw.get("semester", ""))
            rank = _parse_int(raw.get("rank", ""))
            team = (raw.get("team") or "").strip()
            points = _parse_float(raw.get("total.points", ""))
            if year is None or semester is None or rank is None or not team or points is None:
                continue
            if year > MAX_KAGGLE_YEAR:
                continue
            if semester not in (1, 2):
                continue
            rows.append(
                {
                    "ranking_year": year,
                    "semester": semester,
                    "rank": rank,
                    "team_name": team,
                    "acronym": (raw.get("acronym") or "").strip() or None,
                    "total_points": round(points, 2),
                    "previous_points": _parse_float(raw.get("previous.points", "")),
                    "points_diff": _parse_float(raw.get("diff.points", "")),
                    "normalized_team_name": normalize_fifa_team_name(team),
                    "data_source": "kaggle",
                    "sofascore_team_id": None,
                }
            )
    return rows


def _semester_from_timestamp(ts: int) -> int:
    month = datetime.fromtimestamp(ts, tz=timezone.utc).month
    return 1 if month <= 6 else 2


def _year_from_timestamp(ts: int) -> int:
    return datetime.fromtimestamp(ts, tz=timezone.utc).year


def load_sofascore_rows(html_path: Path) -> list[dict[str, Any]]:
    html = html_path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise RuntimeError(f"No __NEXT_DATA__ in {html_path}")

    data = json.loads(match.group(1))
    raw_rows = (
        data.get("props", {})
        .get("pageProps", {})
        .get("initialProps", {})
        .get("initialRankingsData", {})
        .get("rankingRows", [])
    )
    if not raw_rows:
        raise RuntimeError(f"No rankingRows in {html_path}")

    sample_ts = next(
        (r.get("updatedAtTimestamp") for r in raw_rows if r.get("updatedAtTimestamp")),
        None,
    )
    if sample_ts is None:
        raise RuntimeError("No updatedAtTimestamp in Sofascore ranking rows")

    ranking_year = _year_from_timestamp(int(sample_ts))
    semester = _semester_from_timestamp(int(sample_ts))

    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        team_name = (raw.get("name") or raw.get("team", {}).get("name") or "").strip()
        rank = raw.get("position")
        points = raw.get("points")
        if not team_name or rank is None or points is None:
            continue

        prev = raw.get("previousPoints")
        diff = round(float(points) - float(prev), 2) if prev is not None else None
        team = raw.get("team") or {}

        rows.append(
            {
                "ranking_year": ranking_year,
                "semester": semester,
                "rank": int(rank),
                "team_name": team_name,
                "acronym": team.get("nameCode"),
                "total_points": round(float(points), 2),
                "previous_points": round(float(prev), 2) if prev is not None else None,
                "points_diff": diff,
                "normalized_team_name": normalize_fifa_team_name(team_name),
                "data_source": "fifa",
                "sofascore_team_id": team.get("id"),
            }
        )

    return rows


def dedupe_snapshot_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One row per (year, semester, team). Kaggle CSV has rare exact duplicates."""
    by_key: dict[tuple[int, int, str], dict[str, Any]] = {}
    for row in rows:
        key = (row["ranking_year"], row["semester"], row["normalized_team_name"])
        existing = by_key.get(key)
        if existing is None or row["total_points"] >= existing["total_points"]:
            by_key[key] = row
    deduped = list(by_key.values())
    if len(deduped) < len(rows):
        logger.info("Deduped %s duplicate team-snapshot rows", len(rows) - len(deduped))
    return deduped


def create_supabase_client():
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env.local")
        load_dotenv(ROOT / ".env")
    except ImportError:
        pass

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")

    from supabase import create_client

    return create_client(url, key)


def upsert_rows(client: Any, rows: list[dict[str, Any]], *, dry_run: bool) -> None:
    if dry_run:
        years = sorted({r["ranking_year"] for r in rows})
        logger.info("Dry run: %s rows, years %s–%s", len(rows), years[0], years[-1])
        best_year = max(years)
        best_sem = max(r["semester"] for r in rows if r["ranking_year"] == best_year)
        latest = [
            r
            for r in rows
            if r["ranking_year"] == best_year and r["semester"] == best_sem
        ]
        latest.sort(key=lambda r: r["rank"])
        for r in latest[:5]:
            logger.info(
                "  #%s %s %.2f (%s)",
                r["rank"],
                r["team_name"],
                r["total_points"],
                r.get("data_source", "?"),
            )
        return

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        client.table("fifa_ranking_snapshots").upsert(
            chunk,
            on_conflict="ranking_year,semester,normalized_team_name",
        ).execute()
        logger.info("Upserted %s / %s", min(i + batch_size, len(rows)), len(rows))


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Import FIFA men's rankings into Supabase")
    parser.add_argument("--csv", help="Path to fifa_mens_rank.csv (skips kagglehub)")
    parser.add_argument(
        "--sofascore-html",
        help="Sofascore saved FIFA rankings HTML (default: world-cup folder)",
    )
    parser.add_argument("--skip-kaggle", action="store_true")
    parser.add_argument("--skip-sofascore", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    rows: list[dict[str, Any]] = []

    if not args.skip_kaggle:
        csv_path = resolve_csv_path(args.csv)
        kaggle_rows = load_rows(csv_path)
        logger.info(
            "Kaggle: %s rows from %s (year <= %s)",
            len(kaggle_rows),
            csv_path,
            MAX_KAGGLE_YEAR,
        )
        rows.extend(kaggle_rows)

    if not args.skip_sofascore:
        sofa_path = Path(args.sofascore_html).expanduser() if args.sofascore_html else DEFAULT_SOFASCORE_HTML
        if not sofa_path.is_file():
            logger.error("Sofascore HTML not found: %s", sofa_path)
            return 1
        sofa_rows = load_sofascore_rows(sofa_path)
        logger.info("Sofascore: %s rows from %s", len(sofa_rows), sofa_path)
        rows.extend(sofa_rows)

    if not rows:
        logger.error("No ranking rows to import")
        return 1

    rows = dedupe_snapshot_rows(rows)

    if args.dry_run:
        upsert_rows(None, rows, dry_run=True)
        return 0

    client = create_supabase_client()
    upsert_rows(client, rows, dry_run=False)
    logger.info("Done. Imported %s total rows.", len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())

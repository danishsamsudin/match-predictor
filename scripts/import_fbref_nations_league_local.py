#!/usr/bin/env python3
"""
Import saved FBref HTML under data/imports/fbref/nations-league/ into Supabase.

Mirrors import_fbref_world_cup_local.py with the 54 Nations League 2026/27 nations
and Sofascore id map expansions.

Usage (from match-predictor/):
  pip install -r scripts/requirements-fbref-scraper.txt
  python scripts/import_fbref_nations_league_local.py
  python scripts/import_fbref_nations_league_local.py --dry-run
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

scripts_dir = Path(__file__).resolve().parent
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

import import_fbref_world_cup_local as wc  # noqa: E402

logger = logging.getLogger("fbref_nl_local_import")

IMPORT_DIR = Path(__file__).resolve().parent.parent / "data/imports/fbref/nations-league"

NL_2026_TEAMS = [
    "France",
    "Italy",
    "Belgium",
    "Türkiye",
    "Germany",
    "Netherlands",
    "Serbia",
    "Greece",
    "Spain",
    "Croatia",
    "England",
    "Czechia",
    "Portugal",
    "Denmark",
    "Norway",
    "Wales",
    "Scotland",
    "Switzerland",
    "Slovenia",
    "North Macedonia",
    "Hungary",
    "Ukraine",
    "Georgia",
    "Northern Ireland",
    "Israel",
    "Austria",
    "Republic of Ireland",
    "Kosovo",
    "Poland",
    "Bosnia & Herzegovina",
    "Romania",
    "Sweden",
    "Albania",
    "Finland",
    "Belarus",
    "San Marino",
    "Montenegro",
    "Armenia",
    "Cyprus",
    "Latvia",
    "Kazakhstan",
    "Slovakia",
    "Faroe Islands",
    "Moldova",
    "Iceland",
    "Bulgaria",
    "Estonia",
    "Luxembourg",
    "Gibraltar",
    "Malta",
    "Andorra",
    "Lithuania",
    "Azerbaijan",
    "Liechtenstein",
]

FILE_TO_NL_TEAM: dict[str, str] = {
    "bosnia and herzegovina": "Bosnia & Herzegovina",
    "turkey": "Türkiye",
    "republic of ireland": "Republic of Ireland",
    "ireland": "Republic of Ireland",
    "north macedonia": "North Macedonia",
    "fyrom": "North Macedonia",
    "fyr macedonia": "North Macedonia",
    "macedonia": "North Macedonia",
    "faeroe islands": "Faroe Islands",
    "northern ireland": "Northern Ireland",
}

NL_SOFASCORE_EXTRA: dict[str, int] = {
    "italy": 4707,
    "serbia": 6355,
    "greece": 4710,
    "denmark": 4476,
    "wales": 4702,
    "slovenia": 4484,
    "north macedonia": 4777,
    "fyr macedonia": 4777,
    "macedonia": 4777,
    "hungary": 4709,
    "ukraine": 4701,
    "georgia": 4763,
    "northern ireland": 4786,
    "israel": 4480,
    "republic of ireland": 4693,
    "ireland": 4693,
    "kosovo": 154426,
    "poland": 4703,
    "romania": 4477,
    "albania": 4690,
    "finland": 4712,
    "belarus": 4743,
    "san marino": 4833,
    "montenegro": 7139,
    "armenia": 4740,
    "cyprus": 4482,
    "latvia": 4706,
    "kazakhstan": 4772,
    "slovakia": 4697,
    "faroe islands": 4760,
    "faeroe islands": 4760,
    "moldova": 4782,
    "iceland": 4708,
    "bulgaria": 4716,
    "estonia": 4759,
    "luxembourg": 4478,
    "gibraltar": 129264,
    "malta": 4483,
    "andorra": 4818,
    "lithuania": 4776,
    "azerbaijan": 4742,
    "liechtenstein": 4830,
}


def _patch_wc_module() -> None:
    wc.SOFASCORE_NATIONAL_TEAM_IDS.update(NL_SOFASCORE_EXTRA)
    wc.FILE_TO_WC_TEAM.update(FILE_TO_NL_TEAM)
    wc.WC_2026_TEAMS = list(NL_2026_TEAMS)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        type=Path,
        default=IMPORT_DIR,
        help="Folder with saved FBref HTML for NL nations / schedules",
    )
    parser.add_argument(
        "--schedule-html",
        type=Path,
        default=None,
        help="Optional NL schedule .htm under the import dir",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.v else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )

    if not args.dir.is_dir():
        args.dir.mkdir(parents=True, exist_ok=True)
        logger.warning(
            "Import directory was empty/missing; created %s. "
            "Drop FBref nation pages + NL schedule HTML here, then re-run.",
            args.dir,
        )
        print(json.dumps({"teams": 0, "note": "no HTML yet"}, indent=2))
        return

    _patch_wc_module()
    # Do not fall back to the World Cup DEFAULT_SCHEDULE_HTML when no NL schedule is given.
    schedule = args.schedule_html or Path("/.nl-no-default-schedule")
    bundle = wc.import_folder(args.dir, schedule_html=schedule)
    summary = {
        "teams": len(bundle.teams),
        "players": len(bundle.players),
        "managers": len(bundle.managers),
        "matches": len(bundle.matches),
        "player_season_stats": len(bundle.player_stats),
        "lineups": len(bundle.lineups),
    }
    if args.dry_run:
        print(json.dumps(summary, indent=2))
        return

    if summary["teams"] == 0 and summary["matches"] == 0:
        print(json.dumps({**summary, "note": "no HTML parsed"}, indent=2))
        return

    supabase = wc.create_supabase_client()
    wc.upsert_local_bundle(supabase, bundle)
    print(json.dumps(summary, indent=2))
    logger.info("NL FBref import complete.")


if __name__ == "__main__":
    main()

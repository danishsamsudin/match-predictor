#!/usr/bin/env python3
"""
Import all saved FBref HTML under data/imports/fbref/world-cup/ into Supabase.

Parses per-country squad pages (players, managers, match logs, stat tables) and the
World Cup schedule .htm file.

Usage (from match-predictor/):
  pip install -r scripts/requirements-fbref-scraper.txt
  source .env.local  # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  python scripts/import_fbref_world_cup_local.py
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

from bs4 import BeautifulSoup, Comment
from postgrest.exceptions import APIError
from supabase import Client, create_client

# Reuse schedule parsing + upsert helpers from the live scraper
from scrape_fbref_world_cup_2026 import (  # noqa: E402
    DEFAULT_SCHEDULE_HTML,
    MATCH_ID_RE,
    PLAYER_ID_RE,
    SQUAD_ID_RE,
    _absolute_url,
    _extract_id,
    _iso_date,
    _iso_time,
    _match_link_from_report_cell,
    _parse_fbref_date,
    _parse_fbref_time,
    _parse_int,
    _resolve_existing_file,
    _synthetic_fixture_id,
    _table_rows,
    _text,
    _warn_if_cloudflare_saved_page,
    parse_schedule_html,
)

logger = logging.getLogger("fbref_local_import")

IMPORT_DIR = Path(__file__).resolve().parent.parent / "data/imports/fbref/world-cup"

WC_2026_TEAMS = [
    "Algeria", "Argentina", "Australia", "Austria", "Belgium", "Bosnia & Herzegovina",
    "Brazil", "Cabo Verde", "Canada", "Colombia", "Côte d'Ivoire", "Croatia", "Curaçao",
    "Czechia", "DR Congo", "Ecuador", "Egypt", "England", "France", "Germany", "Ghana",
    "Haiti", "Iran", "Iraq", "Japan", "Jordan", "Mexico", "Morocco", "Netherlands",
    "New Zealand", "Norway", "Panama", "Paraguay", "Portugal", "Qatar", "Saudi Arabia",
    "Scotland", "Senegal", "South Africa", "South Korea", "Spain", "Sweden",
    "Switzerland", "Tunisia", "Türkiye", "Uruguay", "USA", "Uzbekistan",
]

FILE_TO_WC_TEAM: dict[str, str] = {
    "bosnia and herzegovina": "Bosnia & Herzegovina",
    "cape verde": "Cabo Verde",
    "congo dr": "DR Congo",
    "korea republic": "South Korea",
    "ir iran": "Iran",
    "united states": "USA",
    "turkey": "Türkiye",
    "cote d'ivoire": "Côte d'Ivoire",
    "curacao": "Curaçao",
}

SOFASCORE_NATIONAL_TEAM_IDS: dict[str, int] = {
    "algeria": 4691,
    "argentina": 4819,
    "australia": 4741,
    "austria": 4718,
    "belgium": 4717,
    "bosnia and herzegovina": 4479,
    "brazil": 4748,
    "cabo verde": 4753,
    "canada": 4752,
    "colombia": 4820,
    "cote divoire": 4768,
    "côte d'ivoire": 4768,
    "croatia": 4715,
    "curacao": 55827,
    "czechia": 4714,
    "dr congo": 4823,
    "ecuador": 4757,
    "egypt": 4758,
    "england": 4713,
    "france": 4481,
    "germany": 4711,
    "ghana": 4764,
    "haiti": 7229,
    "iran": 4766,
    "iraq": 4767,
    "japan": 4770,
    "jordan": 4771,
    "mexico": 4781,
    "morocco": 4778,
    "netherlands": 4705,
    "new zealand": 4784,
    "norway": 4475,
    "panama": 5164,
    "paraguay": 4789,
    "portugal": 4704,
    "qatar": 4792,
    "saudi arabia": 4834,
    "scotland": 4695,
    "senegal": 4739,
    "south africa": 4736,
    "south korea": 4735,
    "spain": 4698,
    "sweden": 4688,
    "switzerland": 4699,
    "tunisia": 4729,
    "turkiye": 4700,
    "türkiye": 4700,
    "uruguay": 4725,
    "usa": 4724,
    "united states": 4724,
    "uzbekistan": 4723,
}

GOALS_XG_PROXY = 0.85

STAT_TABLE_PREFIXES = (
    "stats_standard",
    "stats_keeper",
    "stats_shooting",
    "stats_playing_time",
    "stats_misc",
    "stats_passing",
    "stats_defense",
    "stats_possession",
)


def _norm_key(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def _country_from_filename(path: Path) -> Optional[str]:
    match = re.match(r"^(.+?)\s+Men Stats", path.name)
    if not match:
        return None
    raw = unicodedata.normalize("NFKC", match.group(1).strip())
    key = _norm_key(raw)
    if key in FILE_TO_WC_TEAM:
        return FILE_TO_WC_TEAM[key]
    for team in WC_2026_TEAMS:
        if _norm_key(team) == key:
            return team
    return raw


def _all_tables(soup: BeautifulSoup) -> dict[str, Any]:
    tables: dict[str, Any] = {}
    for table in soup.find_all("table", id=True):
        tables[table["id"]] = table
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        inner = BeautifulSoup(comment, "lxml")
        for table in inner.find_all("table", id=True):
            tables[table["id"]] = table
    return tables


def _stat_type_from_table_id(table_id: str) -> Optional[str]:
    for prefix in STAT_TABLE_PREFIXES:
        if table_id.startswith(prefix):
            return prefix.replace("stats_", "")
    return None


def _parse_manager(soup: BeautifulSoup) -> Optional[str]:
    for node in soup.select("p, div.datapoint, div#info"):
        text = node.get_text(" ", strip=True)
        if text.lower().startswith("manager:"):
            anchor = node.find("a", href=True)
            if anchor:
                return anchor.get_text(strip=True)
            return re.sub(r"^manager:\s*", "", text, flags=re.I).strip()
    return None


def _fbref_slug_for_country(country_label: str) -> str:
    """FBref URL segment before -Men-Stats (e.g. Korea-Republic, United-States)."""
    slug_overrides: dict[str, str] = {
        "Bosnia & Herzegovina": "Bosnia-and-Herzegovina",
        "Cabo Verde": "Cape-Verde",
        "Côte d'Ivoire": "Cote-dIvoire",
        "DR Congo": "Congo-DR",
        "Iran": "Iran",
        "IR Iran": "Iran",
        "South Korea": "Korea-Republic",
        "USA": "United-States",
        "Türkiye": "Turkey",
    }
    if country_label in slug_overrides:
        return slug_overrides[country_label]
    return country_label.replace(" & ", "-and-").replace(" ", "-")


def _national_squad_link(
    soup: BeautifulSoup, country_label: Optional[str] = None
) -> tuple[Optional[str], Optional[str]]:
    """Return (squad_id, country_name) for this saved squad page."""
    canonical = soup.find("link", rel="canonical")
    if canonical and canonical.get("href"):
        href = canonical["href"]
        if re.search(r"-Men-Stats", href, re.I):
            squad_id = _extract_id(SQUAD_ID_RE, href)
            if squad_id:
                return squad_id, country_label

    if country_label:
        slug = _fbref_slug_for_country(country_label)
        pattern = re.compile(
            rf"/squads/([a-f0-9]+)/{re.escape(slug)}-Men-Stats(?:[#?]|$)",
            re.I,
        )
        for anchor in soup.select('a[href*="-Men-Stats"]'):
            href = anchor.get("href", "")
            if "/history/" in href:
                continue
            match = pattern.search(href)
            if match:
                return match.group(1), country_label

    for anchor in soup.select('a[href*="/squads/"]'):
        href = anchor.get("href", "")
        if "/history/" in href or href.rstrip("/").endswith("/squads"):
            continue
        if re.search(r"/squads/[a-f0-9]+/[^/]+-Men-Stats(?:[#?]|$)", href, re.I):
            squad_id = _extract_id(SQUAD_ID_RE, href)
            name = anchor.get_text(strip=True) or None
            if squad_id and name and len(name) < 40:
                return squad_id, country_label or name
    return None, None


def _row_to_stats_json(tr: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for cell in tr.find_all(["th", "td"]):
        key = cell.get("data-stat")
        if not key:
            continue
        if key == "player":
            anchor = cell.find("a", href=PLAYER_ID_RE)
            if anchor:
                out["player_name"] = anchor.get_text(strip=True)
                out["player_id"] = _extract_id(PLAYER_ID_RE, anchor["href"])
            else:
                out["player_name"] = _text(cell)
        else:
            raw = _text(cell)
            if raw == "":
                continue
            num = _parse_int(raw)
            out[key] = num if num is not None and raw.replace(",", "").isdigit() else raw
    return out


@dataclass
class SquadImport:
    team_id: str
    team_name: str
    manager_name: Optional[str]
    players: dict[str, dict[str, Any]] = field(default_factory=dict)
    player_stats: list[dict[str, Any]] = field(default_factory=list)
    matches: list[dict[str, Any]] = field(default_factory=list)
    source_file: str = ""


def parse_squad_html(html: str, *, country_label: str, source: str) -> SquadImport:
    _warn_if_cloudflare_saved_page(html, source)
    soup = BeautifulSoup(html, "lxml")
    team_id, link_name = _national_squad_link(soup, country_label)
    if not team_id:
        raise RuntimeError(f"Could not find national squad id in {source}")

    team_name = country_label or link_name or country_label
    result = SquadImport(
        team_id=team_id,
        team_name=team_name,
        manager_name=_parse_manager(soup),
        source_file=source,
    )

    tables = _all_tables(soup)
    competition = None
    h1 = soup.find("h1")
    if h1:
        competition = h1.get_text(" ", strip=True)

    for table_id, table in tables.items():
        stat_type = _stat_type_from_table_id(table_id)
        if stat_type:
            for tr in _table_rows(table):
                if "thead" in (tr.get("class") or []):
                    continue
                stats = _row_to_stats_json(tr)
                player_id = stats.pop("player_id", None)
                player_name = stats.pop("player_name", None)
                if not player_id or not player_name:
                    continue
                result.players[player_id] = {
                    "id": player_id,
                    "name": player_name,
                    "current_team_id": team_id,
                }
                result.player_stats.append(
                    {
                        "id": str(
                            uuid.uuid5(
                                uuid.NAMESPACE_URL,
                                f"fbref-pss:{player_id}:{team_id}:{stat_type}:{competition}",
                            )
                        ),
                        "player_id": player_id,
                        "team_id": team_id,
                        "stat_type": stat_type,
                        "competition": competition,
                        "stats": stats,
                    }
                )

    matchlogs = None
    for table_id, table in tables.items():
        if table_id.startswith("matchlogs"):
            matchlogs = table
            break
    if matchlogs:
        for tr in _table_rows(matchlogs):
            if "thead" in (tr.get("class") or []):
                continue
            date_cell = tr.find(["th", "td"], attrs={"data-stat": "date"})
            match_date = _parse_fbref_date(_text(date_cell)) if date_cell else None
            if not match_date and date_cell:
                date_anchor = date_cell.find("a", href=True)
                if date_anchor:
                    match_date = _parse_fbref_date(date_anchor.get_text(strip=True))
            if not match_date:
                continue

            opponent_cell = tr.find("td", attrs={"data-stat": "opponent"})
            opp_id, opp_name = None, None
            if opponent_cell:
                opp_anchor = opponent_cell.find("a", href=SQUAD_ID_RE)
                if opp_anchor:
                    opp_id = _extract_id(SQUAD_ID_RE, opp_anchor["href"])
                    opp_name = opp_anchor.get_text(strip=True)

            venue_text = _text(tr.find("td", attrs={"data-stat": "venue"})).lower()
            is_home = venue_text == "home"
            is_away = venue_text == "away"

            if is_home:
                home_id, away_id = team_id, opp_id
            elif is_away:
                home_id, away_id = opp_id, team_id
            else:
                home_id, away_id = team_id, opp_id

            report_cell = tr.find("td", attrs={"data-stat": "match_report"})
            match_url, match_id = _match_link_from_report_cell(report_cell)
            if not match_id and date_cell:
                date_anchor = date_cell.find("a", href=MATCH_ID_RE)
                if date_anchor:
                    match_url = _absolute_url(date_anchor["href"])
                    match_id = _extract_id(MATCH_ID_RE, date_anchor["href"])
            if not match_id and home_id and away_id:
                match_id = _synthetic_fixture_id(home_id, away_id, match_date)
            if not match_id:
                continue

            gf = _parse_int(_text(tr.find("td", attrs={"data-stat": "goals_for"})))
            ga = _parse_int(_text(tr.find("td", attrs={"data-stat": "goals_against"})))
            xg_for = _parse_optional_float(
                _text(tr.find("td", attrs={"data-stat": "xg_for"}))
            )
            xg_against = _parse_optional_float(
                _text(tr.find("td", attrs={"data-stat": "xg_against"}))
            )
            formation = _text(tr.find("td", attrs={"data-stat": "formation"})) or None
            opp_formation = _text(tr.find("td", attrs={"data-stat": "opp_formation"})) or None
            home_formation = formation if is_home else opp_formation
            away_formation = opp_formation if is_home else formation

            if is_home:
                home_xg = xg_for
                away_xg = xg_against
                home_goals = gf
                away_goals = ga
            elif is_away:
                home_xg = xg_against
                away_xg = xg_for
                home_goals = ga
                away_goals = gf
            else:
                home_xg = xg_for
                away_xg = xg_against
                home_goals = gf
                away_goals = ga

            result.matches.append(
                {
                    "id": match_id,
                    "date": _iso_date(match_date),
                    "time": _iso_time(
                        _parse_fbref_time(_text(tr.find("td", attrs={"data-stat": "start_time"})))
                    ),
                    "venue": _text(tr.find("td", attrs={"data-stat": "venue"})) or None,
                    "home_team_id": home_id,
                    "away_team_id": away_id,
                    "home_formation": home_formation,
                    "away_formation": away_formation,
                    "attendance": _parse_int(_text(tr.find("td", attrs={"data-stat": "attendance"}))),
                    "referee": _text(tr.find("td", attrs={"data-stat": "referee"})) or None,
                    "competition": _text(tr.find("td", attrs={"data-stat": "comp"})) or None,
                    "round": _text(tr.find("td", attrs={"data-stat": "round"})) or None,
                    "day_of_week": _text(tr.find("td", attrs={"data-stat": "dayofweek"})) or None,
                    "result": _text(tr.find("td", attrs={"data-stat": "result"})) or None,
                    "home_goals": home_goals,
                    "away_goals": away_goals,
                    "home_xg": home_xg,
                    "away_xg": away_xg,
                    "_opp_team": {"id": opp_id, "name": opp_name} if opp_id else None,
                }
            )

    return result


@dataclass
class LocalBundle:
    teams: dict[str, str] = field(default_factory=dict)
    players: dict[str, dict[str, Any]] = field(default_factory=dict)
    managers: list[dict[str, Any]] = field(default_factory=list)
    manager_team_ids: dict[str, int] = field(default_factory=dict)
    matches: dict[str, dict[str, Any]] = field(default_factory=dict)
    player_stats: dict[str, dict[str, Any]] = field(default_factory=dict)
    lineups: list[dict[str, Any]] = field(default_factory=list)


def _merge_squad(bundle: LocalBundle, squad: SquadImport) -> None:
    bundle.teams[squad.team_id] = squad.team_name
    if squad.manager_name:
        bundle.managers.append({"name": squad.manager_name, "team_id": squad.team_id})
    bundle.players.update(squad.players)
    for row in squad.player_stats:
        bundle.player_stats[row["id"]] = row
    for match in squad.matches:
        opp = match.pop("_opp_team", None)
        if opp and opp.get("id") and opp.get("name"):
            bundle.teams[opp["id"]] = opp["name"]
        mid = match.get("id")
        if mid:
            bundle.matches[mid] = {**bundle.matches.get(mid, {}), **match}


def _merge_schedule(bundle: LocalBundle, schedule_rows: list[Any]) -> None:
    for row in schedule_rows:
        if row.home_team_id and row.home_team_name:
            bundle.teams[row.home_team_id] = row.home_team_name
        if row.away_team_id and row.away_team_name:
            bundle.teams[row.away_team_id] = row.away_team_name
        if not row.match_id:
            continue
        bundle.matches[row.match_id] = {
            **bundle.matches.get(row.match_id, {}),
            "id": row.match_id,
            "date": _iso_date(row.date),
            "time": _iso_time(row.kickoff_time),
            "venue": row.venue,
            "home_team_id": row.home_team_id,
            "away_team_id": row.away_team_id,
            "attendance": row.attendance,
            "referee": row.referee,
            "competition": bundle.matches.get(row.match_id, {}).get("competition")
            or "FIFA World Cup 2026",
        }


MATCH_CORE_COLUMNS = {
    "id",
    "date",
    "time",
    "venue",
    "home_team_id",
    "away_team_id",
    "attendance",
    "referee",
    "home_manager_id",
    "away_manager_id",
}
MATCH_EXTENDED_COLUMNS = {
    "competition",
    "round",
    "day_of_week",
    "result",
    "home_goals",
    "away_goals",
    "home_formation",
    "away_formation",
}


def _strip_match_rows(
    rows: list[dict[str, Any]], *, extended: bool
) -> list[dict[str, Any]]:
    allowed = MATCH_CORE_COLUMNS | (MATCH_EXTENDED_COLUMNS if extended else set())
    stripped: list[dict[str, Any]] = []
    for row in rows:
        stripped.append({k: v for k, v in row.items() if k in allowed})
    return stripped


def _parse_optional_float(value: str) -> Optional[float]:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def fbref_synthetic_event_id(fbref_match_id: str) -> int:
    h = 0
    for ch in fbref_match_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    return -abs(h or 1)


def resolve_sofascore_team_id(fbref_team_id: Any, teams: dict[str, str]) -> Optional[int]:
    if fbref_team_id is None:
        return None
    name = teams.get(str(fbref_team_id))
    if not name:
        return None
    return SOFASCORE_NATIONAL_TEAM_IDS.get(_norm_key(name))


def international_match_tier_weight(competition: Optional[str]) -> float:
    c = (competition or "").lower()
    if not c:
        return 0.85
    if any(k in c for k in ("friendl", "preparatory", "preparation", "test match")):
        return 0.32
    if any(
        k in c
        for k in (
            "qualif",
            "play-off",
            "playoff",
            "inter-confederation",
            "wcq",
            "afc",
            "caf",
            "concacaf",
            "conmebol",
            "uefa",
        )
    ):
        return 1.0
    if any(
        k in c
        for k in (
            "world cup",
            "euro",
            "copa",
            "nations league",
            "continental",
            "afcon",
            "gold cup",
            "asian cup",
            "finals",
        )
    ):
        return 1.12
    return 0.88


def upsert_national_process_metrics_from_bundle(
    supabase: Client, bundle: LocalBundle
) -> int:
    rows: list[dict[str, Any]] = []
    synced_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    for match in bundle.matches.values():
        home_fbref = match.get("home_team_id")
        away_fbref = match.get("away_team_id")
        home_id = resolve_sofascore_team_id(home_fbref, bundle.teams)
        away_id = resolve_sofascore_team_id(away_fbref, bundle.teams)
        if not home_id or not away_id:
            continue

        home_xg = match.get("home_xg")
        away_xg = match.get("away_xg")
        home_goals = match.get("home_goals")
        away_goals = match.get("away_goals")
        source = "fbref"

        if home_xg is None and home_goals is not None:
            home_xg = float(home_goals) * GOALS_XG_PROXY
            source = "fbref_goals_proxy"
        if away_xg is None and away_goals is not None:
            away_xg = float(away_goals) * GOALS_XG_PROXY
            source = "fbref_goals_proxy"

        if home_xg is None and away_xg is None:
            continue

        match_id = str(match.get("id") or "")
        if not match_id:
            continue

        competition = match.get("competition")
        rows.append(
            {
                "event_id": fbref_synthetic_event_id(match_id),
                "source": source,
                "match_date": match.get("date"),
                "home_team_id": home_id,
                "away_team_id": away_id,
                "home_xg": home_xg,
                "away_xg": away_xg,
                "home_shots": None,
                "away_shots": None,
                "home_sot": None,
                "away_sot": None,
                "competition_tier": international_match_tier_weight(competition),
                "payload": {
                    "competition": competition,
                    "fbref_match_id": match_id,
                    "proxy_from_goals": source == "fbref_goals_proxy",
                },
                "synced_at": synced_at,
            }
        )

    if not rows:
        return 0

    chunk_size = 200
    upserted = 0
    for i in range(0, len(rows), chunk_size):
        supabase.table("national_match_process_metrics").upsert(
            rows[i : i + chunk_size], on_conflict="event_id"
        ).execute()
        upserted += len(rows[i : i + chunk_size])
    logger.info("Upserted %s national_match_process_metrics rows", upserted)
    return upserted


def upsert_local_bundle(supabase: Client, bundle: LocalBundle) -> None:
    team_rows = [{"id": k, "name": v} for k, v in bundle.teams.items()]
    if team_rows:
        supabase.table("teams").upsert(team_rows, on_conflict="id").execute()
        logger.info("Upserted %s teams", len(team_rows))

    if bundle.players:
        supabase.table("players").upsert(
            list(bundle.players.values()), on_conflict="id"
        ).execute()
        logger.info("Upserted %s players", len(bundle.players))

    if bundle.managers:
        supabase.table("managers").upsert(
            bundle.managers, on_conflict="name,team_id"
        ).execute()
        lookup = supabase.table("managers").select("id, name, team_id").execute()
        for row in lookup.data or []:
            bundle.manager_team_ids[(row["name"], row["team_id"])] = row["id"]
        logger.info("Upserted %s managers", len(bundle.managers))

    match_rows = list(bundle.matches.values())
    for match in match_rows:
        for side in ("home", "away"):
            tid = match.get(f"{side}_team_id")
            if not tid:
                continue
            for (_name, team_id), mid in bundle.manager_team_ids.items():
                if team_id == tid:
                    match[f"{side}_manager_id"] = mid
                    break

    if match_rows:
        try:
            supabase.table("matches").upsert(
                _strip_match_rows(match_rows, extended=True), on_conflict="id"
            ).execute()
        except APIError as exc:
            if "schema cache" in str(exc).lower() or exc.code == "PGRST204":
                logger.warning(
                    "Extended match columns missing — run supabase/migrations/"
                    "012_fbref_extended_stats.sql in the SQL editor, then re-import. "
                    "Retrying with core match columns only."
                )
                supabase.table("matches").upsert(
                    _strip_match_rows(match_rows, extended=False), on_conflict="id"
                ).execute()
            else:
                raise
        logger.info("Upserted %s matches", len(match_rows))

    stat_rows = list(bundle.player_stats.values())
    if stat_rows:
        try:
            supabase.table("player_season_stats").upsert(
                stat_rows, on_conflict="player_id,team_id,stat_type,competition"
            ).execute()
            logger.info("Upserted %s player_season_stats rows", len(stat_rows))
        except APIError as exc:
            if "player_season_stats" in str(exc).lower() or exc.code == "PGRST204":
                logger.error(
                    "Table player_season_stats not found. Apply migration "
                    "012_fbref_extended_stats.sql in Supabase SQL editor and re-run."
                )
            else:
                raise

    try:
        upsert_national_process_metrics_from_bundle(supabase, bundle)
    except APIError as exc:
        if "national_match_process_metrics" in str(exc).lower() or exc.code == "PGRST204":
            logger.warning(
                "Table national_match_process_metrics not found. Apply migration "
                "021_graham_national_process_metrics.sql and re-import."
            )
        else:
            raise


def missing_wc_teams(uploaded_country_names: set[str]) -> list[str]:
    uploaded_keys = {_norm_key(name) for name in uploaded_country_names}
    missing = []
    for team in WC_2026_TEAMS:
        if _norm_key(team) not in uploaded_keys:
            missing.append(team)
    return missing


def extra_uploads(uploaded_country_names: set[str]) -> list[str]:
    wc_keys = {_norm_key(t) for t in WC_2026_TEAMS}
    extras = []
    for name in uploaded_country_names:
        if _norm_key(name) not in wc_keys:
            extras.append(name)
    return extras


def import_folder(
    folder: Path,
    *,
    schedule_html: Optional[Path] = None,
) -> LocalBundle:
    bundle = LocalBundle()
    uploaded_country_names: set[str] = set()

    html_files = sorted(folder.glob("*.html"))
    logger.info("Parsing %s country HTML files from %s", len(html_files), folder)

    for path in html_files:
        country = _country_from_filename(path)
        if not country:
            logger.warning("Skipping unrecognized file: %s", path.name)
            continue
        uploaded_country_names.add(country)
        try:
            html = path.read_text(encoding="utf-8", errors="replace")
            squad = parse_squad_html(html, country_label=country, source=str(path))
            _merge_squad(bundle, squad)
            logger.info(
                "%s: %s players, %s stat rows, %s matches",
                country,
                len(squad.players),
                len(squad.player_stats),
                len(squad.matches),
            )
        except Exception:
            logger.exception("Failed to parse %s", path.name)

    sched_path = schedule_html or DEFAULT_SCHEDULE_HTML
    if sched_path.is_file():
        sched = _resolve_existing_file(sched_path, label="Schedule HTML")
        html = sched.read_text(encoding="utf-8", errors="replace")
        rows = parse_schedule_html(html, source=str(sched))
        _merge_schedule(bundle, rows)
        logger.info("Merged %s World Cup schedule rows", len(rows))

    missing = missing_wc_teams(uploaded_country_names)
    if missing:
        logger.warning("WC 2026 teams with NO HTML file: %s", ", ".join(missing))
    extras = extra_uploads(uploaded_country_names)
    if extras:
        logger.info("Extra uploads (not in WC 2026 final 48): %s", ", ".join(extras))

    return bundle


def create_supabase_client() -> Client:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (
        os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
    return create_client(url, key)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        type=Path,
        default=IMPORT_DIR,
        help="Folder with saved FBref HTML",
    )
    parser.add_argument(
        "--schedule-html",
        type=Path,
        default=None,
        help="World Cup schedule .htm (default: data/imports/.../World Cup Scores...)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse only, print summary JSON",
    )
    parser.add_argument("-v", action="store_true", help="Debug logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.v else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    bundle = import_folder(args.dir, schedule_html=args.schedule_html)
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

    supabase = create_supabase_client()
    upsert_local_bundle(supabase, bundle)
    print(json.dumps(summary, indent=2))
    logger.info("Import complete.")


if __name__ == "__main__":
    main()

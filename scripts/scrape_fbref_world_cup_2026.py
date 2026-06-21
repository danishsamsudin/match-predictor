#!/usr/bin/env python3
"""
Scrape FIFA World Cup 2026 fixtures, managers, and post-match lineups from FBref
and upsert into Supabase.

Rate limit: FBref allows ~20 requests/minute. This script sleeps 3.5s after every
HTTP request (deterministic, via time.sleep).

Environment:
  SUPABASE_URL          — project URL
  SUPABASE_KEY          — service role key (or SUPABASE_SERVICE_ROLE_KEY)
  FBREF_COOKIES         — optional Cookie header copied from your browser (see --help)

FBref sits behind Cloudflare. Plain HTTP clients get 403; this script uses curl_cffi TLS
impersonation plus an optional session cookie. If scraping still fails, save pages in
your browser and pass --schedule-html / --match-html-dir (offline mode).

Usage:
  pip install -r scripts/requirements-fbref-scraper.txt
  export SUPABASE_URL=... SUPABASE_KEY=...
  export FBREF_COOKIES='cf_clearance=...; session=...'   # after logging in via browser
  python scripts/scrape_fbref_world_cup_2026.py
  python scripts/scrape_fbref_world_cup_2026.py --max-matches 3 --dry-run
  python scripts/scrape_fbref_world_cup_2026.py --schedule-html ~/Downloads/schedule.html
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, time as dt_time
from pathlib import Path
from typing import Any, Optional, Union
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Comment
from curl_cffi import requests as http_requests
from curl_cffi.requests import Session
from curl_cffi.requests.exceptions import HTTPError, RequestException
from supabase import Client, create_client

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FBREF_BASE = "https://fbref.com"
DEFAULT_SCHEDULE_URL = (
    f"{FBREF_BASE}/en/comps/1/2026/schedule/World-Cup-Scores-and-Fixtures"
)
# Saved schedule from Chrome (Web Page, Complete) — see data/imports/fbref/world-cup/
DEFAULT_SCHEDULE_HTML = (
    Path(__file__).resolve().parent.parent
    / "data/imports/fbref/world-cup/World Cup Scores & Fixtures _ FBref.com.htm"
)
REQUEST_INTERVAL_SEC = 3.5
MAX_RETRIES = 5
BACKOFF_BASE_SEC = 2.0

USER_AGENTS = [
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
]

DEFAULT_HEADERS = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
}

MATCH_ID_RE = re.compile(r"/en/matches/([a-f0-9]+)/", re.I)
PLAYER_ID_RE = re.compile(r"/en/players/([a-f0-9]+)/", re.I)
SQUAD_ID_RE = re.compile(r"/en/squads/([a-f0-9]+)/", re.I)
MANAGER_ID_RE = re.compile(r"/en/managers/([a-f0-9]+)/", re.I)

logger = logging.getLogger("fbref_world_cup_2026")

TRANSIENT_STATUS = {429, 500, 502, 503, 504}
FBREF_BLOCK_HINT = (
    "FBref returned 403 (Cloudflare). Export cookies from a browser session where "
    "fbref.com loads, then set FBREF_COOKIES or pass --cookies-file. "
    "Alternatively save HTML in the browser and use --schedule-html / --match-html-dir."
)


class FbrefAccessError(RuntimeError):
    """Raised when FBref blocks automated access."""


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class ScheduleRow:
    match_id: Optional[str]
    match_url: Optional[str]
    date: Optional[date]
    kickoff_time: Optional[dt_time]
    venue: Optional[str]
    home_team_id: Optional[str]
    home_team_name: Optional[str]
    away_team_id: Optional[str]
    away_team_name: Optional[str]
    attendance: Optional[int]
    referee: Optional[str]


@dataclass
class ManagerInfo:
    name: str
    fbref_id: Optional[str] = None


@dataclass
class LineupPlayer:
    player_id: str
    player_name: str
    team_id: str
    is_starting: bool
    jersey_number: Optional[int]
    position: Optional[str]


@dataclass
class MatchPageData:
    match_id: str
    match_url: str
    date: Optional[date]
    kickoff_time: Optional[dt_time]
    venue: Optional[str]
    home_team_id: str
    home_team_name: str
    away_team_id: str
    away_team_name: str
    attendance: Optional[int]
    referee: Optional[str]
    home_manager: Optional[ManagerInfo] = None
    away_manager: Optional[ManagerInfo] = None
    lineups: list[LineupPlayer] = field(default_factory=list)


@dataclass
class ScrapeBundle:
    teams: dict[str, str]
    players: dict[str, dict[str, Any]]
    managers: list[dict[str, Any]]
    matches: list[dict[str, Any]]
    lineups: list[dict[str, Any]]
    manager_key_to_id: dict[tuple[str, str], int] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# HTTP client (session, delay, retries, headers)
# ---------------------------------------------------------------------------


def _load_cookie_header(cookies_file: Optional[str]) -> Optional[str]:
    from_env = (os.environ.get("FBREF_COOKIES") or os.environ.get("FBREF_COOKIE") or "").strip()
    if from_env:
        return from_env
    if not cookies_file:
        return None
    path = Path(cookies_file).expanduser()
    return path.read_text(encoding="utf-8").strip()


def _is_cloudflare_challenge(status_code: int, body: str) -> bool:
    if status_code not in (403, 503):
        return False
    markers = ("Just a moment", "cf-challenge", "challenge-platform", "Enable JavaScript")
    return any(marker in body for marker in markers)


class FbrefHttpClient:
    """
    curl_cffi Session (requests-compatible) with mandatory delay and backoff.

    Uses browser TLS impersonation; optional Cookie header for Cloudflare clearance.
    """

    def __init__(
        self,
        request_interval: float = REQUEST_INTERVAL_SEC,
        *,
        impersonate: str = "chrome131",
        cookie_header: Optional[str] = None,
    ) -> None:
        self.request_interval = request_interval
        self.impersonate = impersonate
        self.cookie_header = cookie_header
        self.session: Session = http_requests.Session(impersonate=impersonate)
        self._ua_index = 0
        self._last_request_at: float = 0.0
        if cookie_header:
            logger.info(
                "Using FBref session cookies (%s bytes). Impersonate=%s",
                len(cookie_header),
                impersonate,
            )

    def _headers(self, referer: Optional[str] = None) -> dict[str, str]:
        headers = dict(DEFAULT_HEADERS)
        # Cloudflare cookies are bound to UA/TLS — do not rotate when using cookies.
        if self.cookie_header:
            headers["User-Agent"] = USER_AGENTS[0]
        else:
            headers["User-Agent"] = USER_AGENTS[self._ua_index % len(USER_AGENTS)]
            self._ua_index += 1
        headers["Referer"] = referer or f"{FBREF_BASE}/"
        if self.cookie_header:
            headers["Cookie"] = self.cookie_header
        return headers

    def _wait_for_slot(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.request_interval:
            sleep_for = self.request_interval - elapsed
            logger.debug("Sleeping %.2fs before next request", sleep_for)
            time.sleep(sleep_for)

    def _raise_if_blocked(self, response: http_requests.Response) -> None:
        body = response.text[:2000]
        if _is_cloudflare_challenge(response.status_code, body):
            raise FbrefAccessError(FBREF_BLOCK_HINT)
        if response.status_code == 403:
            raise FbrefAccessError(
                f"HTTP 403 Forbidden for {response.url}. {FBREF_BLOCK_HINT}"
            )

    def get(self, url: str, referer: Optional[str] = None) -> str:
        last_error: Optional[Exception] = None
        for attempt in range(MAX_RETRIES):
            self._wait_for_slot()
            started = time.monotonic()
            try:
                response = self.session.get(
                    url,
                    headers=self._headers(referer=referer),
                    timeout=45,
                )
                self._last_request_at = time.monotonic()
                elapsed = self._last_request_at - started
                logger.info(
                    "GET %s -> %s (%.2fs)",
                    url,
                    response.status_code,
                    elapsed,
                )
                if response.status_code in TRANSIENT_STATUS:
                    raise HTTPError(
                        f"Transient HTTP {response.status_code}",
                        response=response,
                    )
                if response.status_code in (403, 503):
                    self._raise_if_blocked(response)
                response.raise_for_status()
                if _is_cloudflare_challenge(response.status_code, response.text):
                    raise FbrefAccessError(FBREF_BLOCK_HINT)
                return response.text
            except FbrefAccessError:
                raise
            except (HTTPError, RequestException) as exc:
                last_error = exc
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status in (403, 503):
                    resp = getattr(exc, "response", None)
                    if resp is not None:
                        self._raise_if_blocked(resp)
                    raise FbrefAccessError(FBREF_BLOCK_HINT) from exc
                if attempt >= MAX_RETRIES - 1:
                    break
                backoff = BACKOFF_BASE_SEC * (2**attempt)
                logger.warning(
                    "Request failed (%s), retry %s/%s in %.1fs",
                    exc,
                    attempt + 1,
                    MAX_RETRIES - 1,
                    backoff,
                )
                time.sleep(backoff)
        assert last_error is not None
        raise last_error


class LocalHtmlClient:
    """Read FBref pages from disk (no HTTP)."""

    def __init__(self, match_html_dir: Optional[Path] = None) -> None:
        self.match_html_dir = match_html_dir

    def get(self, url: str, referer: Optional[str] = None) -> str:  # noqa: ARG002
        match_id = _extract_id(MATCH_ID_RE, url)
        if not match_id or not self.match_html_dir:
            raise FbrefAccessError(
                f"No local HTML for {url}. Save the match page as "
                f"{self.match_html_dir}/<match_id>.html"
            )
        path = self.match_html_dir / f"{match_id}.html"
        if not path.is_file():
            raise FileNotFoundError(f"Missing local match HTML: {path}")
        logger.info("Reading local match HTML %s", path)
        return path.read_text(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# HTML helpers (FBref wraps many tables in HTML comments)
# ---------------------------------------------------------------------------


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def _find_including_comments(
    soup: BeautifulSoup, *, table_id_prefix: str = "sched", tag: str = "table"
) -> Optional[Any]:
    """Locate an element by id prefix, including tables hidden inside comments."""
    for element in soup.find_all(tag, id=re.compile(rf"^{re.escape(table_id_prefix)}")):
        return element
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        if table_id_prefix not in comment:
            continue
        inner = BeautifulSoup(comment, "lxml")
        element = inner.find(tag, id=re.compile(rf"^{re.escape(table_id_prefix)}"))
        if element is not None:
            return element
    return None


def _text(cell: Any) -> str:
    if cell is None:
        return ""
    return cell.get_text(" ", strip=True)


def _parse_int(value: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", value or "")
    return int(digits) if digits else None


def _parse_fbref_date(value: str) -> Optional[date]:
    value = (value or "").strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y", "%B %d %Y"):
        try:
            from datetime import datetime

            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_fbref_time(value: str) -> Optional[dt_time]:
    value = (value or "").strip()
    if not value or value in ("—", "-", ""):
        return None
    # FBref group stage uses "12:00(18:00)" — local wall clock, then CEST in parentheses.
    local_match = re.match(r"^(\d{1,2}:\d{2})", value)
    if local_match:
        value = local_match.group(1)
    for fmt in ("%H:%M", "%I:%M %p"):
        try:
            from datetime import datetime

            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    return None


def _extract_id(pattern: re.Pattern[str], href: str) -> Optional[str]:
    if not href:
        return None
    match = pattern.search(href)
    return match.group(1) if match else None


def _absolute_url(href: str) -> str:
    return urljoin(FBREF_BASE, href)


def _team_from_cell(cell: Any) -> tuple[Optional[str], Optional[str]]:
    anchor = cell.find("a", href=True) if cell else None
    if not anchor:
        return None, _text(cell) or None
    team_id = _extract_id(SQUAD_ID_RE, anchor["href"])
    return team_id, anchor.get_text(strip=True) or None


def _lineup_uuid(match_id: str, player_id: str, team_id: str) -> str:
    return str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"fbref-lineup:{match_id}:{player_id}:{team_id}",
        )
    )


def _table_rows(table: Any) -> list[Any]:
    """
    Return data rows from a table.

    Tables parsed from HTML comments do not always get an implicit <tbody>.
    """
    tbody = table.find("tbody")
    if tbody is not None:
        return tbody.find_all("tr")
    return table.find_all("tr")


def _synthetic_fixture_id(
    home_team_id: str, away_team_id: str, match_date: date
) -> str:
    """Stable id for upcoming fixtures without a /en/matches/ link yet."""
    return str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"fbref-fixture:{match_date.isoformat()}:{home_team_id}:{away_team_id}",
        )
    )


def _match_link_from_report_cell(report_cell: Any) -> tuple[Optional[str], Optional[str]]:
    """
    Extract match URL/id from the schedule match_report cell.

    Unplayed fixtures use link text like 'Head-to-Head' or 'Preview', but played
    games use 'Match Report'. Any href containing /en/matches/<id>/ is accepted.
    """
    if not report_cell:
        return None, None
    for link in report_cell.find_all("a", href=True):
        potential_url = _absolute_url(link["href"])
        potential_id = _extract_id(MATCH_ID_RE, potential_url)
        if potential_id:
            return potential_url, potential_id
    return None, None


# ---------------------------------------------------------------------------
# Schedule scraping
# ---------------------------------------------------------------------------


def _resolve_existing_file(path: Path, *, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise SystemExit(
            f"{label} not found: {resolved}\n"
            f"Current working directory: {Path.cwd()}\n"
            "Tip: use an absolute path, e.g. --schedule-html ~/Downloads/schedule.html"
        )
    return resolved


def _warn_if_cloudflare_saved_page(html: str, source: str) -> None:
    if _is_cloudflare_challenge(403, html) or _is_cloudflare_challenge(200, html):
        logger.warning(
            "%s looks like a Cloudflare block page, not FBref data. "
            "Re-save after the schedule fully loads in your browser.",
            source,
        )


def parse_schedule_html(html: str, *, source: str = "schedule") -> list[ScheduleRow]:
    """
    Parse the World Cup schedule page HTML.

    FBref schedule tables use id='sched_*' and stable data-stat attributes on
    each <td> (date, start_time, home_team, away_team, venue, attendance,
    referee, match_report).
    """
    _warn_if_cloudflare_saved_page(html, source)
    soup = _soup(html)
    table = _find_including_comments(soup, table_id_prefix="sched")
    if table is None:
        raise RuntimeError(f"No schedule table found in {source}")

    rows: list[ScheduleRow] = []
    current_date: Optional[date] = None

    for tr in _table_rows(table):
        classes = tr.get("class") or []
        if "thead" in classes or "spacer" in classes:
            continue

        th = tr.find("th")
        if th and th.get("colspan"):
            current_date = _parse_fbref_date(_text(th)) or current_date

        date_cell = tr.find("td", attrs={"data-stat": "date"})
        row_date = _parse_fbref_date(_text(date_cell)) if date_cell else None
        if row_date:
            current_date = row_date

        home_cell = tr.find("td", attrs={"data-stat": "home_team"})
        away_cell = tr.find("td", attrs={"data-stat": "away_team"})
        if not home_cell or not away_cell:
            continue

        home_id, home_name = _team_from_cell(home_cell)
        away_id, away_name = _team_from_cell(away_cell)

        time_cell = tr.find("td", attrs={"data-stat": "start_time"})
        venue_cell = tr.find("td", attrs={"data-stat": "venue"})
        attendance_cell = tr.find("td", attrs={"data-stat": "attendance"})
        referee_cell = tr.find("td", attrs={"data-stat": "referee"})
        report_cell = tr.find("td", attrs={"data-stat": "match_report"})

        match_url, match_id = _match_link_from_report_cell(report_cell)
        if not match_id and home_id and away_id and current_date:
            match_id = _synthetic_fixture_id(home_id, away_id, current_date)

        rows.append(
            ScheduleRow(
                match_id=match_id,
                match_url=match_url,
                date=current_date,
                kickoff_time=_parse_fbref_time(_text(time_cell)),
                venue=_text(venue_cell) or None,
                home_team_id=home_id,
                home_team_name=home_name,
                away_team_id=away_id,
                away_team_name=away_name,
                attendance=_parse_int(_text(attendance_cell)),
                referee=_text(referee_cell) or None,
            )
        )

    with_match_pages = [r for r in rows if r.match_url]
    logger.info(
        "Schedule parsed: %s rows (%s with /en/matches/ links, %s fixture ids total)",
        len(rows),
        len(with_match_pages),
        sum(1 for r in rows if r.match_id),
    )
    return rows


def get_match_urls(
    client: Union[FbrefHttpClient, LocalHtmlClient],
    schedule_url: str = DEFAULT_SCHEDULE_URL,
    *,
    schedule_html: Optional[str] = None,
) -> list[ScheduleRow]:
    if schedule_html is not None:
        return parse_schedule_html(schedule_html, source="--schedule-html")
    html = client.get(schedule_url)
    return parse_schedule_html(html, source=schedule_url)


# ---------------------------------------------------------------------------
# Match page scraping
# ---------------------------------------------------------------------------


def _parse_scorebox_meta(soup: BeautifulSoup) -> dict[str, Any]:
    """Venue, date, time, attendance, referee from scorebox_meta / venuetime."""
    meta: dict[str, Any] = {}
    venuetime = soup.find("span", class_="venuetime")
    if venuetime:
        if venuetime.get("data-venue-date"):
            meta["date"] = _parse_fbref_date(venuetime["data-venue-date"])
        if venuetime.get("data-venue-time"):
            meta["time"] = _parse_fbref_time(venuetime["data-venue-time"])
        if not meta.get("date"):
            meta["date"] = _parse_fbref_date(_text(venuetime))

    scorebox_meta = soup.find("div", class_="scorebox_meta")
    if scorebox_meta:
        for div in scorebox_meta.find_all("div"):
            label = div.find("strong")
            if not label:
                continue
            key = label.get_text(strip=True).lower()
            value = div.get_text(" ", strip=True).replace(label.get_text(strip=True), "").strip()
            if key == "attendance":
                meta["attendance"] = _parse_int(value)
            elif key == "referee":
                meta["referee"] = value or None
            elif key in ("venue", "stadium") and value:
                meta["venue"] = value

    if not meta.get("venue"):
        venue_node = soup.find("span", class_="venuetime")
        if venue_node and venue_node.get("data-venue"):
            meta["venue"] = venue_node["data-venue"]

    return meta


def _parse_scorebox_teams(soup: BeautifulSoup) -> list[dict[str, str]]:
    """
    Home/away team ids and names from scorebox.

    Mirrors soccerdata FBref._parse_teams: //div[@class='scorebox']//strong/a
    """
    teams: list[dict[str, str]] = []
    seen: set[str] = set()
    scorebox = soup.find("div", class_="scorebox")
    if scorebox:
        for anchor in scorebox.select("a[href*='/squads/']"):
            team_id = _extract_id(SQUAD_ID_RE, anchor.get("href", ""))
            if not team_id or team_id in seen:
                continue
            seen.add(team_id)
            teams.append({"id": team_id, "name": anchor.get_text(strip=True)})
            if len(teams) == 2:
                break
    return teams


def _parse_managers(soup: BeautifulSoup) -> tuple[Optional[ManagerInfo], Optional[ManagerInfo]]:
    """
    Managers live in scorebox .datapoint blocks labelled 'Manager'.

    There are two scorebox columns (home, away); collect in document order.
    """
    managers: list[ManagerInfo] = []
    for datapoint in soup.select("div.scorebox div.datapoint"):
        label = datapoint.find("strong")
        if not label or label.get_text(strip=True).lower() != "manager":
            continue
        anchor = datapoint.find("a", href=True)
        if anchor:
            managers.append(
                ManagerInfo(
                    name=anchor.get_text(strip=True),
                    fbref_id=_extract_id(MANAGER_ID_RE, anchor["href"]),
                )
            )
        else:
            text = datapoint.get_text(" ", strip=True)
            text = re.sub(r"^Manager\s*", "", text, flags=re.I).strip()
            if text:
                managers.append(ManagerInfo(name=text))

    home = managers[0] if len(managers) > 0 else None
    away = managers[1] if len(managers) > 1 else None
    return home, away


def _parse_lineup_tables(
    soup: BeautifulSoup,
    teams: list[dict[str, str]],
    match_id: str,
) -> list[LineupPlayer]:
    """
    Post-match lineups: div.lineup > table for each side.

    FBref marks the bench with a jersey_number cell equal to 'Bench'. Rows
    above are starters; below are substitutes (soccerdata read_lineup logic).
    """
    if len(teams) < 2:
        return []

    lineup_divs = soup.select("div.lineup")
    players: list[LineupPlayer] = []

    for side_index, lineup_div in enumerate(lineup_divs[:2]):
        team = teams[side_index]
        table = lineup_div.find("table")
        if not table:
            continue

        # Optional: merge positions from stats_*_summary table
        positions_by_player: dict[str, str] = {}
        stats_table = soup.find("table", id=f"stats_{team['id']}_summary")
        if stats_table:
            for tr in _table_rows(stats_table):
                player_cell = tr.find("td", attrs={"data-stat": "player"})
                pos_cell = tr.find("td", attrs={"data-stat": "position"})
                if not player_cell:
                    continue
                anchor = player_cell.find("a", href=True)
                pname = anchor.get_text(strip=True) if anchor else _text(player_cell)
                if pname and pos_cell:
                    positions_by_player[pname] = _text(pos_cell)

        is_starter = True
        for tr in _table_rows(table):
            number_cell = tr.find("th") or tr.find("td")
            jersey_raw = _text(number_cell)
            if jersey_raw.strip().lower() == "bench":
                is_starter = False
                continue

            # Lineup tables use th for number + td with player link (no data-stat).
            anchor = tr.find("a", href=PLAYER_ID_RE)
            if not anchor:
                continue
            player_id = _extract_id(PLAYER_ID_RE, anchor["href"])
            if not player_id:
                continue

            player_name = anchor.get_text(strip=True)
            jersey_number = _parse_int(jersey_raw)
            position = positions_by_player.get(player_name)

            players.append(
                LineupPlayer(
                    player_id=player_id,
                    player_name=player_name,
                    team_id=team["id"],
                    is_starting=is_starter,
                    jersey_number=jersey_number,
                    position=position,
                )
            )

    logger.debug("Match %s: %s lineup rows", match_id, len(players))
    return players


def parse_match_page(
    client: Union[FbrefHttpClient, LocalHtmlClient],
    match_url: str,
    *,
    html: Optional[str] = None,
) -> MatchPageData:
    """Fetch and parse a single FBref match report."""
    if html is None:
        html = client.get(match_url, referer=DEFAULT_SCHEDULE_URL)
    soup = _soup(html)

    match_id = _extract_id(MATCH_ID_RE, match_url)
    if not match_id:
        raise ValueError(f"Could not parse match id from URL: {match_url}")

    teams = _parse_scorebox_teams(soup)
    if len(teams) < 2:
        raise RuntimeError(f"Could not parse home/away teams for {match_url}")

    meta = _parse_scorebox_meta(soup)
    home_mgr, away_mgr = _parse_managers(soup)
    lineups = _parse_lineup_tables(soup, teams, match_id)

    return MatchPageData(
        match_id=match_id,
        match_url=match_url,
        date=meta.get("date"),
        kickoff_time=meta.get("time"),
        venue=meta.get("venue"),
        home_team_id=teams[0]["id"],
        home_team_name=teams[0]["name"],
        away_team_id=teams[1]["id"],
        away_team_name=teams[1]["name"],
        attendance=meta.get("attendance"),
        referee=meta.get("referee"),
        home_manager=home_mgr,
        away_manager=away_mgr,
        lineups=lineups,
    )


# ---------------------------------------------------------------------------
# Supabase upserts
# ---------------------------------------------------------------------------


def _iso_date(value: Optional[date]) -> Optional[str]:
    return value.isoformat() if value else None


def _iso_time(value: Optional[dt_time]) -> Optional[str]:
    return value.isoformat(timespec="seconds") if value else None


def upsert_to_supabase(supabase: Client, bundle: ScrapeBundle, dry_run: bool = False) -> None:
    """Upsert scraped entities using unique constraints for idempotent runs."""
    if dry_run:
        logger.info(
            "Dry run — would upsert teams=%s players=%s managers=%s matches=%s lineups=%s",
            len(bundle.teams),
            len(bundle.players),
            len(bundle.managers),
            len(bundle.matches),
            len(bundle.lineups),
        )
        return

    team_rows = [{"id": tid, "name": name} for tid, name in bundle.teams.items()]
    if team_rows:
        resp = (
            supabase.table("teams")
            .upsert(team_rows, on_conflict="id")
            .execute()
        )
        logger.info("Upserted %s teams (response rows: %s)", len(team_rows), len(resp.data or []))

    player_rows = list(bundle.players.values())
    if player_rows:
        resp = (
            supabase.table("players")
            .upsert(player_rows, on_conflict="id")
            .execute()
        )
        logger.info("Upserted %s players", len(player_rows))

    manager_ids: dict[tuple[str, str], int] = dict(bundle.manager_key_to_id)
    if bundle.managers:
        (
            supabase.table("managers")
            .upsert(bundle.managers, on_conflict="name,team_id")
            .execute()
        )
        lookup = supabase.table("managers").select("id, name, team_id").execute()
        for row in lookup.data or []:
            manager_ids[(row["name"], row["team_id"])] = row["id"]
        logger.info("Upserted %s managers", len(bundle.managers))

    # Resolve manager ids for matches
    for match in bundle.matches:
        for side, prefix in (("home", "home"), ("away", "away")):
            mgr_name = match.pop(f"_{prefix}_manager_name", None)
            team_id = match.get(f"{prefix}_team_id")
            if mgr_name and team_id:
                mid = manager_ids.get((mgr_name, team_id))
                if mid:
                    match[f"{prefix}_manager_id"] = mid

    if bundle.matches:
        resp = (
            supabase.table("matches")
            .upsert(bundle.matches, on_conflict="id")
            .execute()
        )
        logger.info("Upserted %s matches", len(bundle.matches))

    if bundle.lineups:
        resp = (
            supabase.table("lineups")
            .upsert(bundle.lineups, on_conflict="match_id,player_id,team_id")
            .execute()
        )
        logger.info("Upserted %s lineup rows", len(bundle.lineups))


def _build_bundle(
    schedule_rows: list[ScheduleRow],
    match_pages: list[MatchPageData],
) -> ScrapeBundle:
    bundle = ScrapeBundle(teams={}, players={}, managers=[], matches=[], lineups=[])

    def add_team(team_id: Optional[str], name: Optional[str]) -> None:
        if team_id and name:
            bundle.teams[team_id] = name

    for row in schedule_rows:
        add_team(row.home_team_id, row.home_team_name)
        add_team(row.away_team_id, row.away_team_name)
        if not row.match_id or not row.home_team_id or not row.away_team_id:
            continue
        bundle.matches.append(
            {
                "id": row.match_id,
                "date": _iso_date(row.date),
                "time": _iso_time(row.kickoff_time),
                "venue": row.venue,
                "home_team_id": row.home_team_id,
                "away_team_id": row.away_team_id,
                "attendance": row.attendance,
                "referee": row.referee,
            }
        )

    for page in match_pages:
        add_team(page.home_team_id, page.home_team_name)
        add_team(page.away_team_id, page.away_team_name)
        match_row: dict[str, Any] = {
            "id": page.match_id,
            "date": _iso_date(page.date),
            "time": _iso_time(page.kickoff_time),
            "venue": page.venue,
            "home_team_id": page.home_team_id,
            "away_team_id": page.away_team_id,
            "attendance": page.attendance,
            "referee": page.referee,
        }
        if page.home_manager:
            match_row["_home_manager_name"] = page.home_manager.name
            bundle.managers.append(
                {"name": page.home_manager.name, "team_id": page.home_team_id}
            )
        if page.away_manager:
            match_row["_away_manager_name"] = page.away_manager.name
            bundle.managers.append(
                {"name": page.away_manager.name, "team_id": page.away_team_id}
            )
        bundle.matches.append(match_row)

        for lp in page.lineups:
            bundle.players[lp.player_id] = {
                "id": lp.player_id,
                "name": lp.player_name,
                "current_team_id": lp.team_id,
            }
            bundle.lineups.append(
                {
                    "id": _lineup_uuid(page.match_id, lp.player_id, lp.team_id),
                    "match_id": page.match_id,
                    "player_id": lp.player_id,
                    "team_id": lp.team_id,
                    "is_starting": lp.is_starting,
                    "jersey_number": lp.jersey_number,
                    "position": lp.position,
                }
            )

    # Deduplicate managers
    unique_mgrs: dict[tuple[str, str], dict[str, Any]] = {}
    for mgr in bundle.managers:
        unique_mgrs[(mgr["name"], mgr["team_id"])] = mgr
    bundle.managers = list(unique_mgrs.values())

    # Deduplicate matches (match pages override schedule stubs)
    by_id: dict[str, dict[str, Any]] = {}
    for m in bundle.matches:
        by_id[m["id"]] = {**by_id.get(m["id"], {}), **m}
    bundle.matches = list(by_id.values())

    return bundle


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def create_supabase_client() -> Client:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (
        os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()
    if not url or not key:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_KEY (service role recommended for upserts)."
        )
    return create_client(url, key)


def test_fetch(
    schedule_url: str,
    *,
    schedule_html_path: Optional[Path] = None,
    cookies_file: Optional[str] = None,
    impersonate: str = "chrome131",
) -> None:
    """Fetch or parse schedule only and print a short summary (no Supabase)."""
    if schedule_html_path:
        path = _resolve_existing_file(schedule_html_path, label="Schedule HTML file")
        logger.info("Parsing local schedule file (no HTTP): %s", path)
        html = path.read_text(encoding="utf-8", errors="replace")
        rows = parse_schedule_html(html, source=str(path))
    else:
        cookie_header = _load_cookie_header(cookies_file)
        client = FbrefHttpClient(impersonate=impersonate, cookie_header=cookie_header)
        rows = get_match_urls(client, schedule_url=schedule_url)
    with_pages = [r for r in rows if r.match_url]
    print(
        f"OK — parsed {len(rows)} schedule rows, {len(with_pages)} with match page URLs, "
        f"{sum(1 for r in rows if r.match_id)} total fixture ids."
    )
    if rows[:3]:
        sample = rows[0]
        print(
            f"Sample: {sample.home_team_name} vs {sample.away_team_name} "
            f"({sample.date}) venue={sample.venue!r}"
        )


def run(
    schedule_url: str,
    max_matches: Optional[int],
    dry_run: bool,
    skip_match_pages: bool,
    *,
    schedule_html_path: Optional[Path] = None,
    match_html_dir: Optional[Path] = None,
    cookies_file: Optional[str] = None,
    impersonate: str = "chrome131",
    test_fetch_only: bool = False,
) -> None:
    if test_fetch_only:
        test_fetch(
            schedule_url,
            schedule_html_path=schedule_html_path,
            cookies_file=cookies_file,
            impersonate=impersonate,
        )
        return
    cookie_header = _load_cookie_header(cookies_file)
    if schedule_html_path:
        path = _resolve_existing_file(schedule_html_path, label="Schedule HTML file")
        schedule_html = path.read_text(encoding="utf-8", errors="replace")
        http_client: Union[FbrefHttpClient, LocalHtmlClient] = LocalHtmlClient(
            match_html_dir=match_html_dir
        )
        schedule_rows = get_match_urls(
            http_client, schedule_html=schedule_html
        )
    else:
        http_client = FbrefHttpClient(
            impersonate=impersonate,
            cookie_header=cookie_header,
        )
        if not cookie_header:
            logger.warning(
                "No FBREF_COOKIES set — Cloudflare may block requests. "
                "See script docstring if you get 403."
            )
        schedule_rows = get_match_urls(http_client, schedule_url=schedule_url)

    report_rows = [r for r in schedule_rows if r.match_url]
    if max_matches is not None:
        report_rows = report_rows[:max_matches]

    match_pages: list[MatchPageData] = []
    if not skip_match_pages:
        match_client: Union[FbrefHttpClient, LocalHtmlClient]
        if schedule_html_path:
            if not match_html_dir:
                logger.warning(
                    "No --match-html-dir; skipping match reports (schedule-only)."
                )
                report_rows = []
            match_client = LocalHtmlClient(match_html_dir=match_html_dir)
        else:
            match_client = http_client

        for index, row in enumerate(report_rows, start=1):
            assert row.match_url
            logger.info(
                "[%s/%s] Parsing match report %s",
                index,
                len(report_rows),
                row.match_url,
            )
            try:
                match_pages.append(parse_match_page(match_client, row.match_url))
            except Exception:
                logger.exception("Failed to parse match %s", row.match_url)

    bundle = _build_bundle(schedule_rows, match_pages)
    supabase = create_supabase_client()
    upsert_to_supabase(supabase, bundle, dry_run=dry_run)
    logger.info("Scrape complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--schedule-url",
        default=DEFAULT_SCHEDULE_URL,
        help="FBref World Cup schedule URL",
    )
    parser.add_argument(
        "--max-matches",
        type=int,
        default=None,
        help="Limit match report pages fetched (for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse only; do not write to Supabase",
    )
    parser.add_argument(
        "--skip-match-pages",
        action="store_true",
        help="Only scrape schedule (fixtures), not lineups/managers",
    )
    parser.add_argument(
        "--schedule-html",
        type=Path,
        default=None,
        metavar="PATH",
        help="Parse schedule from a saved HTML file (bypasses Cloudflare)",
    )
    parser.add_argument(
        "--match-html-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help="Directory of saved match pages named <match_id>.html",
    )
    parser.add_argument(
        "--cookies-file",
        default=None,
        metavar="PATH",
        help="File with Cookie header value (or set FBREF_COOKIES)",
    )
    parser.add_argument(
        "--impersonate",
        default="chrome131",
        help="curl_cffi browser profile (default: chrome131)",
    )
    parser.add_argument(
        "--test-fetch",
        action="store_true",
        help="Only fetch/parse schedule and print summary (no Supabase)",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()
    if args.schedule_html is None and DEFAULT_SCHEDULE_HTML.is_file():
        args.schedule_html = DEFAULT_SCHEDULE_HTML

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    if args.schedule_html == DEFAULT_SCHEDULE_HTML:
        logger.info("Using default schedule HTML: %s", args.schedule_html)

    try:
        run(
            schedule_url=args.schedule_url,
            max_matches=args.max_matches,
            dry_run=args.dry_run,
            skip_match_pages=args.skip_match_pages,
            schedule_html_path=args.schedule_html,
            match_html_dir=args.match_html_dir,
            cookies_file=args.cookies_file,
            impersonate=args.impersonate,
            test_fetch_only=args.test_fetch,
        )
    except FbrefAccessError as exc:
        logger.error("%s", exc)
        sys.exit(1)
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        sys.exit(130)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Fetch / backfill match-level PPDA and PPDA Allowed into glpm_match_team_stats.

Understat leagues (native PPDA): Premier League, Bundesliga, Serie A.
Proxy leagues (SportMonks formula already on rows): Championship, Eredivisie —
  backfill ppda_allowed from the sibling team's ppda.

Usage:
  python3 scripts/glpm_fetch_ppda.py --dry-run
  python3 scripts/glpm_fetch_ppda.py --league epl --season-id 25583
  python3 scripts/glpm_fetch_ppda.py --league all --since-date 2026-08-01
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[1]

# Understat AJAX API (post site redesign).
UNDERSTAT_BASE = "https://understat.com"
UNDERSTAT_UA = (
    "Mozilla/5.0 (compatible; match-predictor-ppda/1.0; +https://github.com/local)"
)

# SportMonks league_sm_id → Understat slug + default season start year helpers.
UNDERSTAT_LEAGUES: dict[str, dict[str, Any]] = {
    "epl": {
        "keys": ("epl", "pl", "premier_league", "8"),
        "understat": "EPL",
        "league_sm_id": 8,
        "label": "Premier League",
    },
    "bundesliga": {
        "keys": ("bundesliga", "bl", "82"),
        "understat": "Bundesliga",
        "league_sm_id": 82,
        "label": "Bundesliga",
    },
    "serie_a": {
        "keys": ("serie_a", "seriea", "sa", "384"),
        "understat": "Serie_A",
        "league_sm_id": 384,
        "label": "Serie A",
    },
}

PROXY_LEAGUES: dict[str, dict[str, Any]] = {
    "championship": {
        "keys": ("championship", "champ", "9"),
        "league_sm_id": 9,
        "label": "Championship",
    },
    "eredivisie": {
        "keys": ("eredivisie", "ered", "72"),
        "league_sm_id": 72,
        "label": "Eredivisie",
    },
}

# Understat title → glpm_teams.name / official_name (extend as needed).
TEAM_NAME_MAP: dict[str, str] = {
    # EPL
    "Arsenal": "Arsenal",
    "Aston Villa": "Aston Villa",
    "Bournemouth": "AFC Bournemouth",
    "Brentford": "Brentford",
    "Brighton": "Brighton & Hove Albion",
    "Burnley": "Burnley",
    "Chelsea": "Chelsea",
    "Crystal Palace": "Crystal Palace",
    "Everton": "Everton",
    "Fulham": "Fulham",
    "Leeds": "Leeds United",
    "Liverpool": "Liverpool",
    "Manchester City": "Manchester City",
    "Manchester United": "Manchester United",
    "Newcastle United": "Newcastle United",
    "Nottingham Forest": "Nottingham Forest",
    "Sunderland": "Sunderland",
    "Tottenham": "Tottenham Hotspur",
    "West Ham": "West Ham United",
    "Wolverhampton Wanderers": "Wolverhampton Wanderers",
    # Bundesliga
    "Bayern Munich": "FC Bayern München",
    "Bayern Munchen": "FC Bayern München",
    "RasenBallsport Leipzig": "RB Leipzig",
    "Borussia Dortmund": "Borussia Dortmund",
    "RB Leipzig": "RB Leipzig",
    "Bayer Leverkusen": "Bayer 04 Leverkusen",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "VfB Stuttgart": "VfB Stuttgart",
    "Wolfsburg": "VfL Wolfsburg",
    "Hoffenheim": "TSG Hoffenheim",
    "Freiburg": "SC Freiburg",
    "Werder Bremen": "Werder Bremen",
    "Mainz 05": "FSV Mainz 05",
    "Augsburg": "FC Augsburg",
    "Union Berlin": "Union Berlin",
    "Borussia M.Gladbach": "Borussia Mönchengladbach",
    "Cologne": "1. FC Köln",
    "FC Cologne": "1. FC Köln",
    "Heidenheim": "1. FC Heidenheim",
    "St. Pauli": "FC St. Pauli",
    "Holstein Kiel": "Holstein Kiel",
    "Hamburger SV": "Hamburger SV",
    "Hamburg": "Hamburger SV",
    "Darmstadt": "Darmstadt 98",
    # Serie A
    "Inter": "Inter",
    "Milan": "Milan",
    "Juventus": "Juventus",
    "Napoli": "Napoli",
    "Atalanta": "Atalanta",
    "Roma": "Roma",
    "Lazio": "Lazio",
    "Fiorentina": "Fiorentina",
    "Bologna": "Bologna",
    "Torino": "Torino",
    "Udinese": "Udinese",
    "Genoa": "Genoa",
    "Cagliari": "Cagliari",
    "Empoli": "Empoli",
    "Lecce": "Lecce",
    "Monza": "Monza",
    "Parma Calcio 1913": "Parma",
    "Venezia": "Venezia",
    "Como": "Como",
    "Verona": "Hellas Verona",
}


@dataclass(frozen=True)
class UnderstatTeamMatch:
    understat_match_id: int
    match_date: str  # YYYY-MM-DD
    team_title: str
    is_home: bool
    home_title: str
    away_title: str
    ppda: Optional[float]
    ppda_allowed: Optional[float]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    for k, v in os.environ.items():
        env.setdefault(k, v)
    return env


def supabase_url(env: dict[str, str]) -> str:
    raw = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
    if not raw:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL")
    return raw.rstrip("/").removesuffix("/rest/v1")


def supabase_key(env: dict[str, str]) -> str:
    key = (
        env.get("SUPABASE_SERVICE_ROLE_KEY")
        or env.get("SUPABASE_KEY")
        or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if not key:
        raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY")
    return key


def rest(
    env: dict[str, str],
    method: str,
    path: str,
    body: Any = None,
    *,
    prefer: str | None = None,
) -> Any:
    base = supabase_url(env)
    key = supabase_key(env)
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/rest/v1/{path}", data=data, headers=headers, method=method
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"{method} {path} -> {e.code}: {e.read().decode()[:800]}"
        ) from e


def normalize_team_name(name: str) -> str:
    s = name.strip().lower()
    # Fold common diacritics so München ≈ Munich lookups still work after mapping.
    for src, dst in (
        ("ä", "a"),
        ("ö", "o"),
        ("ü", "u"),
        ("ß", "ss"),
        ("é", "e"),
        ("è", "e"),
        ("á", "a"),
        ("ó", "o"),
        ("í", "i"),
        ("ú", "u"),
        ("ñ", "n"),
    ):
        s = s.replace(src, dst)
    s = re.sub(r"\b(fc|afc|cf|sc|ac|fsv|tsg|vfl|vfb|sv|bsc)\b\.?", "", s)
    s = s.replace("&", "and")
    s = re.sub(r"\b\d+\b", " ", s)  # drop shirt/club numbers (04, 05, 1.)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def ppda_ratio(raw: Any) -> Optional[float]:
    """Convert Understat ppda / ppda_allowed ({att, def} or number) to float."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        v = float(raw)
        return round(v, 4) if v > 0 and v == v else None
    if isinstance(raw, dict):
        att = raw.get("att")
        de = raw.get("def")
        try:
            att_f = float(att)
            def_f = float(de)
        except (TypeError, ValueError):
            return None
        if def_f == 0:
            return None
        return round(att_f / def_f, 4)
    return None


def compute_ppda_proxy(
    opp_passes: Optional[float],
    tackles: Optional[float],
    interceptions: Optional[float],
    clearances: Optional[float],
) -> Optional[float]:
    """SportMonks proxy: opponent passes / max(1, own defensive actions)."""
    if opp_passes is None:
        return None
    parts = [tackles, interceptions, clearances]
    if all(p is None for p in parts):
        return None
    defensive = sum(float(p or 0) for p in parts)
    if defensive <= 0:
        return None
    return round(float(opp_passes) / max(1.0, defensive), 4)


def resolve_league_key(raw: str) -> tuple[str, str]:
    """Return (kind, canonical_key) where kind is understat|proxy."""
    needle = raw.strip().lower().replace("-", "_").replace(" ", "_")
    for key, meta in UNDERSTAT_LEAGUES.items():
        if needle == key or needle in meta["keys"] or needle == str(meta["league_sm_id"]):
            return "understat", key
    for key, meta in PROXY_LEAGUES.items():
        if needle == key or needle in meta["keys"] or needle == str(meta["league_sm_id"]):
            return "proxy", key
    if needle in ("all", "*"):
        return "all", "all"
    raise SystemExit(f"Unknown league: {raw}")


def understat_season_year(season_id: Optional[int], since_date: Optional[str]) -> int:
    """Map to Understat season start year (e.g. 2025 for 2025/26)."""
    if since_date:
        y = int(since_date[:4])
        m = int(since_date[5:7])
        return y if m >= 7 else y - 1
    # Prefer calendar year around mid-season.
    today = date.today()
    return today.year if today.month >= 7 else today.year - 1


def fetch_understat_league(slug: str, season_year: int) -> dict[str, Any]:
    """GET /getLeagueData/{slug}/{year} after warming cookies on the league page."""
    import gzip
    import zlib

    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(),
        urllib.request.HTTPSHandler(context=ctx),
    )
    headers = {
        "User-Agent": UNDERSTAT_UA,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Encoding": "gzip, deflate",
        "Referer": f"{UNDERSTAT_BASE}/league/{slug}/{season_year}",
    }

    def _read_body(resp: Any) -> bytes:
        raw = resp.read()
        encoding = (resp.headers.get("Content-Encoding") or "").lower()
        if encoding == "gzip" or raw[:2] == b"\x1f\x8b":
            return gzip.decompress(raw)
        if encoding == "deflate":
            try:
                return zlib.decompress(raw)
            except zlib.error:
                return zlib.decompress(raw, -zlib.MAX_WBITS)
        return raw

    # Warm session / cookies.
    warm = urllib.request.Request(
        f"{UNDERSTAT_BASE}/league/{slug}/{season_year}",
        headers={"User-Agent": UNDERSTAT_UA, "Accept-Encoding": "gzip, deflate"},
    )
    with opener.open(warm, timeout=60) as resp:
        _read_body(resp)

    api = urllib.request.Request(
        f"{UNDERSTAT_BASE}/getLeagueData/{slug}/{season_year}",
        headers=headers,
    )
    with opener.open(api, timeout=60) as resp:
        raw = _read_body(resp).decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise RuntimeError(f"Unexpected Understat payload for {slug}/{season_year}")
    # Normalize keys for older/newer shapes.
    return {
        "dates": data.get("dates") or data.get("datesData") or [],
        "teams": data.get("teams") or data.get("teamsData") or {},
        "players": data.get("players") or data.get("playersData") or [],
    }


def parse_understat_team_matches(payload: dict[str, Any]) -> list[UnderstatTeamMatch]:
    dates = payload.get("dates") or []
    teams = payload.get("teams") or {}

    # (date_str, understat_team_id) -> match_id + home/away titles
    schedule: dict[tuple[str, int], dict[str, Any]] = {}
    for match in dates:
        try:
            match_id = int(match["id"])
            dt = str(match.get("datetime") or match.get("date") or "")
            home = match["h"]
            away = match["a"]
            home_id = int(home["id"])
            away_id = int(away["id"])
            home_title = str(home.get("title") or "")
            away_title = str(away.get("title") or "")
        except (KeyError, TypeError, ValueError):
            continue
        schedule[(dt, home_id)] = {
            "match_id": match_id,
            "home_title": home_title,
            "away_title": away_title,
            "is_home": True,
        }
        schedule[(dt, away_id)] = {
            "match_id": match_id,
            "home_title": home_title,
            "away_title": away_title,
            "is_home": False,
        }

    out: list[UnderstatTeamMatch] = []
    team_iter = teams.values() if isinstance(teams, dict) else teams
    for team in team_iter:
        try:
            team_id = int(team["id"])
            title = str(team.get("title") or "")
        except (KeyError, TypeError, ValueError):
            continue
        for hist in team.get("history") or []:
            match_date_raw = str(hist.get("date") or "")
            meta = schedule.get((match_date_raw, team_id))
            if not meta:
                # Fallback: date-only key match (± ignore time drift by prefix).
                day = match_date_raw[:10]
                meta = next(
                    (
                        v
                        for (k_dt, k_tid), v in schedule.items()
                        if k_tid == team_id and str(k_dt).startswith(day)
                    ),
                    None,
                )
            if not meta:
                continue
            is_home = bool(meta["is_home"]) if hist.get("h_a") is None else hist.get("h_a") == "h"
            day = match_date_raw[:10]
            out.append(
                UnderstatTeamMatch(
                    understat_match_id=int(meta["match_id"]),
                    match_date=day,
                    team_title=title,
                    is_home=is_home,
                    home_title=str(meta["home_title"]),
                    away_title=str(meta["away_title"]),
                    ppda=ppda_ratio(hist.get("ppda")),
                    ppda_allowed=ppda_ratio(hist.get("ppda_allowed")),
                )
            )
    return out


def load_glpm_teams(env: dict[str, str]) -> list[dict[str, Any]]:
    rows = rest(
        env,
        "GET",
        "glpm_teams?select=sm_id,name,official_name&sm_id=not.is.null",
    )
    return rows or []


def build_team_lookup(teams: list[dict[str, Any]]) -> dict[str, int]:
    lookup: dict[str, int] = {}
    for t in teams:
        sm_id = t.get("sm_id")
        if sm_id is None:
            continue
        for key in (t.get("name"), t.get("official_name")):
            if not key:
                continue
            lookup[normalize_team_name(str(key))] = int(sm_id)
    for understat_name, glpm_name in TEAM_NAME_MAP.items():
        sm = None
        for candidate in (understat_name, glpm_name):
            sm = lookup.get(normalize_team_name(candidate))
            if sm is not None:
                break
        if sm is None:
            continue
        lookup[normalize_team_name(understat_name)] = sm
        lookup[normalize_team_name(glpm_name)] = sm
    return lookup


def resolve_team_sm_id(lookup: dict[str, int], title: str) -> Optional[int]:
    mapped = TEAM_NAME_MAP.get(title, title)
    for candidate in (title, mapped):
        sm = lookup.get(normalize_team_name(candidate))
        if sm is not None:
            return sm
    return None


def load_finished_matches(
    env: dict[str, str],
    *,
    league_sm_id: int,
    season_id: Optional[int],
    since_date: Optional[str],
) -> list[dict[str, Any]]:
    parts = [
        "select=sm_id,season_id,league_sm_id,match_date,home_team_sm_id,away_team_sm_id,home_score,away_score,status",
        f"league_sm_id=eq.{league_sm_id}",
        "home_score=not.is.null",
        "away_score=not.is.null",
        "order=match_date.asc",
    ]
    if season_id is not None:
        parts.append(f"season_id=eq.{season_id}")
    if since_date:
        parts.append(f"match_date=gte.{since_date}")
    return rest(env, "GET", "glpm_matches?" + "&".join(parts)) or []


def match_understat_to_glpm(
    rows: list[UnderstatTeamMatch],
    matches: list[dict[str, Any]],
    team_lookup: dict[str, int],
    *,
    date_slack_days: int = 1,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Return upsert patches and unmatched log lines."""
    by_date: dict[str, list[dict[str, Any]]] = {}
    for m in matches:
        d = str(m.get("match_date") or "")[:10]
        by_date.setdefault(d, []).append(m)

    # Group Understat rows by understat match id so we have both sides' titles.
    by_us_match: dict[int, list[UnderstatTeamMatch]] = {}
    for r in rows:
        by_us_match.setdefault(r.understat_match_id, []).append(r)

    patches: list[dict[str, Any]] = []
    unmatched: list[str] = []
    seen_keys: set[tuple[int, int]] = set()

    for us_id, sides in by_us_match.items():
        sample = sides[0]
        home_sm = resolve_team_sm_id(team_lookup, sample.home_title)
        away_sm = resolve_team_sm_id(team_lookup, sample.away_title)
        if home_sm is None or away_sm is None:
            unmatched.append(
                f"teams unmatched us_match={us_id} "
                f"{sample.home_title} vs {sample.away_title}"
            )
            continue

        candidates: list[dict[str, Any]] = []
        base = datetime.strptime(sample.match_date, "%Y-%m-%d").date()
        for delta in range(-date_slack_days, date_slack_days + 1):
            day = (base + timedelta(days=delta)).isoformat()
            for m in by_date.get(day, []):
                if int(m["home_team_sm_id"]) == home_sm and int(m["away_team_sm_id"]) == away_sm:
                    candidates.append(m)
        if not candidates:
            unmatched.append(
                f"fixture unmatched us_match={us_id} {sample.match_date} "
                f"{sample.home_title} vs {sample.away_title}"
            )
            continue
        glpm = candidates[0]
        match_sm_id = int(glpm["sm_id"])

        for side in sides:
            team_sm = home_sm if side.is_home else away_sm
            key = (match_sm_id, team_sm)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            if side.ppda is None and side.ppda_allowed is None:
                continue
            patches.append(
                {
                    "match_sm_id": match_sm_id,
                    "team_sm_id": team_sm,
                    "is_home": side.is_home,
                    "ppda": side.ppda,
                    "ppda_allowed": side.ppda_allowed,
                    "ppda_source": "understat",
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }
            )
    return patches, unmatched


def upsert_ppda_patches(
    env: dict[str, str],
    patches: list[dict[str, Any]],
    *,
    dry_run: bool,
) -> int:
    if not patches:
        return 0
    if dry_run:
        return len(patches)
    # Partial upsert: only touch PPDA columns; require existing L1 rows.
    # PostgREST merge-duplicates needs full PK; we PATCH per row to avoid wiping other stats.
    updated = 0
    for row in patches:
        match_sm_id = row["match_sm_id"]
        team_sm_id = row["team_sm_id"]
        body = {
            "ppda": row.get("ppda"),
            "ppda_allowed": row.get("ppda_allowed"),
            "ppda_source": row.get("ppda_source"),
            "synced_at": row.get("synced_at"),
        }
        # Drop Nones so we don't null out existing values accidentally except allowed.
        body = {k: v for k, v in body.items() if v is not None}
        path = (
            f"glpm_match_team_stats?match_sm_id=eq.{match_sm_id}"
            f"&team_sm_id=eq.{team_sm_id}"
        )
        rest(env, "PATCH", path, body, prefer="return=minimal")
        updated += 1
    return updated


def backfill_proxy_ppda_allowed(
    env: dict[str, str],
    *,
    league_sm_id: int,
    season_id: Optional[int],
    since_date: Optional[str],
    dry_run: bool,
) -> tuple[int, int]:
    """Set ppda_allowed from sibling team ppda; optionally fill null ppda via proxy."""
    matches = load_finished_matches(
        env,
        league_sm_id=league_sm_id,
        season_id=season_id,
        since_date=since_date,
    )
    if not matches:
        return 0, 0
    match_ids = [int(m["sm_id"]) for m in matches]
    # Chunk IN filter.
    stats_rows: list[dict[str, Any]] = []
    chunk = 80
    for i in range(0, len(match_ids), chunk):
        ids = match_ids[i : i + chunk]
        id_list = ",".join(str(x) for x in ids)
        batch = rest(
            env,
            "GET",
            "glpm_match_team_stats?"
            f"select=match_sm_id,team_sm_id,is_home,ppda,ppda_source,"
            f"tackles,interceptions,clearances,passes"
            f"&match_sm_id=in.({id_list})",
        )
        stats_rows.extend(batch or [])

    by_match: dict[int, list[dict[str, Any]]] = {}
    for r in stats_rows:
        by_match.setdefault(int(r["match_sm_id"]), []).append(r)

    patches: list[dict[str, Any]] = []
    for match_sm_id, sides in by_match.items():
        if len(sides) != 2:
            continue
        a, b = sides[0], sides[1]
        # Fill missing ppda with proxy using sibling passes.
        for own, opp in ((a, b), (b, a)):
            if own.get("ppda") is None:
                proxy = compute_ppda_proxy(
                    opp.get("passes"),
                    own.get("tackles"),
                    own.get("interceptions"),
                    own.get("clearances"),
                )
                if proxy is not None:
                    own["ppda"] = proxy
                    own["_set_ppda"] = True
                    own["_set_source"] = "sportmonks_proxy"
        # ppda_allowed = opponent ppda
        for own, opp in ((a, b), (b, a)):
            need_allowed = own.get("ppda_allowed") is None and opp.get("ppda") is not None
            need_ppda = bool(own.get("_set_ppda"))
            if not need_allowed and not need_ppda:
                continue
            patch: dict[str, Any] = {
                "match_sm_id": match_sm_id,
                "team_sm_id": int(own["team_sm_id"]),
                "is_home": bool(own.get("is_home")),
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            if need_ppda:
                patch["ppda"] = own["ppda"]
                patch["ppda_source"] = own.get("_set_source") or "sportmonks_proxy"
            if need_allowed:
                patch["ppda_allowed"] = float(opp["ppda"])
            # Keep existing source unless we just set proxy ppda.
            if "ppda_source" not in patch and own.get("ppda_source"):
                pass
            patches.append(patch)

    updated = upsert_ppda_patches(env, patches, dry_run=dry_run)
    return len(matches), updated


def run_understat_league(
    env: dict[str, str],
    *,
    league_key: str,
    season_id: Optional[int],
    since_date: Optional[str],
    season_year: Optional[int],
    dry_run: bool,
) -> dict[str, Any]:
    meta = UNDERSTAT_LEAGUES[league_key]
    year = season_year or understat_season_year(season_id, since_date)
    payload = fetch_understat_league(meta["understat"], year)
    us_rows = parse_understat_team_matches(payload)
    if since_date:
        us_rows = [r for r in us_rows if r.match_date >= since_date]

    teams = load_glpm_teams(env)
    lookup = build_team_lookup(teams)
    matches = load_finished_matches(
        env,
        league_sm_id=int(meta["league_sm_id"]),
        season_id=season_id,
        since_date=since_date,
    )
    patches, unmatched = match_understat_to_glpm(us_rows, matches, lookup)
    updated = upsert_ppda_patches(env, patches, dry_run=dry_run)
    return {
        "league": meta["label"],
        "understat": meta["understat"],
        "season_year": year,
        "understat_rows": len(us_rows),
        "glpm_matches": len(matches),
        "patches": len(patches),
        "updated": updated,
        "unmatched": unmatched[:25],
        "unmatched_count": len(unmatched),
        "sample": patches[:3],
        "dry_run": dry_run,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--league",
        default="all",
        help="epl|bundesliga|serie_a|championship|eredivisie|all",
    )
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--season-year", type=int, default=None, help="Understat start year")
    parser.add_argument("--since-date", default=None, help="YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = load_env()
    kind, key = resolve_league_key(args.league)
    summaries: list[dict[str, Any]] = []

    targets: list[tuple[str, str]] = []
    if kind == "all":
        for k in UNDERSTAT_LEAGUES:
            targets.append(("understat", k))
        for k in PROXY_LEAGUES:
            targets.append(("proxy", k))
    else:
        targets.append((kind, key))

    for t_kind, t_key in targets:
        if t_kind == "understat":
            try:
                summary = run_understat_league(
                    env,
                    league_key=t_key,
                    season_id=args.season_id,
                    since_date=args.since_date,
                    season_year=args.season_year,
                    dry_run=args.dry_run,
                )
            except Exception as exc:  # noqa: BLE001 - surface per-league failures
                summary = {
                    "league": UNDERSTAT_LEAGUES[t_key]["label"],
                    "error": str(exc),
                    "dry_run": args.dry_run,
                }
            summaries.append(summary)
            print(json.dumps(summary, indent=2))
        else:
            meta = PROXY_LEAGUES[t_key]
            try:
                n_matches, n_updated = backfill_proxy_ppda_allowed(
                    env,
                    league_sm_id=int(meta["league_sm_id"]),
                    season_id=args.season_id,
                    since_date=args.since_date,
                    dry_run=args.dry_run,
                )
                summary = {
                    "league": meta["label"],
                    "mode": "proxy_backfill",
                    "glpm_matches": n_matches,
                    "updated": n_updated,
                    "dry_run": args.dry_run,
                }
            except Exception as exc:  # noqa: BLE001
                summary = {
                    "league": meta["label"],
                    "mode": "proxy_backfill",
                    "error": str(exc),
                    "dry_run": args.dry_run,
                }
            summaries.append(summary)
            print(json.dumps(summary, indent=2))

    errors = [s for s in summaries if s.get("error")]
    return 1 if errors and len(errors) == len(summaries) else 0


if __name__ == "__main__":
    raise SystemExit(main())

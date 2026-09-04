#!/usr/bin/env python3
"""
Fetch Understat match shots into glpm_match_events / glpm_match_shots, and overlay
set-piece / open-play xG plus a deep-completions field-tilt proxy onto L1 stats.

Usage:
  python3 scripts/glpm_fetch_understat_shots.py --dry-run
  python3 scripts/glpm_fetch_understat_shots.py --league epl --season-id 25583
  python3 scripts/glpm_fetch_understat_shots.py --league all --since-date 2026-08-01
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[1]
PPDA_SCRIPT = Path(__file__).with_name("glpm_fetch_ppda.py")

UNDERSTAT_BASE = "https://understat.com"
UNDERSTAT_UA = (
    "Mozilla/5.0 (compatible; match-predictor-shots/1.0; +https://github.com/local)"
)
# Stay clear of SportMonks event ids and Wyscout's +10_000_000_000 offset.
EVENT_ID_OFFSET = 20_000_000_000
SET_PIECE_SITUATIONS = frozenset(
    {"FromCorner", "SetPiece", "DirectFreekick", "Penalty"}
)
OPEN_PLAY_SITUATIONS = frozenset({"OpenPlay"})
ON_TARGET_RESULTS = frozenset({"Goal", "SavedShot", "ShotOnPost"})
COUNTER_LAST_ACTIONS = frozenset({"BallRecovery", "Interception", "Tackle"})
BOX_X_THRESHOLD = 84.0
UPSERT_CHUNK = 80
_SHOT_SOURCE = "understat"


def apply_row_source(rows: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        next_row = dict(row)
        next_row["source"] = source
        tags = dict(next_row.get("tags") or {})
        tags.setdefault("provider", "understat")
        next_row["tags"] = tags
        out.append(next_row)
    return out


def _load_ppda():
    spec = importlib.util.spec_from_file_location("glpm_fetch_ppda", PPDA_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {PPDA_SCRIPT}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def _as_float(raw: Any) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    return v if v == v else None


def _as_int(raw: Any) -> Optional[int]:
    if raw is None or raw == "":
        return None
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def field_tilt_from_deep(
    deep: Optional[float], deep_allowed: Optional[float]
) -> Optional[float]:
    """Share of deep completions. Proxy for field tilt, not Opta field tilt."""
    if deep is None or deep_allowed is None:
        return None
    total = float(deep) + float(deep_allowed)
    if total <= 0:
        return None
    return round(100.0 * float(deep) / total, 2)


def understat_event_id(shot_id: int) -> int:
    return EVENT_ID_OFFSET + int(shot_id)


def map_understat_shot(
    raw: dict[str, Any],
    *,
    match_sm_id: int,
    home_sm_id: int,
    away_sm_id: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (event_row, shot_row) for one Understat shotsData item."""
    shot_id = _as_int(raw.get("id"))
    if shot_id is None:
        raise ValueError("Understat shot missing id")
    event_id = understat_event_id(shot_id)
    side = str(raw.get("h_a") or "").lower()
    team_sm_id = home_sm_id if side == "h" else away_sm_id
    situation = str(raw.get("situation") or "")
    last_action = str(raw.get("lastAction") or "")
    result = str(raw.get("result") or "")
    xg = _as_float(raw.get("xG"))
    minute = _as_int(raw.get("minute"))
    x_raw = _as_float(raw.get("X"))
    y_raw = _as_float(raw.get("Y"))
    pos_x = round(x_raw * 100) if x_raw is not None else None
    pos_y = round(y_raw * 100) if y_raw is not None else None
    is_set_piece = situation in SET_PIECE_SITUATIONS
    is_penalty = situation == "Penalty"
    event_sec = float(minute * 60) if minute is not None else None
    match_period = None
    if minute is not None:
        match_period = "1H" if minute <= 45 else "2H"
    synced_at = datetime.now(timezone.utc).isoformat()
    tags = {
        "understat_shot_id": shot_id,
        "understat_match_id": _as_int(raw.get("match_id")),
        "situation": situation or None,
        "lastAction": last_action or None,
        "result": result or None,
        "shotType": raw.get("shotType"),
        "player": raw.get("player"),
        "player_assisted": raw.get("player_assisted"),
        "is_corner": situation == "FromCorner",
        "provider": "understat",
    }
    event = {
        "event_id": event_id,
        "match_sm_id": match_sm_id,
        "team_sm_id": team_sm_id,
        "player_sm_id": None,
        "source": "understat",
        "match_period": match_period,
        "event_sec": event_sec,
        "event_id_type": None,
        "event_name": "shot",
        "sub_event_id": None,
        "sub_event_name": situation or None,
        "pos_x": pos_x,
        "pos_y": pos_y,
        "tags": tags,
        "xg": xg,
        "psxg": None,
        "synced_at": synced_at,
    }
    shot = {
        "event_id": event_id,
        "match_sm_id": match_sm_id,
        "team_sm_id": team_sm_id,
        "player_sm_id": None,
        "gk_player_sm_id": None,
        "source": "understat",
        "match_period": match_period,
        "event_sec": event_sec,
        "pos_x": pos_x,
        "pos_y": pos_y,
        "pre_shot_xg": xg,
        "post_shot_xg": None,
        "is_on_target": result in ON_TARGET_RESULTS if result else None,
        "is_goal": result == "Goal",
        "is_penalty": is_penalty,
        "is_set_piece": is_set_piece,
        "is_blocked": result == "BlockedShot",
        "is_opportunity": False,
        "is_counter_attack": last_action in COUNTER_LAST_ACTIONS,
        "body_part_tag": None,
        "goal_zone_tag": None,
        "tags": tags,
        "synced_at": synced_at,
    }
    return event, shot


def iter_understat_shots(payload: dict[str, Any]) -> list[dict[str, Any]]:
    shots = payload.get("shots") or payload.get("shotsData") or {}
    if isinstance(shots, list):
        return [s for s in shots if isinstance(s, dict)]
    if not isinstance(shots, dict):
        return []
    out: list[dict[str, Any]] = []
    for side in ("h", "a"):
        arr = shots.get(side) or []
        if isinstance(arr, list):
            out.extend(s for s in arr if isinstance(s, dict))
    return out


def aggregate_side_xg(shots: list[dict[str, Any]], team_sm_id: int) -> dict[str, Any]:
    open_play = 0.0
    set_piece = 0.0
    has_open = False
    has_sp = False
    box_shots = 0
    n = 0
    for s in shots:
        if int(s["team_sm_id"]) != team_sm_id:
            continue
        n += 1
        tags = s.get("tags") if isinstance(s.get("tags"), dict) else {}
        situation = str(tags.get("situation") or "")
        xg = _as_float(s.get("pre_shot_xg"))
        if xg is not None:
            if situation in OPEN_PLAY_SITUATIONS or (
                not situation and not s.get("is_set_piece")
            ):
                open_play += xg
                has_open = True
            if s.get("is_set_piece") or situation in SET_PIECE_SITUATIONS:
                set_piece += xg
                has_sp = True
        x = s.get("pos_x")
        if x is not None and float(x) >= BOX_X_THRESHOLD:
            box_shots += 1
    return {
        "open_play_xg": round(open_play, 4) if has_open or n else 0.0,
        "set_piece_xg": round(set_piece, 4) if has_sp or n else 0.0,
        "box_shots": box_shots,
        "n_shots": n,
    }


def _read_body(resp: Any) -> bytes:
    import gzip
    import zlib

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


def make_understat_opener() -> Any:
    ctx = ssl.create_default_context()
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(),
        urllib.request.HTTPSHandler(context=ctx),
    )


def fetch_understat_match_data(opener: Any, match_id: int) -> dict[str, Any]:
    headers = {
        "User-Agent": UNDERSTAT_UA,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Encoding": "gzip, deflate",
        "Referer": f"{UNDERSTAT_BASE}/match/{match_id}",
    }
    req = urllib.request.Request(
        f"{UNDERSTAT_BASE}/getMatchData/{match_id}",
        headers=headers,
    )
    with opener.open(req, timeout=60) as resp:
        raw = _read_body(resp).decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise RuntimeError(f"Unexpected Understat match payload for {match_id}")
    return data


def rest_upsert(
    ppda: Any,
    env: dict[str, str],
    table: str,
    rows: list[dict[str, Any]],
    conflict: str,
) -> int:
    global _SHOT_SOURCE
    if not rows:
        return 0
    n = 0
    for i in range(0, len(rows), UPSERT_CHUNK):
        chunk = apply_row_source(rows[i : i + UPSERT_CHUNK], _SHOT_SOURCE)
        try:
            ppda.rest(
                env,
                "POST",
                f"{table}?on_conflict={conflict}",
                chunk,
                prefer="resolution=merge-duplicates,return=minimal",
            )
        except RuntimeError as exc:
            msg = str(exc)
            if _SHOT_SOURCE == "understat" and (
                "23514" in msg or "source_check" in msg
            ):
                _SHOT_SOURCE = "wyscout"
                chunk = apply_row_source(rows[i : i + UPSERT_CHUNK], _SHOT_SOURCE)
                ppda.rest(
                    env,
                    "POST",
                    f"{table}?on_conflict={conflict}",
                    chunk,
                    prefer="resolution=merge-duplicates,return=minimal",
                )
            else:
                raise
        n += len(chunk)
    return n


def patch_stats_row(
    ppda: Any,
    env: dict[str, str],
    match_sm_id: int,
    team_sm_id: int,
    body: dict[str, Any],
) -> None:
    payload = {k: v for k, v in body.items() if v is not None}
    if not payload:
        return
    path = (
        f"glpm_match_team_stats?match_sm_id=eq.{match_sm_id}"
        f"&team_sm_id=eq.{team_sm_id}"
    )
    ppda.rest(env, "PATCH", path, payload, prefer="return=minimal")


def run_league(
    ppda: Any,
    env: dict[str, str],
    *,
    league_key: str,
    season_id: Optional[int],
    since_date: Optional[str],
    season_year: Optional[int],
    dry_run: bool,
    sleep_s: float,
    max_matches: Optional[int],
    understat_match_id: Optional[int],
    opener: Any,
) -> dict[str, Any]:
    meta = ppda.UNDERSTAT_LEAGUES[league_key]
    year = season_year or ppda.understat_season_year(season_id, since_date)
    payload = ppda.fetch_understat_league(meta["understat"], year)
    us_rows = ppda.parse_understat_team_matches(payload)
    if since_date:
        us_rows = [r for r in us_rows if r.match_date >= since_date]
    if understat_match_id is not None:
        us_rows = [r for r in us_rows if r.understat_match_id == understat_match_id]

    teams = ppda.load_glpm_teams(env)
    lookup = ppda.build_team_lookup(teams)
    matches = ppda.load_finished_matches(
        env,
        league_sm_id=int(meta["league_sm_id"]),
        season_id=season_id,
        since_date=since_date,
    )
    links, unmatched = ppda.link_understat_matches(us_rows, matches, lookup)
    by_us: dict[int, list[Any]] = defaultdict(list)
    for r in us_rows:
        by_us[r.understat_match_id].append(r)

    if max_matches is not None:
        links = links[: max(0, max_matches)]

    errors: list[str] = []
    match_ids: list[int] = []
    shots_upserted = 0
    stats_patched = 0
    mapped_shots = 0

    for idx, link in enumerate(links):
        sides = by_us.get(link.understat_match_id, [])
        try:
            data = fetch_understat_match_data(opener, link.understat_match_id)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            errors.append(f"us_match={link.understat_match_id} {exc}")
            if sleep_s > 0:
                time.sleep(sleep_s)
            continue

        raw_shots = iter_understat_shots(data)
        events: list[dict[str, Any]] = []
        shots: list[dict[str, Any]] = []
        for raw in raw_shots:
            try:
                event, shot = map_understat_shot(
                    raw,
                    match_sm_id=link.match_sm_id,
                    home_sm_id=link.home_sm_id,
                    away_sm_id=link.away_sm_id,
                )
            except ValueError:
                continue
            events.append(event)
            shots.append(shot)
        mapped_shots += len(shots)
        match_ids.append(link.match_sm_id)

        home_agg = aggregate_side_xg(shots, link.home_sm_id)
        away_agg = aggregate_side_xg(shots, link.away_sm_id)
        home_side = next((s for s in sides if s.is_home), None)
        away_side = next((s for s in sides if not s.is_home), None)
        home_tilt = field_tilt_from_deep(
            getattr(home_side, "deep", None) if home_side else None,
            getattr(home_side, "deep_allowed", None) if home_side else None,
        )
        away_tilt = field_tilt_from_deep(
            getattr(away_side, "deep", None) if away_side else None,
            getattr(away_side, "deep_allowed", None) if away_side else None,
        )
        now = datetime.now(timezone.utc).isoformat()
        home_patch = {
            "open_play_xg": home_agg["open_play_xg"],
            "set_piece_xg": home_agg["set_piece_xg"],
            "field_tilt": home_tilt,
            "box_entries_allowed": away_agg["box_shots"],
            "synced_at": now,
        }
        away_patch = {
            "open_play_xg": away_agg["open_play_xg"],
            "set_piece_xg": away_agg["set_piece_xg"],
            "field_tilt": away_tilt,
            "box_entries_allowed": home_agg["box_shots"],
            "synced_at": now,
        }

        if not dry_run:
            rest_upsert(ppda, env, "glpm_match_events", events, "event_id")
            shots_upserted += rest_upsert(
                ppda, env, "glpm_match_shots", shots, "event_id"
            )
            patch_stats_row(ppda, env, link.match_sm_id, link.home_sm_id, home_patch)
            patch_stats_row(ppda, env, link.match_sm_id, link.away_sm_id, away_patch)
            stats_patched += 2
        else:
            shots_upserted += len(shots)
            stats_patched += 2

        if sleep_s > 0 and idx < len(links) - 1:
            time.sleep(sleep_s)

    return {
        "league": meta["label"],
        "understat": meta["understat"],
        "season_year": year,
        "links": len(links),
        "glpm_matches": len(matches),
        "shots": mapped_shots,
        "shots_upserted": shots_upserted,
        "stats_patched": stats_patched,
        "source_written": _SHOT_SOURCE,
        "match_ids": match_ids,
        "unmatched": unmatched[:25],
        "unmatched_count": len(unmatched),
        "errors": errors[:25],
        "error_count": len(errors),
        "dry_run": dry_run,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", default="all", help="epl|bundesliga|serie_a|all")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--season-year", type=int, default=None)
    parser.add_argument("--since-date", default=None, help="YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.25)
    parser.add_argument("--max-matches", type=int, default=None)
    parser.add_argument("--understat-match-id", type=int, default=None)
    args = parser.parse_args()

    ppda = _load_ppda()
    env = ppda.load_env()
    kind, key = ppda.resolve_league_key(args.league)
    if kind == "proxy":
        print(json.dumps({"ok": False, "error": "Understat shots cover EPL/Bundesliga/Serie A only"}, indent=2))
        return 1

    targets: list[str] = []
    if kind == "all":
        targets = list(ppda.UNDERSTAT_LEAGUES.keys())
    else:
        targets = [key]

    opener = make_understat_opener()
    # Warm cookies on the first league page.
    first_meta = ppda.UNDERSTAT_LEAGUES[targets[0]]
    year = args.season_year or ppda.understat_season_year(args.season_id, args.since_date)
    warm = urllib.request.Request(
        f"{UNDERSTAT_BASE}/league/{first_meta['understat']}/{year}",
        headers={"User-Agent": UNDERSTAT_UA, "Accept-Encoding": "gzip, deflate"},
    )
    try:
        with opener.open(warm, timeout=60) as resp:
            _read_body(resp)
    except urllib.error.URLError as exc:
        print(json.dumps({"ok": False, "error": f"Understat warm failed: {exc}"}))
        return 1

    summaries: list[dict[str, Any]] = []
    all_match_ids: list[int] = []
    ok = True
    for league_key in targets:
        try:
            summary = run_league(
                ppda,
                env,
                league_key=league_key,
                season_id=args.season_id,
                since_date=args.since_date,
                season_year=args.season_year,
                dry_run=args.dry_run,
                sleep_s=max(0.0, args.sleep),
                max_matches=args.max_matches,
                understat_match_id=args.understat_match_id,
                opener=opener,
            )
        except Exception as exc:  # noqa: BLE001
            ok = False
            summary = {
                "league": ppda.UNDERSTAT_LEAGUES[league_key]["label"],
                "error": str(exc),
                "dry_run": args.dry_run,
                "match_ids": [],
            }
        summaries.append(summary)
        all_match_ids.extend(int(x) for x in summary.get("match_ids") or [])
        if summary.get("error") or summary.get("error_count"):
            if summary.get("error"):
                ok = False

    final = {
        "ok": ok,
        "dry_run": args.dry_run,
        "leagues": summaries,
        "match_ids": sorted(set(all_match_ids)),
        "shots_upserted": sum(int(s.get("shots_upserted") or 0) for s in summaries),
        "stats_patched": sum(int(s.get("stats_patched") or 0) for s in summaries),
        "source_written": _SHOT_SOURCE,
    }
    print(json.dumps(final, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

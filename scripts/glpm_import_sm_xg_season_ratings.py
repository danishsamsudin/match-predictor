#!/usr/bin/env python3
"""
Patch Attack / Defence / Finishing from SportMonks provider xG season aggregates
for Championship and Eredivisie (no Understat coverage).

Requires non-proxy team xG in glpm_match_team_stats (from /expected/fixtures ingest).
Falls back is handled by the TS overlay router (standings GF/GA) when fill is low.

Usage:
  python3 scripts/glpm_import_sm_xg_season_ratings.py --season-id 27903
  python3 scripts/glpm_import_sm_xg_season_ratings.py --all
  python3 scripts/glpm_import_sm_xg_season_ratings.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from glpm_import_understat_season import percentile_scores  # noqa: E402

MODEL_VERSION = "sm_xg_season_v1"
PROVIDER_FILL_BAR = 0.70
EARLY_FULL_MATCHES = 20.0

SEASONS = [
    {
        "key": "eredivisie-2026-sm-xg",
        "label": "Eredivisie",
        "season_sm_id": 27958,
        "competition_sm_id": 72,
        "as_of_date": "2026-09-07",
        "expected_teams": 18,
        "min_matches": 6,
        "data_dir": ROOT / "data" / "sm-xg-ratings" / "eredivisie-2026-27",
    },
    {
        "key": "championship-2026-sm-xg",
        "label": "Championship",
        "season_sm_id": 27903,
        "competition_sm_id": 9,
        "as_of_date": "2026-09-07",
        "expected_teams": 24,
        "min_matches": 6,
        "data_dir": ROOT / "data" / "sm-xg-ratings" / "championship-2026-27",
    },
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k, v in os.environ.items():
        env.setdefault(k, v)
    return env


def rest(
    env: dict[str, str],
    method: str,
    path: str,
    body: Any = None,
    *,
    prefer: str | None = None,
) -> Any:
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = Request(f"{base}/rest/v1/{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:800]}") from e


def _is_proxy_xg(payload: Any) -> bool | None:
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("xg_proxy"), bool):
        return bool(payload["xg_proxy"])
    if isinstance(payload.get("xg_from_proxy"), bool):
        return bool(payload["xg_from_proxy"])
    return None


def build_table_from_provider_xg(
    env: dict[str, str], season_id: int
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    matches = (
        rest(
            env,
            "GET",
            (
                f"glpm_matches?season_id=eq.{season_id}"
                "&home_score=not.is.null&away_score=not.is.null"
                "&select=sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score"
                "&limit=2000"
            ),
        )
        or []
    )
    match_by_id = {int(m["sm_id"]): m for m in matches if m.get("sm_id") is not None}
    match_ids = list(match_by_id.keys())
    meta = {
        "finished_matches": len(match_ids),
        "matches_with_provider_xg": 0,
        "matches_with_proxy_only": 0,
        "provider_fill_rate": 0.0,
    }
    if not match_ids:
        return [], meta

    agg: dict[int, dict[str, float]] = {}
    provider_matches = 0
    proxy_only_matches = 0

    def bump(team: int) -> dict[str, float]:
        if team not in agg:
            agg[team] = {"mp": 0.0, "xg": 0.0, "xga": 0.0, "goals": 0.0, "ga": 0.0}
        return agg[team]

    chunk = 80
    for i in range(0, len(match_ids), chunk):
        slice_ids = match_ids[i : i + chunk]
        ids_csv = ",".join(str(x) for x in slice_ids)
        stats = (
            rest(
                env,
                "GET",
                (
                    "glpm_match_team_stats?"
                    f"match_sm_id=in.({ids_csv})"
                    "&select=match_sm_id,team_sm_id,is_home,goals,xg,xg_conceded,payload"
                    "&limit=500"
                ),
            )
            or []
        )
        by_match: dict[int, list[dict[str, Any]]] = {}
        for row in stats:
            by_match.setdefault(int(row["match_sm_id"]), []).append(row)

        for mid in slice_ids:
            rows = by_match.get(mid, [])
            with_xg = [
                r
                for r in rows
                if r.get("xg") is not None and isinstance(r.get("xg"), (int, float))
            ]
            if not with_xg:
                continue
            proxies = [_is_proxy_xg(r.get("payload")) for r in with_xg]
            any_provider = any(p is False for p in proxies)
            all_proxy = len(proxies) > 0 and all(p is True for p in proxies)
            if not any_provider:
                if all_proxy or any(p is not None for p in proxies):
                    proxy_only_matches += 1
                continue

            provider_matches += 1
            provider_rows = [r for r in with_xg if _is_proxy_xg(r.get("payload")) is not True]
            m = match_by_id.get(mid, {})
            home_id = int(m["home_team_sm_id"]) if m else None
            away_id = int(m["away_team_sm_id"]) if m else None
            hs = int(m["home_score"]) if m else None
            aws = int(m["away_score"]) if m else None

            for r in provider_rows:
                tid = int(r["team_sm_id"])
                s = bump(tid)
                s["mp"] += 1
                s["xg"] += float(r["xg"])
                if isinstance(r.get("goals"), (int, float)):
                    s["goals"] += float(r["goals"])
                xga_val = r.get("xg_conceded")
                if isinstance(xga_val, (int, float)):
                    s["xga"] += float(xga_val)
                else:
                    opp = next(
                        (
                            o
                            for o in provider_rows
                            if int(o["team_sm_id"]) != tid
                            and isinstance(o.get("xg"), (int, float))
                        ),
                        None,
                    )
                    if opp is not None:
                        s["xga"] += float(opp["xg"])
                if home_id is not None and away_id is not None and hs is not None and aws is not None:
                    if tid == home_id:
                        s["ga"] += aws
                    elif tid == away_id:
                        s["ga"] += hs

    meta["matches_with_provider_xg"] = provider_matches
    meta["matches_with_proxy_only"] = proxy_only_matches
    meta["provider_fill_rate"] = provider_matches / len(match_ids) if match_ids else 0.0

    teams = rest(env, "GET", "glpm_teams?select=sm_id,name&limit=2000") or []
    name_by_id = {int(t["sm_id"]): str(t["name"]) for t in teams}

    rows: list[dict[str, Any]] = []
    for tid, s in agg.items():
        if s["mp"] < 1:
            continue
        rows.append(
            {
                "team_sm_id": tid,
                "team": name_by_id.get(tid, f"Team {tid}"),
                "matches": int(s["mp"]),
                "goals": float(s["goals"]),
                "ga": float(s["ga"]),
                "xG": float(s["xg"]),
                "xGA": float(s["xga"]),
                "goals_minus_xg": float(s["goals"]) - float(s["xg"]),
            }
        )
    rows.sort(key=lambda r: (-r["xG"], r["xGA"]))
    for i, r in enumerate(rows, start=1):
        r["number"] = i
    return rows, meta


def import_season(cfg: dict[str, Any], env: dict[str, str], *, dry_run: bool) -> dict[str, Any]:
    season_id = int(cfg["season_sm_id"])
    min_matches = int(cfg.get("min_matches") or 10)
    table, fill_meta = build_table_from_provider_xg(env, season_id)

    fill = float(fill_meta.get("provider_fill_rate") or 0.0)
    if fill < PROVIDER_FILL_BAR:
        return {
            "key": cfg["key"],
            "skipped": True,
            "reason": (
                f"provider fill {fill:.1%} < {PROVIDER_FILL_BAR:.0%} "
                f"({fill_meta.get('matches_with_provider_xg')}/"
                f"{fill_meta.get('finished_matches')} matches)"
            ),
            **fill_meta,
        }

    if not table:
        return {
            "key": cfg["key"],
            "skipped": True,
            "reason": "no provider-xG team aggregates",
            **fill_meta,
        }

    max_mp = max(r["matches"] for r in table)
    if max_mp < min_matches:
        return {
            "key": cfg["key"],
            "skipped": True,
            "reason": f"only {max_mp} matches (min {min_matches})",
            **fill_meta,
        }

    attack = percentile_scores([r["xG"] for r in table], higher_is_better=True)
    defence = percentile_scores([r["xGA"] for r in table], higher_is_better=False)
    finishing = percentile_scores(
        [r["goals_minus_xg"] for r in table], higher_is_better=True
    )

    existing = (
        rest(
            env,
            "GET",
            (
                f"glpm_team_rating_vectors?season_id=eq.{season_id}"
                "&select=team_sm_id,as_of_date,r_goalkeeper,r_build_up,r_possession,r_pressing,metadata"
                "&order=as_of_date.desc"
            ),
        )
        or []
    )
    existing_by_id: dict[int, dict[str, Any]] = {}
    latest_as_of = str(cfg["as_of_date"])
    for x in existing:
        tid = int(x["team_sm_id"])
        if tid not in existing_by_id:
            existing_by_id[tid] = x
        as_of = str(x.get("as_of_date") or "")
        if as_of > latest_as_of:
            latest_as_of = as_of
    as_of_date = latest_as_of

    now = datetime.now(timezone.utc).isoformat()
    upserts = []
    preview = []

    for i, r in enumerate(table):
        mp = max(1, int(r["matches"]))
        shrink_w = min(1.0, mp / EARLY_FULL_MATCHES)

        def shrink_rating(raw: float) -> float:
            return round(60.0 * (1.0 - shrink_w) + float(raw) * shrink_w, 2)

        r_attack = shrink_rating(attack[i])
        r_defence = shrink_rating(defence[i])
        r_finishing = shrink_rating(finishing[i])
        quality = round((r_attack + r_defence + r_finishing) / 3.0, 2)
        prev = existing_by_id.get(int(r["team_sm_id"]), {})
        r_gk = float(prev.get("r_goalkeeper") or 60.0)
        r_bu = float(prev.get("r_build_up") or 60.0)
        r_po = float(prev.get("r_possession") or 60.0)
        r_pr = float(prev.get("r_pressing") or 60.0)
        if r_gk == 50.0:
            r_gk = 60.0
        if r_bu == 50.0:
            r_bu = 60.0
        if r_po == 50.0:
            r_po = 60.0
        if r_pr == 50.0:
            r_pr = 60.0
        prev_meta = prev.get("metadata") if isinstance(prev.get("metadata"), dict) else {}
        meta = {
            **prev_meta,
            "source": "sm_xg_season_import",
            "season_label": cfg["label"],
            "early_season_shrink_w": round(shrink_w, 3),
            "provider_fill_rate": round(fill, 4),
            "imported_at": now,
            "sm_xg": {
                "xg": round(r["xG"], 3),
                "xga": round(r["xGA"], 3),
                "goals": r["goals"],
                "goals_minus_xg": round(r["goals_minus_xg"], 3),
                "matches": r["matches"],
            },
            "derived": {
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_finishing": r_finishing,
                "quality_overall": quality,
                "method": "sm_provider_xg_percentile_within_league",
                "note": "SportMonks Expected Goals (5304) season aggregates + early shrink",
            },
        }
        upserts.append(
            {
                "team_sm_id": r["team_sm_id"],
                "season_id": season_id,
                "as_of_date": as_of_date,
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_goalkeeper": r_gk,
                "r_build_up": r_bu,
                "r_possession": r_po,
                "r_pressing": r_pr,
                "r_finishing": r_finishing,
                "metadata": meta,
                "model_version": MODEL_VERSION,
                "updated_at": now,
            }
        )
        preview.append(
            {
                "rank": 0,
                "team": r["team"],
                "quality_overall": quality,
                "r_attack": r_attack,
                "r_defence": r_defence,
                "r_finishing": r_finishing,
                "xg": round(r["xG"], 2),
                "xga": round(r["xGA"], 2),
            }
        )

    preview.sort(key=lambda x: -x["quality_overall"])
    for i, p in enumerate(preview, start=1):
        p["rank"] = i

    data_dir: Path = cfg["data_dir"]
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "key": cfg["key"],
        "season_sm_id": season_id,
        "competition_sm_id": cfg["competition_sm_id"],
        "as_of_date": as_of_date,
        "model_version": MODEL_VERSION,
        "teams_imported": len(upserts),
        "max_matches": max_mp,
        "provider_fill_rate": fill,
        "leaderboard_preview": preview,
        "dry_run": dry_run,
        **fill_meta,
    }
    (data_dir / "import-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    (data_dir / "league-table.json").write_text(
        json.dumps(table, indent=2), encoding="utf-8"
    )

    print(f"\n=== {cfg['label']} season {season_id} (SM provider xG overlay) ===")
    print(
        f"  provider fill {fill:.1%} "
        f"({fill_meta.get('matches_with_provider_xg')}/{fill_meta.get('finished_matches')})"
    )
    for row in preview[:5]:
        print(
            f"  {row['rank']:2d}. {row['team']:<28} "
            f"A {row['r_attack']:5.1f} D {row['r_defence']:5.1f} FR {row['r_finishing']:5.1f}  "
            f"qual {row['quality_overall']:5.1f}  xG {row['xg']:5.1f} xGA {row['xga']:5.1f}"
        )

    if dry_run:
        print("Dry run - no Supabase writes")
        return manifest

    rest(
        env,
        "POST",
        "glpm_team_rating_vectors?on_conflict=team_sm_id,season_id,as_of_date",
        upserts,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"Upserted {len(upserts)} vectors @ {as_of_date} ({MODEL_VERSION})")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--season-id", type=int, default=None)
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    env = load_env()
    for required in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not env.get(required):
            raise SystemExit(f"Missing {required}")

    configs = SEASONS
    if args.season_id is not None:
        configs = [c for c in SEASONS if c["season_sm_id"] == args.season_id]
        if not configs:
            raise SystemExit(f"No SM-xG config for season-id {args.season_id}")
    elif not args.all:
        configs = list(SEASONS)

    failed = 0
    skipped = 0
    for cfg in configs:
        try:
            result = import_season(cfg, env, dry_run=args.dry_run)
            if result.get("skipped"):
                skipped += 1
                print(f"SKIP {cfg['key']}: {result.get('reason')}")
                # Non-zero so TS router can fall back to standings.
                failed += 1
        except Exception as exc:
            print(f"FAILED {cfg['key']}: {exc}")
            failed += 1
    if failed and skipped == failed:
        # All skipped (fill bar) - exit 2 for overlay fallback.
        return 2
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

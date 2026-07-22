#!/usr/bin/env python3
"""
Write a plain-English GLPM league run report for non-technical readers.

Usage:
  python3 scripts/glpm_write_league_run_report.py \\
      --season-id 28083 \\
      --summaries data/reports/.glpm-league-run-28083-summaries.json \\
      --output data/reports/glpm-league-run-28083-2026-07-21.md
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

TRAIN_KEY_TO_SKILL = {
    "glpm:attack-train": "attack",
    "glpm:defence-train": "defence",
    "glpm:goalkeeper-train": "goalkeeper",
    "glpm:build-up-train": "build_up",
    "glpm:possession-train": "possession",
    "glpm:pressing-train": "pressing",
    "glpm:finishing-train": "finishing",
}

ENGINE_LABELS = {
    "attack": "Attack",
    "defence": "Defence",
    "goalkeeper": "Goalkeeper",
    "build_up": "Build-Up",
    "possession": "Possession",
    "pressing": "Pressing",
    "finishing": "Finishing",
    "xg_engine": "xG / Markets (fixed layer)",
}

VECTOR_COLS = (
    ("r_attack", "ATK"),
    ("r_defence", "DEF"),
    ("r_goalkeeper", "GK"),
    ("r_build_up", "BU"),
    ("r_possession", "POSS"),
    ("r_pressing", "PRS"),
    ("r_finishing", "FIN"),
)

def _fmt_num(val: float | None) -> str:
    if val is None:
        return "—"
    return f"{val:.4f}"


def _fmt_delta(val: float | None) -> str:
    if val is None:
        return "—"
    sign = "+" if val >= 0 else ""
    return f"{sign}{val:.4f}"


def _fmt_rating(val: float | None) -> str:
    if val is None:
        return "—"
    return f"{float(val):.1f}"


def _parse_json_tail(text: str) -> dict | None:
    trimmed = text.strip()
    search_end = len(trimmed)
    while search_end > 0:
        start = trimmed.rfind("{", 0, search_end)
        if start < 0:
            break
        try:
            parsed = json.loads(trimmed[start:])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        search_end = start
    return None


def _normalize_train_summary(summary: dict) -> dict:
    if summary.get("teams") or summary.get("keepers") or summary.get("model_version"):
        return summary
    raw = summary.get("raw_tail")
    if isinstance(raw, str):
        parsed = _parse_json_tail(raw)
        if parsed:
            return parsed
    return summary


def _train_entity_count(summary: dict) -> int | None:
    summary = _normalize_train_summary(summary)
    for key in ("teams", "keepers"):
        if isinstance(summary.get(key), int):
            return int(summary[key])
    top = summary.get("top")
    if isinstance(top, list) and top:
        return len(top)
    return None


def _is_placeholder_name(name: str | None) -> bool:
    if not name:
        return True
    stripped = name.strip()
    if not stripped:
        return True
    return stripped.lower().startswith("player ") or stripped.lower().startswith("gk #")


def _clean_person_name(row: dict[str, Any] | None) -> str | None:
    if not row:
        return None
    short = (row.get("short_name") or "").strip() or None
    if short and not _is_placeholder_name(short):
        return short
    first = (row.get("first_name") or "").strip()
    last = (row.get("last_name") or "").strip()
    combined = " ".join(p for p in (first, last) if p).strip()
    if combined:
        return combined
    return None


class _NameCaches:
    """Batch-friendly team / player name resolution for report tables."""

    def __init__(self, client, season_id: int):
        self.client = client
        self.season_id = season_id
        self._teams: dict[int, str] = {}
        self._players: dict[int, str] = {}
        self._lineup_gk_minutes: dict[tuple[int, int], float] | None = None
        self._lineup_scanned = False

    def team(self, team_sm_id: int) -> str:
        tid = int(team_sm_id)
        if tid in self._teams:
            return self._teams[tid]
        resp = (
            self.client.table("glpm_teams")
            .select("name")
            .eq("sm_id", tid)
            .limit(1)
            .execute()
        )
        name = (
            (resp.data[0].get("name") if resp.data else None)
            or f"Team {tid}"
        )
        self._teams[tid] = name
        return name

    def preload_teams(self, team_ids: list[int]) -> None:
        missing = [int(t) for t in team_ids if int(t) not in self._teams]
        if not missing:
            return
        for i in range(0, len(missing), 100):
            chunk = missing[i : i + 100]
            resp = (
                self.client.table("glpm_teams")
                .select("sm_id,name")
                .in_("sm_id", chunk)
                .execute()
            )
            for row in resp.data or []:
                self._teams[int(row["sm_id"])] = row.get("name") or f"Team {row['sm_id']}"
            for tid in chunk:
                self._teams.setdefault(tid, f"Team {tid}")

    def scan_lineups(self) -> dict[tuple[int, int], float]:
        """
        One paged pass over season match payloads.
        Collects player names and minutes for true GKs (SportMonks position_id=24).
        """
        if self._lineup_scanned and self._lineup_gk_minutes is not None:
            return self._lineup_gk_minutes

        gk_minutes: dict[tuple[int, int], float] = {}
        page_size = 12
        offset = 0
        max_pages = 50
        for _ in range(max_pages):
            resp = (
                self.client.table("glpm_matches")
                .select("payload")
                .eq("season_id", self.season_id)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for match in rows:
                payload = match.get("payload") or {}
                lineups = payload.get("lineups") or []
                if not isinstance(lineups, list):
                    continue
                for row in lineups:
                    if not isinstance(row, dict):
                        continue
                    pid = row.get("player_id")
                    pname = (row.get("player_name") or "").strip()
                    if pid is not None and pname:
                        pid_i = int(pid)
                        # Prefer any real lineup name over placeholders.
                        if _is_placeholder_name(self._players.get(pid_i)):
                            self._players[pid_i] = pname
                        else:
                            self._players.setdefault(pid_i, pname)

                    # True goalkeeper appearances only.
                    if row.get("position_id") != 24:
                        continue
                    tid = row.get("team_id")
                    if pid is None or tid is None:
                        continue
                    minutes = 0.0
                    for detail in row.get("details") or []:
                        if not isinstance(detail, dict):
                            continue
                        if detail.get("type_id") == 119:
                            try:
                                minutes = float((detail.get("data") or {}).get("value") or 0)
                            except (TypeError, ValueError):
                                minutes = 0.0
                            break
                    # Started XI without minutes detail ≈ full match.
                    if minutes <= 0 and row.get("type_id") == 11:
                        minutes = 90.0
                    key = (int(pid), int(tid))
                    gk_minutes[key] = gk_minutes.get(key, 0.0) + minutes

            if len(rows) < page_size:
                break
            offset += page_size

        self._lineup_gk_minutes = gk_minutes
        self._lineup_scanned = True
        return gk_minutes

    def player(self, player_sm_id: int) -> str:
        pid = int(player_sm_id)
        if pid in self._players and not _is_placeholder_name(self._players[pid]):
            return self._players[pid]
        if pid not in self._players:
            resp = (
                self.client.table("glpm_players")
                .select("sm_id,short_name,first_name,last_name")
                .eq("sm_id", pid)
                .limit(1)
                .execute()
            )
            cleaned = _clean_person_name(resp.data[0] if resp.data else None)
            if cleaned:
                self._players[pid] = cleaned
                return cleaned
        if not self._lineup_scanned:
            self.scan_lineups()
        if pid in self._players and not _is_placeholder_name(self._players[pid]):
            return self._players[pid]
        fallback = self._players.get(pid) or f"Player {pid}"
        self._players[pid] = fallback
        return fallback

    def preload_players(self, player_ids: list[int]) -> None:
        unique = [int(p) for p in dict.fromkeys(int(x) for x in player_ids)]
        if not unique:
            return
        missing_db = [p for p in unique if p not in self._players]
        for i in range(0, len(missing_db), 100):
            chunk = missing_db[i : i + 100]
            resp = (
                self.client.table("glpm_players")
                .select("sm_id,short_name,first_name,last_name")
                .in_("sm_id", chunk)
                .execute()
            )
            found = {int(r["sm_id"]): r for r in (resp.data or [])}
            for pid in chunk:
                cleaned = _clean_person_name(found.get(pid))
                self._players[pid] = cleaned or f"Player {pid}"

        still_needed = {
            pid for pid in unique if _is_placeholder_name(self._players.get(pid))
        }
        if still_needed and not self._lineup_scanned:
            self.scan_lineups()
        for pid in still_needed:
            self._players.setdefault(pid, f"Player {pid}")


def _load_starting_goalkeepers(names: _NameCaches, season_id: int) -> list[dict[str, Any]]:
    """
    One starter GK per team from lineup position (SportMonks position_id=24),
    ranked by season minutes. Player rating attached when the GK engine scored them.
    """
    from core.io import load_player_gk_ratings

    gk_minutes = names.scan_lineups()
    if not gk_minutes:
        return []

    by_team: dict[int, list[tuple[float, int]]] = {}
    for (player_id, team_id), minutes in gk_minutes.items():
        by_team.setdefault(int(team_id), []).append((float(minutes), int(player_id)))

    rating_map: dict[int, float] = {}
    ratings = load_player_gk_ratings(names.client, season_id=season_id)
    if ratings is not None and not ratings.empty:
        work = ratings.copy()
        work["player_sm_id"] = work["player_sm_id"].astype(int)
        work["season_id"] = work["season_id"].astype(int)
        work = work[work["season_id"] == int(season_id)]
        latest = (
            work.sort_values("as_of_date")
            .groupby("player_sm_id", as_index=False)
            .tail(1)
        )
        for row in latest.itertuples():
            rating_map[int(row.player_sm_id)] = float(row.rating)

    starters: list[dict[str, Any]] = []
    for team_id, candidates in by_team.items():
        candidates.sort(key=lambda x: (-x[0], x[1]))
        minutes, player_id = candidates[0]
        starters.append(
            {
                "team_sm_id": int(team_id),
                "player_sm_id": int(player_id),
                "rating": rating_map.get(int(player_id)),
                "minutes": float(minutes),
            }
        )
    starters.sort(
        key=lambda r: (
            -(r["rating"] if r["rating"] is not None else -1.0),
            -r["minutes"],
        )
    )
    return starters


def _format_train_results(
    names: _NameCaches,
    train_summaries: dict,
    vectors: list[dict],
    starters: list[dict[str, Any]],
) -> list[str]:
    lines = [
        "## Training results (seven engines)",
        "",
        "Full league table of assembled ratings (0–100). "
        "**Starter GK** is the highest-minutes lineup goalkeeper (SportMonks position).",
        "",
    ]

    counts: list[str] = []
    for train_key, skill in TRAIN_KEY_TO_SKILL.items():
        summary = _normalize_train_summary(train_summaries.get(train_key) or {})
        count = _train_entity_count(summary)
        entity = "keepers" if skill == "goalkeeper" else "teams"
        counts.append(
            f"`{ENGINE_LABELS.get(skill, skill)}` "
            f"{count if count is not None else '?'} {entity} "
            f"(`{summary.get('model_version', 'unknown')}`)"
        )
    lines.append("- " + " · ".join(counts))
    lines.append("")

    starter_by_team = {int(s["team_sm_id"]): s for s in starters}
    team_ids = [int(v["team_sm_id"]) for v in vectors]
    names.preload_teams(team_ids)
    names.preload_players(
        [int(s["player_sm_id"]) for s in starters if s.get("player_sm_id") is not None]
    )

    ranked = sorted(
        vectors,
        key=lambda v: (
            -_vector_avg(v),
            names.team(int(v["team_sm_id"])),
        ),
    )

    lines.extend(
        [
            "### League rating table",
            "",
            "| # | Team | ATK | DEF | GK | BU | POSS | PRS | FIN | Avg | Starter GK | GK rtg |",
            "|--:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|",
        ]
    )
    for idx, row in enumerate(ranked, start=1):
        tid = int(row["team_sm_id"])
        starter = starter_by_team.get(tid)
        gk_name = names.player(int(starter["player_sm_id"])) if starter else "—"
        gk_rtg = _fmt_rating(starter["rating"]) if starter else "—"
        cells = [_fmt_rating(row.get(col)) for col, _ in VECTOR_COLS]
        lines.append(
            f"| {idx} | {names.team(tid)} | "
            + " | ".join(cells)
            + f" | {_fmt_rating(_vector_avg(row))} | {gk_name} | {gk_rtg} |"
        )
    lines.append("")

    if starters:
        lines.extend(
            [
                "### Starting XI goalkeepers (by season minutes)",
                "",
                "| # | Team | Goalkeeper | Player rating | Season mins |",
                "|--:|---|---|---:|---:|",
            ]
        )
        ranked_gk = sorted(
            starters,
            key=lambda r: (
                -(r["rating"] if r.get("rating") is not None else -1.0),
                -float(r.get("minutes") or 0),
            ),
        )
        for idx, row in enumerate(ranked_gk, start=1):
            lines.append(
                f"| {idx} | {names.team(int(row['team_sm_id']))} | "
                f"{names.player(int(row['player_sm_id']))} | "
                f"{_fmt_rating(row.get('rating'))} | {int(round(row['minutes']))} |"
            )
        lines.append("")
        missing = sum(1 for s in starters if s.get("rating") is None)
        if missing:
            lines.append(
                f"_Note: {missing} starting keepers have no player-level GK rating yet "
                "(team **GK** column above still comes from the assembled vector)._"
            )
            lines.append("")

    return lines


def _vector_avg(row: dict) -> float:
    vals = [
        float(row[col])
        for col, _ in VECTOR_COLS
        if row.get(col) is not None
    ]
    if not vals:
        return 0.0
    return sum(vals) / len(vals)


def _engine_rating_stats(
    vectors: list[dict],
    starters: list[dict[str, Any]],
    names: _NameCaches,
) -> list[dict[str, Any]]:
    """Per-engine distribution stats for the ML summary table."""
    stats: list[dict[str, Any]] = []
    for col, short in VECTOR_COLS:
        if col == "r_goalkeeper" and starters:
            pairs = [
                (
                    float(s["rating"]),
                    names.player(int(s["player_sm_id"])),
                )
                for s in starters
                if s.get("rating") is not None
            ]
            label = "Goalkeeper (starters)"
            if len(pairs) < max(3, len(starters) // 2):
                # Many true lineup GKs were not scored by the GK engine — use team vector.
                pairs = []
                for row in vectors:
                    if row.get(col) is None:
                        continue
                    pairs.append(
                        (float(row[col]), names.team(int(row["team_sm_id"])))
                    )
                label = "Goalkeeper (team vector)"
        else:
            pairs = []
            for row in vectors:
                if row.get(col) is None:
                    continue
                pairs.append(
                    (float(row[col]), names.team(int(row["team_sm_id"])))
                )
            label = ENGINE_LABELS.get(
                {
                    "r_attack": "attack",
                    "r_defence": "defence",
                    "r_goalkeeper": "goalkeeper",
                    "r_build_up": "build_up",
                    "r_possession": "possession",
                    "r_pressing": "pressing",
                    "r_finishing": "finishing",
                }[col],
                short,
            )
        if not pairs:
            continue
        vals = [p[0] for p in pairs]
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        std = var**0.5
        lo = min(pairs, key=lambda p: p[0])
        hi = max(pairs, key=lambda p: p[0])
        stats.append(
            {
                "engine": label,
                "n": len(vals),
                "mean": mean,
                "std": std,
                "min": lo[0],
                "max": hi[0],
                "spread": hi[0] - lo[0],
                "top": f"{hi[1]} ({hi[0]:.1f})",
                "bottom": f"{lo[1]} ({lo[0]:.1f})",
            }
        )
    return stats


def _format_ml_summary(
    introspection: dict | None,
    vectors: list[dict],
    starters: list[dict[str, Any]],
    names: _NameCaches,
) -> list[str]:
    lines = [
        "## Machine learning summary",
        "",
        "How the fitted 0–100 ratings are spread this run. "
        "A healthy engine usually shows a clear top–bottom gap (discrimination) "
        "rather than everyone clustered near the same score.",
        "",
    ]

    if introspection:
        summary = introspection.get("summary") or {}
        lines.extend(
            [
                f"- **Engines trained:** {summary.get('engines_trained', 0)} / 7",
                f"- **Learned variables tracked:** {summary.get('total_variables', 0)}",
                f"- **Variables changed vs previous run:** {summary.get('changed_count', 0)}",
                f"- **Team headline ratings that moved:** {summary.get('team_rating_changes', 0)}",
                f"- **First baseline run:** {'yes' if introspection.get('is_first_run') else 'no'}",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "_Model introspection was not available for this run — "
                "rating distributions below still come from assembled vectors._",
                "",
            ]
        )

    stats = _engine_rating_stats(vectors, starters, names)
    if not stats:
        lines.extend(["_No assembled ratings available yet._", ""])
        return lines

    lines.extend(
        [
            "| Engine | N | Mean | Std | Min | Max | Spread | Top | Bottom |",
            "|---|--:|---:|---:|---:|---:|---:|---|---|",
        ]
    )
    for row in stats:
        lines.append(
            f"| {row['engine']} | {row['n']} | {row['mean']:.1f} | {row['std']:.1f} | "
            f"{row['min']:.1f} | {row['max']:.1f} | {row['spread']:.1f} | "
            f"{row['top']} | {row['bottom']} |"
        )
    lines.append("")
    lines.extend(
        [
            "_Reading tip:_ **Spread** = max − min. "
            "Very small spreads mean the engine barely separates clubs; "
            "large spreads with sensible Top/Bottom names are easier to trust.",
            "",
        ]
    )
    return lines


def _format_whole_model_meaning(introspection: dict | None) -> list[str]:
    lines = [
        "## What the model means as a whole",
        "",
        "1. **Data** — SportMonks match stats (proxies where needed).",
        "2. **Features** — per-match rates (shots, xG, PPDA, progression, …).",
        "3. **Seven engines** — context adjust → components → domains → primary → 0–100 calibration.",
        "4. **Prediction** — rating vector + locked interaction weights "
        "(ATK–DEF 40%, FIN–GK 25%, BU–PRS 20%, POSS–PRS 15%) → Dixon–Coles markets.",
        "",
    ]
    if introspection and not introspection.get("is_first_run"):
        changed = (introspection.get("summary") or {}).get("changed_count", 0)
        if changed:
            lines.extend(
                [
                    f"**This run:** {changed} learned weights moved on new match data. "
                    "Team ratings and matchups will shift; fixed xG equations did not.",
                    "",
                ]
            )
        else:
            lines.extend(
                [
                    "**This run:** Learned weights effectively unchanged. "
                    "Ratings may still nudge as latest matches enter the training set.",
                    "",
                ]
            )
    else:
        lines.extend(
            [
                "**This run:** First baseline — initial estimates from available season data.",
                "",
            ]
        )
    return lines


def _format_all_variables(introspection: dict | None) -> list[str]:
    if not introspection:
        return []
    variables = introspection.get("variables") or []
    kept = [v for v in variables if v.get("layer") != "calibrator"]
    omitted = len(variables) - len(kept)

    # Compact counts instead of dumping every coefficient into the PDF.
    from collections import Counter

    by_engine_layer: Counter[tuple[str, str]] = Counter()
    for v in kept:
        by_engine_layer[(str(v.get("engine", "")), str(v.get("layer", "")))] += 1

    lines = [
        "## Model variable coverage",
        "",
        "Counts of tracked learned weights (calibrator percentile maps omitted). "
        "Full coefficient dumps stay in artifacts / introspection JSON — "
        "this report keeps the readable summary.",
        "",
    ]
    if omitted:
        lines.append(f"_Omitted {omitted} calibrator percentile rows._")
        lines.append("")

    lines.extend(
        [
            "| Engine | Layer | Variables |",
            "|---|---|--:|",
        ]
    )
    for (engine, layer), count in sorted(by_engine_layer.items()):
        lines.append(f"| {engine} | {layer} | {count} |")
    lines.append("")
    lines.append(f"**Total tracked (excl. calibrators):** {len(kept)}")
    lines.append("")
    return lines


def _format_changed_variables(introspection: dict | None) -> list[str]:
    if not introspection:
        return []
    from models.ratings.feature_explanations import explain_weight_change

    variables = introspection.get("variables") or []
    changed = [
        v
        for v in variables
        if v.get("engine") != "xg_engine"
        and v.get("layer") != "calibrator"
        and v.get("delta") is not None
        and abs(float(v["delta"])) > 1e-9
    ]
    lines = ["## Variables that changed (with meaning)", ""]
    if introspection.get("is_first_run"):
        lines.extend(
            [
                "_First baseline — every learned weight is new. "
                "See Model variable coverage for tracked weight counts._",
                "",
            ]
        )
        return lines
    if not changed:
        lines.extend(
            [
                "_No learned weights moved materially since the previous training snapshot._",
                "",
            ]
        )
        return lines
    lines.append(
        f"**{len(changed)}** learned weights changed (excluding calibrator percentiles)."
    )
    lines.append("")
    for v in changed:
        var = str(v.get("variable", ""))
        layer = f"{v.get('engine')}/{v.get('layer')}/{v.get('model')}"
        before = v.get("before")
        after = float(v.get("after", 0))
        lines.append(
            explain_weight_change(
                var.split(".")[-1] if "." in var else var,
                before=float(before) if before is not None else None,
                after=after,
                layer=layer,
            )
        )
    lines.append("")
    return lines


def _format_team_rating_changes(names: _NameCaches, introspection: dict | None) -> list[str]:
    if not introspection:
        return []
    changes = introspection.get("team_rating_changes") or []
    lines = ["## Team rating outputs that changed", ""]
    if introspection.get("is_first_run"):
        lines.extend(
            [
                "_First baseline — team ratings were written but there is no prior run to diff._",
                "",
            ]
        )
        return lines
    if not changes:
        lines.extend(["_Headline team ratings unchanged vs the previous training snapshot._", ""])
        return lines
    names.preload_teams([int(r["team_sm_id"]) for r in changes])
    lines.append("| Engine | Team | Before | After | Δ |")
    lines.append("|---|---|---:|---:|---:|")
    for row in sorted(changes, key=lambda r: abs(float(r.get("delta", 0))), reverse=True):
        engine = row.get("engine", "")
        team_id = int(row["team_sm_id"])
        name = names.team(team_id)
        before = float(row["before"])
        after = float(row["after"])
        delta = float(row["delta"])
        sign = "+" if delta >= 0 else ""
        lines.append(
            f"| {ENGINE_LABELS.get(engine, engine)} | {name} | "
            f"{before:.1f} | {after:.1f} | {sign}{delta:.1f} |"
        )
    lines.append("")
    return lines


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


def _ingest_stats(client, season_id: int) -> dict:
    matches = (
        client.table("glpm_matches")
        .select("sm_id", count="exact")
        .eq("season_id", season_id)
        .execute()
    )
    match_count = matches.count or 0

    season_match_ids = {
        r["sm_id"]
        for r in (
            client.table("glpm_matches")
            .select("sm_id")
            .eq("season_id", season_id)
            .execute()
        ).data
        or []
    }

    stats_rows = (
        client.table("glpm_match_team_stats")
        .select("match_sm_id, payload, ppda_source, xg_source")
        .execute()
    ).data or []
    season_stats = [r for r in stats_rows if r.get("match_sm_id") in season_match_ids]

    xg_real = 0
    xg_proxy = 0
    ppda_proxy = 0
    ppda_wyscout = 0
    for row in season_stats:
        payload = row.get("payload") or {}
        if payload.get("xg_proxy"):
            xg_proxy += 1
        elif row.get("xg_source") == "sportmonks":
            xg_real += 1
        if row.get("ppda_source") == "sportmonks_proxy":
            ppda_proxy += 1
        elif row.get("ppda_source") == "wyscout":
            ppda_wyscout += 1

    return {
        "match_count": match_count,
        "team_stat_sides": len(season_stats),
        "xg_real_sides": xg_real,
        "xg_proxy_sides": xg_proxy,
        "ppda_proxy_sides": ppda_proxy,
        "ppda_wyscout_sides": ppda_wyscout,
    }


def _latest_vectors(client, season_id: int) -> list[dict]:
    rows = (
        client.table("glpm_team_rating_vectors")
        .select("*")
        .eq("season_id", season_id)
        .order("as_of_date", desc=True)
        .execute()
    ).data or []
    seen: set[int] = set()
    latest: list[dict] = []
    for row in rows:
        tid = row.get("team_sm_id")
        if tid in seen:
            continue
        seen.add(tid)
        latest.append(row)
    return latest


def _find_previous_report(season_id: int, current_output: Path) -> Path | None:
    report_dir = REPO_ROOT / "data" / "reports"
    if not report_dir.exists():
        return None
    candidates = sorted(
        report_dir.glob(f"glpm-league-run-{season_id}-*.md"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        if path.resolve() != current_output.resolve():
            return path
    return None


def _format_prediction(names: _NameCaches, sample: dict | None, matchup: dict | None) -> str:
    if not sample or sample.get("error"):
        return "_Sample match prediction was not available for this run._\n"
    home_id = (matchup or {}).get("homeTeamId")
    away_id = (matchup or {}).get("awayTeamId")
    home = names.team(int(home_id)) if home_id else "Home team"
    away = names.team(int(away_id)) if away_id else "Away team"

    xg_home = sample.get("xg_home") or sample.get("expected_goals", {}).get("home")
    xg_away = sample.get("xg_away") or sample.get("expected_goals", {}).get("away")
    markets = sample.get("markets") or sample.get("probabilities") or {}

    home_win = markets.get("home_win") or markets.get("1")
    draw = markets.get("draw") or markets.get("X")
    away_win = markets.get("away_win") or markets.get("2")

    lines = [f"We picked **{home}** vs **{away}** as a sample fixture.", ""]
    if xg_home is not None and xg_away is not None:
        lines.append(
            f"- Expected goals: {home} **{float(xg_home):.2f}**, {away} **{float(xg_away):.2f}**"
        )
    if home_win is not None and draw is not None and away_win is not None:
        lines.append(
            f"- Win / draw / loss: "
            f"{home} **{float(home_win) * 100:.0f}%**, "
            f"Draw **{float(draw) * 100:.0f}%**, "
            f"{away} **{float(away_win) * 100:.0f}%**"
        )
    lines.append(
        "\nThese numbers come from the seven skill ratings plus home advantage — "
        "estimates, not guarantees."
    )
    return "\n".join(lines) + "\n"


def build_report(
    *,
    season_id: int,
    summaries_path: Path,
    output_path: Path,
    introspection_path: Path | None = None,
) -> str:
    bundle = json.loads(summaries_path.read_text(encoding="utf-8"))
    train_summaries = bundle.get("trainSummaries") or {}
    sample_prediction = bundle.get("samplePrediction")
    sample_matchup = bundle.get("sampleMatchup")

    introspection: dict | None = None
    if introspection_path and introspection_path.exists():
        introspection = json.loads(introspection_path.read_text(encoding="utf-8"))

    _load_dotenv()
    from core.io import get_supabase_client

    client = get_supabase_client()
    names = _NameCaches(client, season_id)
    ingest = _ingest_stats(client, season_id)
    vectors = _latest_vectors(client, season_id)
    starters = _load_starting_goalkeepers(names, season_id)
    names.preload_teams([int(v["team_sm_id"]) for v in vectors] + [int(s["team_sm_id"]) for s in starters])
    names.preload_players(
        [int(s["player_sm_id"]) for s in starters if s.get("player_sm_id") is not None]
    )
    prev = _find_previous_report(season_id, output_path.resolve())

    change_section = (
        "_This is the first baseline report for this season — see Machine learning summary "
        "and Model variable coverage for the starting fit._\n"
        if prev is None
        else f"_Previous report: `{prev.name}`. Weight and rating diffs are in the sections below._\n"
    )

    lines: list[str] = [
        f"# GLPM league run — season {season_id}",
        "",
        f"_Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
        "## What we collected",
        "",
        f"- **Matches:** {ingest['match_count']}",
        f"- **Team-match rows:** {ingest['team_stat_sides']}",
        f"- **Real xG / proxy xG:** {ingest['xg_real_sides']} / {ingest['xg_proxy_sides']}",
        f"- **PPDA proxy / Wyscout:** {ingest['ppda_proxy_sides']} / {ingest['ppda_wyscout_sides']}",
        "",
        "SportMonks is the primary source. Proxies are flagged — never presented as Wyscout-quality.",
        "",
        "## What we estimated (and why)",
        "",
        "| Field | How we filled it |",
        "|---|---|",
        "| Defensive actions | Tackles + interceptions + clearances |",
        "| PPDA (pressing proxy) | Opponent passes ÷ our defensive actions |",
        "| xG | SportMonks Expected Goals, or shot-based proxy if missing |",
        "| Goalkeeper saves | Team stat or summed from lineup details |",
        "",
    ]

    lines.extend(_format_ml_summary(introspection, vectors, starters, names))
    lines.extend(_format_whole_model_meaning(introspection))
    lines.extend(_format_train_results(names, train_summaries, vectors, starters))
    lines.extend(_format_changed_variables(introspection))
    lines.extend(_format_team_rating_changes(names, introspection))
    lines.extend(
        [
            "## What is still approximate until Wyscout",
            "",
            "- True pressing intensity (zone-aware PPDA from events)",
            "- Detailed goalkeeper involvement outside the box",
            "- Shot placement coordinates for finishing refinement",
            "",
            "Wyscout code remains in the repo. To reactivate: set `WYSCOUT_USERNAME` / "
            "`WYSCOUT_PASSWORD`, map entities in `glpm_provider_entity_map`, enable "
            "`GLPM_WYSCOUT_ENRICH=1`, then run `npm run glpm:wy-enrich -- <matchSmId>` after SportMonks ingest.",
            "",
            "## Sample match prediction",
            "",
            _format_prediction(names, sample_prediction, sample_matchup),
            "## What changed this run",
            "",
            change_section,
        ]
    )
    lines.extend(_format_all_variables(introspection))

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Write plain-English GLPM league run report")
    parser.add_argument("--season-id", type=int, required=True)
    parser.add_argument("--summaries", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--introspection", type=Path, default=None)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    report = build_report(
        season_id=args.season_id,
        summaries_path=args.summaries,
        output_path=args.output.resolve(),
        introspection_path=args.introspection,
    )
    args.output.write_text(report, encoding="utf-8")
    print(json.dumps({"output": str(args.output), "bytes": len(report.encode())}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

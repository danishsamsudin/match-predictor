#!/usr/bin/env python3
"""Parse FIFA World Cup 2026 official squad PDF into JSON for the app."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path.home() / "Downloads" / "SquadLists-English.pdf"
DEFAULT_OUT = ROOT / "data" / "world-cup-2026-official-squads.json"

FIFA_TO_APP: dict[str, str] = {
    "Algeria": "Algeria",
    "Argentina": "Argentina",
    "Australia": "Australia",
    "Austria": "Austria",
    "Belgium": "Belgium",
    "Bosnia And Herzegovina": "Bosnia & Herzegovina",
    "Brazil": "Brazil",
    "Cabo Verde": "Cabo Verde",
    "Canada": "Canada",
    "Colombia": "Colombia",
    "Congo DR": "DR Congo",
    "Côte D'Ivoire": "Côte d'Ivoire",
    "Croatia": "Croatia",
    "Curaçao": "Curaçao",
    "Czechia": "Czechia",
    "Ecuador": "Ecuador",
    "Egypt": "Egypt",
    "England": "England",
    "France": "France",
    "Germany": "Germany",
    "Ghana": "Ghana",
    "Haiti": "Haiti",
    "IR Iran": "Iran",
    "Iraq": "Iraq",
    "Japan": "Japan",
    "Jordan": "Jordan",
    "Korea Republic": "South Korea",
    "Mexico": "Mexico",
    "Morocco": "Morocco",
    "Netherlands": "Netherlands",
    "New Zealand": "New Zealand",
    "Norway": "Norway",
    "Panama": "Panama",
    "Paraguay": "Paraguay",
    "Portugal": "Portugal",
    "Qatar": "Qatar",
    "Saudi Arabia": "Saudi Arabia",
    "Scotland": "Scotland",
    "Senegal": "Senegal",
    "South Africa": "South Africa",
    "Spain": "Spain",
    "Sweden": "Sweden",
    "Switzerland": "Switzerland",
    "Tunisia": "Tunisia",
    "Türkiye": "Türkiye",
    "Uruguay": "Uruguay",
    "USA": "USA",
    "Uzbekistan": "Uzbekistan",
}

POS_MAP = {"GK": "GK", "DF": "DEF", "MF": "MID", "FW": "FWD"}

NATIONALITIES = {
    "Afghanistan",
    "Albania",
    "Algeria",
    "Argentina",
    "Armenia",
    "Australia",
    "Austria",
    "Belgium",
    "Brazil",
    "Bulgaria",
    "Cameroon",
    "Canada",
    "Chile",
    "China",
    "Colombia",
    "Croatia",
    "Czechia",
    "Denmark",
    "Ecuador",
    "Egypt",
    "England",
    "France",
    "Germany",
    "Ghana",
    "Greece",
    "Haiti",
    "Hungary",
    "Iran",
    "Iraq",
    "Ireland",
    "Israel",
    "Italy",
    "Japan",
    "Jordan",
    "Mexico",
    "Morocco",
    "Netherlands",
    "New Zealand",
    "Nigeria",
    "Norway",
    "Panama",
    "Paraguay",
    "Peru",
    "Poland",
    "Portugal",
    "Qatar",
    "Romania",
    "Russia",
    "Saudi Arabia",
    "Scotland",
    "Senegal",
    "Serbia",
    "Slovakia",
    "South Africa",
    "South Korea",
    "Spain",
    "Sweden",
    "Switzerland",
    "Tunisia",
    "Turkey",
    "Türkiye",
    "Ukraine",
    "Uruguay",
    "USA",
    "United States",
    "Uzbekistan",
    "Wales",
    "Kosovo",
    "Montenegro",
    "Bosnia and Herzegovina",
    "Bosnia & Herzegovina",
    "Curaçao",
    "Cabo Verde",
    "DR Congo",
    "Côte d'Ivoire",
}


def unglue(value: str) -> str:
    value = re.sub(r"([a-zà-ÿ])([A-ZÀ-Ÿ])", r"\1 \2", value)
    value = re.sub(r"([A-ZÀ-Ÿ]{2,})([A-ZÀ-Ÿ][a-zà-ÿ])", r"\1 \2", value)
    return re.sub(r"\s+", " ", value).strip()


def fix_split_accents(value: str) -> str:
    return re.sub(r"(\w) ([\u00c0-\u017f])", r"\1\2", value)


def dedupe_words(words: list[str]) -> list[str]:
    out: list[str] = []
    for word in words:
        if out and out[-1].lower() == word.lower():
            continue
        out.append(word)
    return out


def parse_name_blob(blob: str) -> str:
    blob = fix_split_accents(unglue(blob))
    words = dedupe_words(blob.split())
    if not words:
        return blob
    surname = words[0]
    core: list[str] = []
    for word in words[1:]:
        if word.upper() == surname.upper():
            break
        core.append(word)
    core = dedupe_words(core)
    if not core:
        return surname.title()
    return f"{' '.join(core)} {surname.title()}"


def parse_player_line(line: str) -> dict | None:
    line = line.strip()
    if not re.match(r"^(GK|DF|MF|FW)", line):
        return None
    match = re.match(
        r"^(GK|DF|MF|FW)\s*(.+?)(\d{2}/\d{2}/\d{4})(.+)\s+(\d{2,3})\s*$",
        line,
    )
    if not match:
        return None
    pos, name_blob, dob, club, height = match.groups()
    return {
        "name": parse_name_blob(name_blob),
        "position": POS_MAP[pos],
        "dob": dob,
        "club": club.strip(),
        "heightCm": int(height),
    }


def parse_coach(block: str) -> dict | None:
    match = re.search(r"^Head coach\s*(.+)$", block, re.M)
    if not match:
        return None
    raw = fix_split_accents(unglue(match.group(1).strip()))
    words = raw.split()
    nationality: str | None = None
    for end in range(len(words), 0, -1):
        candidate = " ".join(words[end - 1 :])
        if candidate in NATIONALITIES:
            nationality = candidate
            words = words[: end - 1]
            break
    if not nationality and words:
        nationality = words.pop()
    words = dedupe_words(words)
    if len(words) >= 2 and words[-1].upper() == words[0].upper():
        words = words[:-1]
    name = " ".join(words).title() if words else raw
    return {"name": name, "nationality": nationality, "role": "Head coach"}


def parse_pdf(pdf_path: Path) -> dict:
    text = "\n".join(page.extract_text() or "" for page in PdfReader(str(pdf_path)).pages)
    blocks = re.split(r"\n(?=[A-Za-zÀ-ÿ'\.\s&]+ \([A-Z]{3}\)\n)", text)
    teams: dict[str, dict] = {}
    issues: list[str] = []

    for block in blocks:
        header = re.match(r"^([A-Za-zÀ-ÿ'\.\s&]+) \(([A-Z]{3})\)\n", block)
        if not header:
            continue
        fifa_name = header.group(1).strip()
        app_name = FIFA_TO_APP.get(fifa_name)
        if not app_name:
            issues.append(f"unknown team: {fifa_name}")
            continue

        players: list[dict] = []
        for line in block.split("\n"):
            stripped = line.strip()
            if stripped.startswith("Head coach") or stripped.startswith("ROLE COACH"):
                break
            player = parse_player_line(line)
            if player:
                players.append(player)

        coach = parse_coach(block)
        if len(players) != 26:
            issues.append(f"{app_name}: {len(players)} players")
        if not coach:
            issues.append(f"{app_name}: missing coach")

        teams[app_name] = {
            "fifaName": fifa_name,
            "code": header.group(2),
            "coach": coach,
            "players": players,
        }

    return {
        "source": pdf_path.name,
        "version": "1",
        "publishedAt": "2026-06-03",
        "teams": teams,
        "_parseIssues": issues,
    }


def main() -> int:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    if not pdf_path.is_file():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    payload = parse_pdf(pdf_path)
    issues = payload.pop("_parseIssues", [])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(payload['teams'])} teams to {out_path}")
    if issues:
        print("Issues:")
        for issue in issues:
            print(f"  - {issue}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

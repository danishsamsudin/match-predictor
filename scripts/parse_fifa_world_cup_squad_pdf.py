#!/usr/bin/env python3
"""Parse FIFA World Cup 2026 official squad PDF into JSON for the app."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
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


NAME_PARTICLES = {
    "van",
    "de",
    "der",
    "den",
    "von",
    "del",
    "la",
    "le",
    "di",
    "da",
    "du",
    "dos",
    "das",
    "do",
    "el",
    "al",
}


def unglue(value: str) -> str:
    value = re.sub(r"-\s+", "-", value)
    chars: list[str] = []
    for index, char in enumerate(value):
        if (
            index > 0
            and value[index - 1].islower()
            and char.isupper()
            and not char.islower()
        ):
            chars.append(" ")
        chars.append(char)
    value = "".join(chars)
    value = re.sub(r"([A-Z]{3,})([A-Z][a-zà-ÿ])", r"\1 \2", value)
    value = re.sub(r"([A-Za-zÀ-ÿ])- ([A-Za-zÀ-ÿ])", r"\1-\2", value)
    return re.sub(r"\s+", " ", value).strip()


def fix_split_accents(value: str) -> str:
    """Rejoin accents split by PDF extraction (e.g. KOVÁ Ř), not intentional word breaks."""
    return re.sub(r"([a-zà-ÿ]) ([\u00c0-\u017f])", r"\1\2", value)


def fold_name_key(word: str) -> str:
    folded = unicodedata.normalize("NFKD", word)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z]", "", folded.lower())


def dedupe_words(words: list[str]) -> list[str]:
    out: list[str] = []
    for word in words:
        if out and fold_name_key(out[-1]) == fold_name_key(word):
            if len(word) >= len(out[-1]):
                out[-1] = word
            continue
        out.append(word)
    return out


def split_repeated_token(token: str) -> list[str]:
    """Split glued duplicates such as VERBRUGGENVERBRUGGEN or AKÉAKÉ."""
    if not token:
        return []
    letters = re.sub(r"[^A-Za-zÀ-ÿ]", "", token)
    if len(letters) >= 6 and letters.isalpha():
        upper = letters.upper()
        for size in range(len(upper) // 2, 2, -1):
            if len(upper) % size != 0:
                continue
            chunk = upper[:size]
            if chunk * (len(upper) // size) == upper:
                prefix = token[: token.index(letters[0])] if letters else ""
                suffix = token[len(prefix) + len(letters) :]
                token = f"{prefix}{chunk}{suffix}"
                break
    return [token]


def normalize_token(token: str) -> str:
    return re.sub(r"[^a-z0-9]", "", token.lower())


def is_surname_token(word: str) -> bool:
    parts = [part for part in word.split("-") if part]
    return bool(parts) and all(part.isupper() for part in parts)


def is_given_name_word(word: str) -> bool:
    if not word:
        return False
    if word.isupper():
        return False
    if word.islower():
        return True
    if word[0].isupper() and len(word) > 1:
        return True
    return False


def title_name_word(word: str) -> str:
    lower = word.lower()
    if lower in NAME_PARTICLES:
        return lower
    if word.isupper():
        return word.capitalize()
    if "-" in word:
        return "-".join(title_name_word(part) for part in word.split("-"))
    return word


def collapse_hyphenated_names(
    first_names: list[str], source_words: list[str]
) -> list[str]:
    hyphenated = [word for word in source_words if "-" in word and not word.startswith("-")]
    result = list(first_names)
    for candidate in hyphenated:
        parts = candidate.split("-", 1)
        if len(parts) != 2:
            continue
        part_a, part_b = fold_name_key(parts[0]), fold_name_key(parts[1])
        for index in range(len(result) - 1):
            if (
                fold_name_key(result[index]) == part_a
                and fold_name_key(result[index + 1]) == part_b
            ):
                result = result[:index] + [candidate] + result[index + 2 :]
                break
    cleaned: list[str] = []
    for word in result:
        if cleaned and "-" in word:
            head = word.split("-", 1)[0]
            if fold_name_key(cleaned[-1]) == fold_name_key(head):
                cleaned[-1] = word
                continue
        cleaned.append(word)
    return dedupe_words(cleaned)


def format_display_name(first_names: list[str], surname_parts: list[str]) -> str:
    first = " ".join(title_name_word(w) for w in dedupe_words(first_names))
    last = " ".join(title_name_word(w) for w in surname_parts)
    if first and last:
        return f"{first} {last}"
    return first or last


def parse_name_blob(blob: str) -> str:
    """
    FIFA squad PDF rows concatenate:
    PLAYER_NAME + FIRST_NAME(S) + LAST_NAME(S)/NAME_ON_SHIRT (often duplicated).
    """
    blob = unglue(fix_split_accents(blob))
    words: list[str] = []
    for token in blob.split():
        words.extend(split_repeated_token(token))
    words = dedupe_words(words)
    if not words:
        return blob

    first_name_start = 0
    while first_name_start < len(words) and (
        words[first_name_start].isupper() or is_surname_token(words[first_name_start])
    ):
        first_name_start += 1
    while first_name_start < len(words) and not is_given_name_word(words[first_name_start]):
        first_name_start += 1
    if first_name_start >= len(words):
        return format_display_name([], words)

    surname_parts = words[:first_name_start]
    rest = words[first_name_start:]
    surname_keys = {fold_name_key(part) for part in surname_parts}
    surname_norm = normalize_token("".join(surname_parts))

    first_names: list[str] = []
    for word in rest:
        word_key = fold_name_key(word)
        word_norm = normalize_token(word)
        if word_key and word_key in surname_keys:
            break
        if word_norm and (
            word_norm == surname_norm
            or (len(word_norm) >= 4 and word_norm in surname_norm)
        ):
            break
        if word.isupper() and len(word) >= 4 and not is_given_name_word(word):
            break
        first_names.append(word)

    first_names = dedupe_words(first_names)
    if len(first_names) >= 2:
        compact = [fold_name_key(w) for w in first_names]
        for index in range(len(first_names) - 1, 0, -1):
            if compact[index] == compact[index - 1]:
                first_names.pop(index - 1)
    first_names = collapse_hyphenated_names(first_names, words)
    for index, part in enumerate(surname_parts):
        for word in words:
            if fold_name_key(word) == fold_name_key(part) and word != part:
                surname_parts[index] = word
                break
    if (
        len(surname_parts) == 1
        and "-" in surname_parts[0]
        and first_names
    ):
        head, tail = surname_parts[0].split("-", 1)
        if fold_name_key(first_names[-1]) == fold_name_key(head):
            merged = f"{title_name_word(first_names[-1])}-{title_name_word(tail)}"
            first_names = first_names[:-1]
            surname_parts = [merged]
    if not surname_parts and first_names:
        surname_parts = [first_names.pop()]
    return format_display_name(first_names, surname_parts)


def parse_player_line(line: str) -> dict | None:
    line = line.strip()
    if not re.match(r"^(GK|DF|MF|FW)", line):
        return None
    match = re.match(
        r"^(GK|DF|MF|FW)\s*(.+?)(\d{2}/\d{2}/\d{4})(.+?)(\d{2,3})\s*$",
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

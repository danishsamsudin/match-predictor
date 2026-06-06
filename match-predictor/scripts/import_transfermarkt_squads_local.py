#!/usr/bin/env python3
"""
Import Transfermarkt squad HTML snapshots into Supabase.

Default source: data/world-cup-2026/WC Squads/*.html

Usage (from match-predictor/):
  python scripts/import_transfermarkt_squads_local.py
  python scripts/import_transfermarkt_squads_local.py --dir path/to/html/files
"""

from __future__ import annotations

import argparse
import os
import re
import unicodedata
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup
from supabase import Client, create_client

DEFAULT_IMPORT_DIR = (
    Path(__file__).resolve().parent.parent / "data/world-cup-2026/WC Squads"
)

TEAM_NAME_TO_ID: dict[str, int] = {
    "algeria": 4691,
    "argentina": 4819,
    "australia": 4741,
    "austria": 4718,
    "belgium": 4717,
    "bosnia and herzegovina": 4479,
    "bosnia & herzegovina": 4479,
    "bosnia-herzegovina": 4479,
    "brazil": 4748,
    "cabo verde": 4753,
    "cape verde": 4753,
    "canada": 4752,
    "colombia": 4820,
    "cote divoire": 4768,
    "côte d'ivoire": 4768,
    "ivory coast": 4768,
    "croatia": 4715,
    "curacao": 55827,
    "curaçao": 55827,
    "czechia": 4714,
    "dr congo": 4823,
    "democratic republic of the congo": 4823,
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
    "turkey": 4700,
    "uruguay": 4725,
    "usa": 4724,
    "united states": 4724,
    "uzbekistan": 4723,
}


def load_env_local() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#") or "=" not in t:
            continue
        key, _, val = t.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def norm_key(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def parse_market_value_eur(raw: str) -> float | None:
    if not raw or raw.strip() in {"-", ""}:
        return None
    match = re.search(r"([\d.,]+)\s*([mk])?", raw.strip().lower().replace("€", ""))
    if not match:
        return None
    text = match.group(1).replace(",", ".")
    suffix = match.group(2) or ""
    multiplier = 1.0
    if suffix == "m":
        multiplier = 1_000_000
    elif suffix == "k":
        multiplier = 1_000
    try:
        return round(float(text) * multiplier, 2)
    except ValueError:
        return None


def team_name_from_filename(path: Path) -> str:
    stem = path.stem
    if " - Club profile" in stem:
        return stem.split(" - Club profile", 1)[0].strip()
    return stem.replace("_", " ").replace("-", " ").strip()


def team_id_from_path(path: Path) -> int | None:
    name = norm_key(team_name_from_filename(path))
    if name in TEAM_NAME_TO_ID:
        return TEAM_NAME_TO_ID[name]
    for key, team_id in TEAM_NAME_TO_ID.items():
        if key in name or name in key:
            return team_id
    return None


def parse_transfermarkt_team_id(html: str) -> int | None:
    m = re.search(r"saved from url=\(\d+\)(https://www\.transfermarkt\.com/[^/]+/startseite/verein/(\d+))", html)
    if m:
        return int(m.group(2))
    m = re.search(r"/startseite/verein/(\d+)", html)
    return int(m.group(1)) if m else None


def parse_header_label(soup: BeautifulSoup, label: str) -> str | None:
    for li in soup.select("li.data-header__label"):
        if label.lower() in li.get_text(" ", strip=True).lower():
            content = li.find("span", class_="data-header__content")
            if content:
                return content.get_text(" ", strip=True)
    return None


def parse_team_header(html: str, team_name: str) -> dict:
    soup = BeautifulSoup(html, "lxml")

    total_value = None
    wrapper = soup.find("a", class_="data-header__market-value-wrapper")
    if wrapper:
        total_value = parse_market_value_eur(wrapper.get_text(" ", strip=True))

    squad_size_raw = parse_header_label(soup, "Squad size")
    squad_size = int(squad_size_raw) if squad_size_raw and squad_size_raw.isdigit() else None

    avg_age_raw = parse_header_label(soup, "Average age")
    average_age = float(avg_age_raw) if avg_age_raw else None

    foreigners_raw = parse_header_label(soup, "Foreigners")
    foreigners_count = None
    foreigners_pct = None
    if foreigners_raw:
        count_match = re.search(r"(\d+)", foreigners_raw)
        pct_match = re.search(r"([\d.]+)\s*%", foreigners_raw)
        if count_match:
            foreigners_count = int(count_match.group(1))
        if pct_match:
            foreigners_pct = float(pct_match.group(1))

    confederation = parse_header_label(soup, "Confederation")
    fifa_raw = parse_header_label(soup, "FIFA World ranking")
    fifa_ranking = None
    if fifa_raw:
        rank_match = re.search(r"(\d+)", fifa_raw)
        if rank_match:
            fifa_ranking = int(rank_match.group(1))

    return {
        "team_name": team_name,
        "transfermarkt_team_id": parse_transfermarkt_team_id(html),
        "total_market_value_eur": total_value,
        "squad_size": squad_size,
        "average_age": average_age,
        "foreigners_count": foreigners_count,
        "foreigners_pct": foreigners_pct,
        "confederation": confederation,
        "fifa_ranking": fifa_ranking,
        "payload": {"source": "transfermarkt_club_profile_html"},
    }


def parse_squad_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict] = []

    table = soup.find("table", class_=re.compile("items"))
    tbody = table.find("tbody") if table else None
    if not tbody:
        return rows

    for tr in tbody.find_all("tr", class_=re.compile("odd|even")):
        inline = tr.find("table", class_="inline-table")
        player_name = None
        position = None
        tm_player_id = None
        if inline:
            name_cell = inline.find("td", class_="hauptlink")
            anchor = name_cell.find("a") if name_cell else None
            if anchor:
                player_name = anchor.get_text(strip=True)
                href = anchor.get("href", "")
                player_match = re.search(r"/spieler/(\d+)", href)
                if player_match:
                    tm_player_id = int(player_match.group(1))
            inline_rows = inline.find_all("tr")
            if len(inline_rows) >= 2:
                pos_cell = inline_rows[1].find("td")
                if pos_cell:
                    position = pos_cell.get_text(strip=True) or None

        if not player_name:
            continue

        jersey_number = None
        jersey_td = tr.find("td", class_=re.compile("rueckennummer"))
        if jersey_td:
            num_div = jersey_td.find("div", class_="rn_nummer")
            if num_div:
                jersey_number = num_div.get_text(strip=True)

        dob_age = None
        age = None
        club = None
        club_tm_id = None
        for td in tr.find_all("td", class_="zentriert"):
            text = td.get_text(strip=True)
            if re.match(r"\d{2}/\d{2}/\d{4}", text):
                dob_age = text
                age_match = re.search(r"\((\d+)\)", text)
                if age_match:
                    age = int(age_match.group(1))
                continue
            club_anchor = td.find("a", href=re.compile("/verein/"))
            if club_anchor:
                club = club_anchor.get("title") or club_anchor.get_text(strip=True)
                club_match = re.search(r"/verein/(\d+)", club_anchor.get("href", ""))
                if club_match:
                    club_tm_id = int(club_match.group(1))

        market_value_eur = None
        for td in tr.find_all("td", class_=re.compile("rechts")):
            txt = td.get_text(" ", strip=True)
            if "€" in txt:
                value_text = txt.split()[0]
                market_value_eur = parse_market_value_eur(value_text)
                if market_value_eur is not None:
                    break

        rows.append(
            {
                "player_name": player_name,
                "position": position,
                "club": club,
                "market_value_eur": market_value_eur,
                "payload": {
                    "jersey_number": jersey_number,
                    "dob_age": dob_age,
                    "age": age,
                    "transfermarkt_player_id": tm_player_id,
                    "transfermarkt_club_id": club_tm_id,
                },
            }
        )

    return rows


def dedupe_players(players: list[dict]) -> list[dict]:
    from collections import Counter

    counts = Counter(p["player_name"] for p in players)
    result: list[dict] = []
    for player in players:
        name = player["player_name"]
        if counts[name] == 1:
            result.append(player)
            continue
        jersey = player["payload"].get("jersey_number")
        tm_id = player["payload"].get("transfermarkt_player_id")
        if jersey:
            unique_name = f"{name} (#{jersey})"
        elif tm_id:
            unique_name = f"{name} (tm:{tm_id})"
        else:
            unique_name = f"{name} (duplicate)"
        result.append({**player, "player_name": unique_name})
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Transfermarkt squad HTML into Supabase")
    parser.add_argument(
        "--dir",
        type=Path,
        default=DEFAULT_IMPORT_DIR,
        help="Directory containing Transfermarkt HTML snapshots",
    )
    args = parser.parse_args()

    load_env_local()
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    import_dir: Path = args.dir
    if not import_dir.is_dir():
        raise SystemExit(f"Import directory not found: {import_dir}")

    supabase: Client = create_client(url, key)
    snapshot_date = date.today().isoformat()

    html_files = sorted(
        p for p in import_dir.glob("*.html") if "_files" not in p.name
    )
    if not html_files:
        print(f"No HTML files in {import_dir}")
        return

    player_total = 0
    team_total = 0
    skipped: list[str] = []

    for path in html_files:
        team_id = team_id_from_path(path)
        team_name = team_name_from_filename(path)
        if team_id is None:
            skipped.append(f"{path.name}: unknown team mapping")
            continue

        html = path.read_text(encoding="utf-8", errors="ignore")
        players = dedupe_players(parse_squad_html(html))
        if not players:
            skipped.append(f"{path.name}: no players parsed")
            continue

        player_payload = [
            {
                "team_id": team_id,
                "player_name": p["player_name"],
                "snapshot_date": snapshot_date,
                "market_value_eur": p["market_value_eur"],
                "position": p["position"],
                "club": p["club"],
                "payload": p["payload"],
            }
            for p in players
        ]
        supabase.table("transfermarkt_squad_snapshots").upsert(
            player_payload, on_conflict="team_id,player_name,snapshot_date"
        ).execute()
        player_total += len(player_payload)

        team_meta = parse_team_header(html, team_name)
        team_row = {
            "team_id": team_id,
            "snapshot_date": snapshot_date,
            **team_meta,
        }
        supabase.table("transfermarkt_team_squad_snapshots").upsert(
            team_row, on_conflict="team_id,snapshot_date"
        ).execute()
        team_total += 1

        print(
            f"upserted {len(player_payload)} players + team summary "
            f"for {team_name} (team_id={team_id}) from {path.name}"
        )

    print(f"Done. {player_total} player rows and {team_total} team rows upserted.")
    if skipped:
        print("Skipped:")
        for line in skipped:
            print(f"  - {line}")


if __name__ == "__main__":
    main()

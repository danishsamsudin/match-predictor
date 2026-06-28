import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { cestWallClockToVenueLocal } from "@/lib/world-cup/match-kickoff";
import { listWorldCup2026Stadiums } from "@/lib/world-cup/fixture-venues";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";

export type FifaWtwParsedMatch = {
  fifa_match_id: string;
  match_number: number;
  cest_date: string;
  cest_time: string;
  date: string;
  kickoff_time: string;
  stadium: string;
  city: string;
  venue_raw: string;
  home_team: string;
  away_team: string;
};

/** FIFA match-centre ids → official World Cup match numbers (73–88). */
const FIFA_R32_MATCH_NUMBERS: Record<string, number> = {
  "400021518": 73,
  "400021516": 76,
  "400021513": 74,
  "400021522": 75,
  "400021514": 78,
  "400021523": 77,
  "400021520": 79,
  "400021512": 80,
  "400021525": 82,
  "400021524": 81,
  "400021519": 84,
  "400021526": 83,
  "400021527": 85,
  "400021515": 88,
  "400021521": 86,
  "400021517": 87,
};

const FIFA_GENERIC_STADIUM_TO_CANONICAL: Record<string, { stadium: string; city: string }> =
  Object.fromEntries(
    listWorldCup2026Stadiums().flatMap(({ stadium, city }) => {
      const entries: Array<[string, { stadium: string; city: string }]> = [];
      const base = stadium.toLowerCase();
      entries.push([base, { stadium, city }]);
      if (city === "Los Angeles") entries.push(["los angeles stadium", { stadium, city }]);
      if (city === "Houston") entries.push(["houston stadium", { stadium, city }]);
      if (city === "Boston") entries.push(["boston stadium", { stadium, city }]);
      if (city === "Monterrey") entries.push(["monterrey stadium", { stadium, city }]);
      if (city === "Dallas") entries.push(["dallas stadium", { stadium, city }]);
      if (city === "New York")
        entries.push(["new york new jersey stadium", { stadium, city }]);
      if (city === "Mexico City") entries.push(["mexico city stadium", { stadium, city }]);
      if (city === "Atlanta") entries.push(["atlanta stadium", { stadium, city }]);
      if (city === "Seattle") entries.push(["seattle stadium", { stadium, city }]);
      if (city === "San Francisco")
        entries.push(["san francisco bay area stadium", { stadium, city }]);
      if (city === "Toronto") entries.push(["toronto stadium", { stadium, city }]);
      if (city === "Vancouver") entries.push(["bc place vancouver", { stadium, city }]);
      if (city === "Miami") entries.push(["miami stadium", { stadium, city }]);
      if (city === "Kansas City") entries.push(["kansas city stadium", { stadium, city }]);
      return entries;
    })
  );

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateLabel(label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  const m = label.trim().match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

export function canonicalWorldCupTeamName(name: string): string {
  const key = normalizeNationalTeamName(name);
  const team = WORLD_CUP_2026_TEAMS.find(
    (t) => normalizeNationalTeamName(t.name) === key
  );
  return team?.name ?? name.trim();
}

export function resolveFifaGenericStadium(
  stadiumLabel: string,
  cityLabel: string
): { stadium: string; city: string; venue_raw: string } {
  const stadiumKey = normalizeLookupKey(stadiumLabel);
  const fromStadium = FIFA_GENERIC_STADIUM_TO_CANONICAL[stadiumKey];
  if (fromStadium) {
    return {
      stadium: fromStadium.stadium,
      city: fromStadium.city,
      venue_raw: `${fromStadium.stadium} (Neutral Site)`,
    };
  }

  const city = normalizePredictorVenueCity(cityLabel, { defaultWhenUnknown: cityLabel });
  const fromCity = listWorldCup2026Stadiums().find(
    (row) => normalizeLookupKey(row.city) === normalizeLookupKey(city)
  );
  return {
    stadium: fromCity?.stadium ?? stadiumLabel.trim(),
    city,
    venue_raw: `${fromCity?.stadium ?? stadiumLabel.trim()} (Neutral Site)`,
  };
}

type RawFifaRow = {
  fifa_match_id: string;
  cest_date: string | null;
  cest_time: string;
  home_team: string;
  away_team: string;
  stadium: string;
  city: string;
};

function extractRawFifaR32Rows(html: string): RawFifaRow[] {
  const rowRe =
    /<a href="(https:\/\/www\.fifa\.com\/en\/match-centre\/match\/[^"]+)">([\s\S]*?)<\/a>/g;
  const rows: RawFifaRow[] = [];

  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const block = match[2];
    if (!block.includes("Round of 32")) continue;

    const fifaMatchId = match[1].split("/").pop() ?? "";
    const cestTime = block.match(/match-row_matchTime__9QJXJ">([^<]+)</)?.[1]?.trim();
    const teams = [...block.matchAll(/d-none d-md-block">([^<]+)</g)].map((m) => m[1].trim());
    const stadiumMatch = block.match(
      /match-row_stadiumCityLabels__zjXUq"><span>([^<]+)<\/span><span>\(([^)]+)\)<\/span>/
    );
    if (!cestTime || teams.length < 2 || !stadiumMatch) continue;

    const before = html.slice(Math.max(0, match.index - 12000), match.index);
    const dateLabels = [...before.matchAll(/matches-container_title__ATLsl">([^<]+)</g)];
    const cestDate = parseDateLabel(dateLabels.at(-1)?.[1] ?? null);

    rows.push({
      fifa_match_id: fifaMatchId,
      cest_date: cestDate,
      cest_time: cestTime,
      home_team: teams[0]!,
      away_team: teams[1]!,
      stadium: stadiumMatch[1]!.trim(),
      city: stadiumMatch[2]!.trim(),
    });
  }

  return rows;
}

/** Parse FIFA “Game Schedule & Where to Watch” saved HTML for Round of 32 fixtures. */
export function parseFifaWtwR32ScheduleHtml(html: string): FifaWtwParsedMatch[] {
  const parsed: FifaWtwParsedMatch[] = [];

  for (const row of extractRawFifaR32Rows(html)) {
    const matchNumber = FIFA_R32_MATCH_NUMBERS[row.fifa_match_id];
    if (!matchNumber) continue;

    const venue = resolveFifaGenericStadium(row.stadium, row.city);
    const cestDate =
      row.cest_date ??
      parseDateLabel(
        [...html.matchAll(/matches-container_title__ATLsl">([^<]+)</g)]
          .map((m) => m[1])
          .find((label) => label.includes("28 June 2026")) ?? null
      );
    if (!cestDate) continue;

    const local = cestWallClockToVenueLocal({
      cestDate,
      cestTime: row.cest_time,
      venueCity: venue.city,
    });
    if (!local) continue;

    parsed.push({
      fifa_match_id: row.fifa_match_id,
      match_number: matchNumber,
      cest_date: cestDate,
      cest_time: row.cest_time,
      date: local.date,
      kickoff_time: local.time,
      stadium: venue.stadium,
      city: venue.city,
      venue_raw: venue.venue_raw,
      home_team: canonicalWorldCupTeamName(row.home_team),
      away_team: canonicalWorldCupTeamName(row.away_team),
    });
  }

  return parsed.sort((a, b) => a.match_number - b.match_number);
}

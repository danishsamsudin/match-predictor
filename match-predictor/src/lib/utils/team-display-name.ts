import { tryCreateServiceClient } from "@/lib/supabase";

/** Max characters for compact chart / stat labels. */
export const COMPACT_TEAM_LABEL_MAX = 12;

const STOP_WORDS = new Set([
  "fc",
  "cf",
  "ac",
  "sc",
  "afc",
  "bfc",
  "fk",
  "sk",
  "cd",
  "ud",
  "sd",
  "rc",
  "rb",
  "vfb",
  "bv",
  "de",
  "la",
  "le",
  "du",
  "van",
  "der",
  "den",
  "the",
  "and",
  "of",
  "sv",
  "vs",
]);

/** API-Football / Sofascore ids with well-known abbreviations. */
const TEAM_ABBREVIATIONS_BY_ID: Record<number, string> = {
  33: "Man Utd",
  40: "Liverpool",
  42: "Arsenal",
  47: "Spurs",
  49: "Chelsea",
  50: "Man City",
  51: "Brighton",
  52: "Palace",
  55: "Brentford",
  63: "Leeds",
  65: "Forest",
  66: "Villa",
  85: "PSG",
  81: "Marseille",
  91: "Monaco",
  157: "Bayern",
  165: "BVB",
  168: "Leverkusen",
  173: "Leipzig",
  529: "Barça",
  530: "Atleti",
  531: "Athletic",
  541: "Real Madrid",
  489: "Milan",
  492: "Napoli",
  496: "Juventus",
  497: "Roma",
  505: "Inter",
  193: "PSV",
  194: "Ajax",
  195: "Feyenoord",
};

/** Normalized full-name aliases (synced_teams / API naming variants). */
const TEAM_ABBREVIATIONS_BY_NAME: Record<string, string> = {
  "paris saint germain": "PSG",
  "paris saint-germain": "PSG",
  "borussia dortmund": "BVB",
  "manchester united": "Man Utd",
  "manchester city": "Man City",
  "tottenham hotspur": "Spurs",
  "wolverhampton wanderers": "Wolves",
  "nottingham forest": "Forest",
  "west ham united": "West Ham",
  "newcastle united": "Newcastle",
  "brighton and hove albion": "Brighton",
  "crystal palace": "Palace",
  "leicester city": "Leicester",
  "sheffield united": "Sheff Utd",
  "sheffield wednesday": "Sheff Wed",
  "west bromwich albion": "West Brom",
  "atletico madrid": "Atleti",
  "athletic club": "Athletic",
  "real sociedad": "Sociedad",
  "bayern munich": "Bayern",
  "bayer leverkusen": "Leverkusen",
  "rb leipzig": "Leipzig",
  "ac milan": "Milan",
  "inter milan": "Inter",
  "psv eindhoven": "PSV",
  "nac breda": "NAC",
  "go ahead eagles": "GAE",
  "sparta rotterdam": "Sparta",
  "fc twente": "Twente",
  "fc utrecht": "Utrecht",
};

export function normalizeTeamNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ");
}

function inferTeamAbbreviation(name: string, maxLength: number): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxLength) return trimmed;
  if (/^[A-Z0-9]{2,6}$/.test(trimmed)) return trimmed;

  const words = trimmed.split(/[\s\-–./]+/).filter(Boolean);
  const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()) && w.length > 0);

  if (significant.length >= 2) {
    const acronym = significant
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    if (acronym.length >= 2 && acronym.length <= maxLength) return acronym;
  }

  const first = significant[0] ?? words[0];
  if (first) {
    if (first.length <= maxLength) return first;
    return first.slice(0, maxLength);
  }

  return trimmed.slice(0, maxLength);
}

export function resolveTeamShortLabel(input: {
  name: string;
  shortName?: string | null;
  teamId?: number;
  maxLength?: number;
}): string {
  const maxLength = input.maxLength ?? COMPACT_TEAM_LABEL_MAX;
  const name = input.name.trim() || "Team";
  const dbShort = input.shortName?.trim();

  if (dbShort && dbShort.length > 0 && dbShort.length <= maxLength) {
    return dbShort;
  }

  if (input.teamId != null && TEAM_ABBREVIATIONS_BY_ID[input.teamId]) {
    return TEAM_ABBREVIATIONS_BY_ID[input.teamId];
  }

  const byName = TEAM_ABBREVIATIONS_BY_NAME[normalizeTeamNameKey(name)];
  if (byName) return byName;

  if (dbShort && dbShort.length > maxLength) {
    return dbShort.slice(0, maxLength);
  }

  return inferTeamAbbreviation(name, maxLength);
}

export async function fetchTeamShortNamesFromStore(
  teamIds: number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(teamIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Map<number, string>();
  if (!unique.length) return out;

  const supabase = tryCreateServiceClient();
  if (!supabase) return out;

  const { data } = await supabase
    .from("synced_teams")
    .select("team_id, short_name")
    .in("team_id", unique)
    .not("short_name", "is", null);

  for (const row of data ?? []) {
    const short = row.short_name?.trim();
    if (short) out.set(row.team_id, short);
  }

  return out;
}

export async function resolveTeamShortLabelsForMatch(input: {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName?: string | null;
  awayTeamShortName?: string | null;
}): Promise<{ home: string; away: string }> {
  const fromStore = await fetchTeamShortNamesFromStore([
    input.homeTeamId,
    input.awayTeamId,
  ]);

  return {
    home: resolveTeamShortLabel({
      name: input.homeTeamName,
      teamId: input.homeTeamId,
      shortName: input.homeTeamShortName ?? fromStore.get(input.homeTeamId),
    }),
    away: resolveTeamShortLabel({
      name: input.awayTeamName,
      teamId: input.awayTeamId,
      shortName: input.awayTeamShortName ?? fromStore.get(input.awayTeamId),
    }),
  };
}

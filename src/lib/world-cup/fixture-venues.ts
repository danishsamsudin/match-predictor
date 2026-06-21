import fixtureVenueData from "../../../data/world-cup-2026/fixture-venues.json";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";

export type FixtureVenueRecord = {
  match_number: number;
  date: string | null;
  kickoff_time: string | null;
  home_team: string;
  away_team: string;
  venue_raw: string;
  stadium: string;
  city: string;
};

export type ResolvedMatchVenue = {
  stadium: string;
  city: string;
  venue_raw: string | null;
  match_number: number | null;
};

const data = fixtureVenueData as {
  fixtures: FixtureVenueRecord[];
};

function fixtureKey(
  date: string | null | undefined,
  home: string | null | undefined,
  away: string | null | undefined
): string | null {
  if (!date?.trim() || !home?.trim() || !away?.trim()) return null;
  const h = normalizeNationalTeamName(home);
  const a = normalizeNationalTeamName(away);
  const teams = [h, a].sort();
  return `${date.trim()}|${teams[0]}|${teams[1]}`;
}

const byFixtureKey = new Map<string, FixtureVenueRecord>();
const byTeamsKey = new Map<string, FixtureVenueRecord>();
const byVenueRaw = new Map<string, FixtureVenueRecord>();

function teamsOnlyKey(
  home: string | null | undefined,
  away: string | null | undefined
): string | null {
  if (!home?.trim() || !away?.trim()) return null;
  const teams = [
    normalizeNationalTeamName(home),
    normalizeNationalTeamName(away),
  ].sort();
  return `${teams[0]}|${teams[1]}`;
}

for (const row of data.fixtures ?? []) {
  const key = fixtureKey(row.date, row.home_team, row.away_team);
  if (key) byFixtureKey.set(key, row);
  const tk = teamsOnlyKey(row.home_team, row.away_team);
  if (tk) byTeamsKey.set(tk, row);
  const rawKey = normalizeVenueLabel(row.venue_raw);
  if (rawKey) byVenueRaw.set(rawKey, row);
}

/** Lowercase venue label with neutral-site suffix and punctuation normalized for lookup. */
export function normalizeVenueLabel(label: string | null | undefined): string {
  if (!label?.trim()) return "";
  return label
    .trim()
    .toLowerCase()
    .replace(/\s*\(neutral\s*site\)\s*/gi, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** All 16 World Cup 2026 host stadiums with canonical city (from official schedule). */
export function listWorldCup2026Stadiums(): Array<{ stadium: string; city: string }> {
  const seen = new Set<string>();
  const out: Array<{ stadium: string; city: string }> = [];
  for (const row of data.fixtures ?? []) {
    const key = row.stadium;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ stadium: row.stadium, city: row.city });
  }
  return out.sort((a, b) => a.city.localeCompare(b.city));
}

/** Resolve stadium + host city for a tournament fixture. */
export function resolveFixtureVenue(input: {
  date?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  venue?: string | null;
  venue_city?: string | null;
}): ResolvedMatchVenue | null {
  const key = fixtureKey(input.date, input.homeName, input.awayName);
  const fromTeams = key ? byFixtureKey.get(key) : undefined;
  if (fromTeams) {
    return {
      stadium: fromTeams.stadium,
      city: fromTeams.city,
      venue_raw: fromTeams.venue_raw,
      match_number: fromTeams.match_number,
    };
  }

  const venueHint = input.venue_city ?? input.venue ?? null;
  const fromVenueMeta = resolveStadiumVenue(venueHint);
  if (fromVenueMeta) {
    const rawKey = normalizeVenueLabel(venueHint);
    const fromRaw = rawKey ? byVenueRaw.get(rawKey) : undefined;
    return {
      stadium: fromRaw?.stadium ?? venueHint?.trim() ?? fromVenueMeta.city,
      city: fromVenueMeta.city,
      venue_raw: fromRaw?.venue_raw ?? venueHint,
      match_number: fromRaw?.match_number ?? null,
    };
  }

  const rawKey = normalizeVenueLabel(venueHint);
  const fromRaw = rawKey ? byVenueRaw.get(rawKey) : undefined;
  if (fromRaw) {
    return {
      stadium: fromRaw.stadium,
      city: fromRaw.city,
      venue_raw: fromRaw.venue_raw,
      match_number: fromRaw.match_number,
    };
  }

  return null;
}

export function lookupFixtureRow(input: {
  date?: string | null;
  homeName?: string | null;
  awayName?: string | null;
}): FixtureVenueRecord | undefined {
  const key = fixtureKey(input.date, input.homeName, input.awayName);
  const fromDate = key ? byFixtureKey.get(key) : undefined;
  if (fromDate) return fromDate;
  if (input.date?.trim()) return undefined;
  const tk = teamsOnlyKey(input.homeName, input.awayName);
  return tk ? byTeamsKey.get(tk) : undefined;
}

/** Canonical home/away from the official FIFA schedule (fixture-venues.json). */
export function resolveOfficialFixtureTeams(input: {
  date?: string | null;
  homeName?: string | null;
  awayName?: string | null;
}): { home: string; away: string } | null {
  const row = lookupFixtureRow(input);
  if (!row) return null;
  return { home: row.home_team, away: row.away_team };
}

/** Official schedule date, kickoff, and match number when the fixture is in the draw. */
export function resolveFixtureScheduleMeta(input: {
  date?: string | null;
  time?: string | null;
  homeName?: string | null;
  awayName?: string | null;
}): {
  date: string;
  kickoff_time: string | null;
  match_number: number;
} | null {
  const row = lookupFixtureRow(input);
  if (!row) return null;
  return {
    date: row.date ?? input.date ?? "",
    kickoff_time: row.kickoff_time ?? input.time ?? null,
    match_number: row.match_number,
  };
}

import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import type { ForecastMatchResult } from "@/lib/world-cup/tournament-simulation";
import type { WcMatchRow } from "@/lib/world-cup/standings";

const DEFAULT_NATIONAL_LEAGUE_ID = 1;
const DEFAULT_NATIONAL_COUNTRY = "International";

export type NationalPredictorPrefill = {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  city: string;
  date: string;
  time: string;
};

export function resolveNationalTeamApiId(teamName: string): number | null {
  const key = normalizeNationalTeamName(teamName);
  const team = WORLD_CUP_2026_TEAMS.find(
    (t) => normalizeNationalTeamName(t.name) === key
  );
  return team?.id ?? null;
}

/** Build predictor URL from official fixture home/away (World Cup cards). */
export function buildNationalPredictorUrlFromMatch(match: WcMatchRow): string | null {
  return buildNationalPredictorUrl({
    homeName: match.home_team_name ?? "Home",
    awayName: match.away_team_name ?? "Away",
    city: match.venue_city ?? match.venue,
    date: match.date,
    time: match.time,
    worldCupFixture: true,
  });
}

/** Build predictor URL with national teams, venue, and kickoff pre-filled (compare mode). */
export function buildNationalPredictorUrl(input: {
  homeName: string;
  awayName: string;
  city?: string | null;
  date?: string | null;
  time?: string | null;
  /** Use a geocodable default when venue is missing (World Cup hub links). */
  worldCupFixture?: boolean;
}): string | null {
  const homeId = resolveNationalTeamApiId(input.homeName);
  const awayId = resolveNationalTeamApiId(input.awayName);
  if (homeId == null || awayId == null) return null;

  const params = new URLSearchParams({
    entity: "national",
    mode: "compare",
    home: String(homeId),
    away: String(awayId),
    homeName: input.homeName,
    awayName: input.awayName,
    city: normalizePredictorVenueCity(input.city, {
      defaultWhenUnknown: input.worldCupFixture ? "Mexico City" : "Neutral",
    }),
  });

  if (input.date) params.set("date", input.date);
  const time = input.time ? normalizeKickoffTime(input.time) : "";
  if (time) params.set("time", time);

  return `/predict?${params.toString()}`;
}

const PLACEHOLDER_TEAM = /^tbd$/i;

/** Open the main predictor (compare mode) for a bracket match with venue and kickoff pre-filled. */
export function buildBracketMatchPredictorUrl(match: ForecastMatchResult): string | null {
  if (
    PLACEHOLDER_TEAM.test(match.homeTeam.teamName.trim()) ||
    PLACEHOLDER_TEAM.test(match.awayTeam.teamName.trim())
  ) {
    return null;
  }

  return buildNationalPredictorUrl({
    homeName: match.homeTeam.teamName,
    awayName: match.awayTeam.teamName,
    city: match.city,
    date: match.date,
    time: match.kickoffTime,
    worldCupFixture: true,
  });
}

function normalizeKickoffTime(time: string): string {
  const trimmed = time.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2}):(\d{2}):/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return trimmed;
}

export function parsePredictorPrefillFromSearchParams(
  params: URLSearchParams
): Partial<NationalPredictorPrefill> & { entityType: "national" | "club"; inputMode: "fixture" | "compare" } | null {
  const home = params.get("home");
  const away = params.get("away");
  if (!home || !away) return null;

  const entity = params.get("entity") === "club" ? "club" : "national";
  const mode = params.get("mode") === "fixture" ? "fixture" : "compare";
  const defaultCity = entity === "national" ? "Mexico City" : "Manchester";

  return {
    entityType: entity,
    inputMode: mode,
    homeTeamId: Number(home),
    awayTeamId: Number(away),
    homeName: params.get("homeName") ?? "",
    awayName: params.get("awayName") ?? "",
    city: normalizePredictorVenueCity(params.get("city") ?? defaultCity, {
      defaultWhenUnknown: defaultCity,
    }),
    date: params.get("date") ?? undefined,
    time: params.get("time") ?? undefined,
  };
}

export const PREDICTOR_PREFILL_DEFAULTS = {
  nationalLeagueId: DEFAULT_NATIONAL_LEAGUE_ID,
  nationalCountry: DEFAULT_NATIONAL_COUNTRY,
} as const;

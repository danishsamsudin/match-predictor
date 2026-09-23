import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
  WORLD_CUP_REFERENCE_LEAGUE_ID,
} from "@/lib/data/world-cup-2026-teams";
import {
  NATIONS_LEAGUE_2026_TEAMS,
  NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
} from "@/lib/data/nations-league-2026-teams";
import { utcIsoToWcDateTime } from "@/lib/utils/kickoff-display";
import { resolveWcKickoffForFixture } from "@/lib/world-cup/match-kickoff";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import type { ForecastMatchResult } from "@/lib/world-cup/tournament-simulation";
import type { WcMatchRow } from "@/lib/world-cup/standings";

/** Default for /predict national compare (Nations League is the active cycle). */
const DEFAULT_NATIONAL_LEAGUE_ID = NATIONS_LEAGUE_REFERENCE_LEAGUE_ID;
const DEFAULT_NATIONAL_COUNTRY = "International";

const NATIONAL_TEAM_CATALOG = [...WORLD_CUP_2026_TEAMS, ...NATIONS_LEAGUE_2026_TEAMS];

export type NationalPredictorPrefill = {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  city: string;
  date: string;
  time: string;
  homeLeagueId?: number;
  awayLeagueId?: number;
};

export function resolveNationalTeamApiId(teamName: string): number | null {
  const key = normalizeNationalTeamName(teamName);
  const team = NATIONAL_TEAM_CATALOG.find(
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
    leagueId: WORLD_CUP_REFERENCE_LEAGUE_ID,
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
  /** National reference league (1 = World Cup, 5 = Nations League). */
  leagueId?: number;
}): string | null {
  const homeId = resolveNationalTeamApiId(input.homeName);
  const awayId = resolveNationalTeamApiId(input.awayName);
  if (homeId == null || awayId == null) return null;

  const resolvedKickoff = input.worldCupFixture
    ? resolveWcKickoffForFixture({
        date: input.date,
        time: input.time,
        homeName: input.homeName,
        awayName: input.awayName,
        venueCity: input.city,
      })
    : null;

  const city =
    resolvedKickoff?.venueCity ??
    normalizePredictorVenueCity(input.city, {
      defaultWhenUnknown: input.worldCupFixture ? "Mexico City" : "London",
    });

  const leagueId =
    input.leagueId ??
    (input.worldCupFixture ? WORLD_CUP_REFERENCE_LEAGUE_ID : DEFAULT_NATIONAL_LEAGUE_ID);
  const params = new URLSearchParams({
    entity: "national",
    mode: "compare",
    home: String(homeId),
    away: String(awayId),
    homeName: input.homeName,
    awayName: input.awayName,
    city,
    league: String(leagueId),
  });

  const kickoffUtc = resolvedKickoff?.kickoffUtc ?? null;
  if (kickoffUtc) params.set("kickoffUtc", kickoffUtc);

  const date = resolvedKickoff?.cestDate ?? input.date;
  const time = resolvedKickoff?.cestTime ?? (input.time ? normalizeKickoffTime(input.time) : "");
  if (date) params.set("date", date);
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
    leagueId: WORLD_CUP_REFERENCE_LEAGUE_ID,
  });
}

function normalizeKickoffTime(time: string): string {
  const trimmed = time.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/);
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
  const leagueParam = params.get("league");
  const leagueId = leagueParam != null && Number.isFinite(Number(leagueParam))
    ? Number(leagueParam)
    : undefined;
  const defaultCity =
    entity === "national"
      ? leagueId === WORLD_CUP_REFERENCE_LEAGUE_ID
        ? "Mexico City"
        : "Paris"
      : "Manchester";
  const homeName = params.get("homeName") ?? "";
  const awayName = params.get("awayName") ?? "";
  const city = normalizePredictorVenueCity(params.get("city") ?? defaultCity, {
    defaultWhenUnknown: defaultCity,
  });

  const kickoffUtc = params.get("kickoffUtc");
  let date = params.get("date") ?? undefined;
  let time = params.get("time") ?? undefined;

  if (kickoffUtc) {
    const cest = utcIsoToWcDateTime(kickoffUtc);
    date = cest.date;
    time = cest.time;
  } else if (entity === "national" && homeName && awayName && leagueId !== 5) {
    const resolved = resolveWcKickoffForFixture({
      date,
      time,
      homeName,
      awayName,
      venueCity: city,
    });
    if (resolved) {
      date = resolved.cestDate;
      time = resolved.cestTime;
    }
  }

  return {
    entityType: entity,
    inputMode: mode,
    homeTeamId: Number(home),
    awayTeamId: Number(away),
    homeName,
    awayName,
    city,
    date,
    time,
    homeLeagueId: leagueId,
    awayLeagueId: leagueId,
  };
}

export const PREDICTOR_PREFILL_DEFAULTS = {
  nationalLeagueId: DEFAULT_NATIONAL_LEAGUE_ID,
  nationalCountry: DEFAULT_NATIONAL_COUNTRY,
} as const;

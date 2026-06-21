import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { utcIsoToWcDateTime } from "@/lib/utils/kickoff-display";
import { resolveWcKickoffForFixture } from "@/lib/world-cup/match-kickoff";
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
      defaultWhenUnknown: input.worldCupFixture ? "Mexico City" : "Neutral",
    });

  const params = new URLSearchParams({
    entity: "national",
    mode: "compare",
    home: String(homeId),
    away: String(awayId),
    homeName: input.homeName,
    awayName: input.awayName,
    city,
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
  const defaultCity = entity === "national" ? "Mexico City" : "Manchester";

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
  } else if (entity === "national" && homeName && awayName) {
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
  };
}

export const PREDICTOR_PREFILL_DEFAULTS = {
  nationalLeagueId: DEFAULT_NATIONAL_LEAGUE_ID,
  nationalCountry: DEFAULT_NATIONAL_COUNTRY,
} as const;

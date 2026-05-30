import { shouldUseMockApis } from "@/lib/config/api-mode";
import { usesSportApi } from "@/lib/config/football-provider";
import {
  sportApiLookupCountries,
  sportApiLookupFixtures,
  sportApiLookupTeams,
} from "@/lib/api/sportapi";
import {
  getCountries,
  getLeaguesByCountry,
  getLeagueById,
  getTeamCity,
  getTeamsByLeague,
} from "@/lib/data/football-reference";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import type { Fixture } from "@/lib/types/football";
import type {
  CountryOption,
  FixtureOption,
  LeagueOption,
  TeamOption,
} from "@/lib/types/football-lookup";
import { createRapidApiClient, getApiFootballRapidApiHost } from "@/lib/config/rapidapi";
import { UpstreamApiError } from "@/lib/types/prediction";
import axios from "axios";

function getFootballClient() {
  return createRapidApiClient(getApiFootballRapidApiHost(), { timeout: 15000 });
}

function fixtureToOption(fixture: Fixture): FixtureOption {
  return {
    id: fixture.fixture.id,
    date: fixture.fixture.date,
    venueCity: fixture.fixture.venue.city,
    league: fixture.league,
    home: fixture.teams.home,
    away: fixture.teams.away,
  };
}

function buildMockFixtures(leagueId: number): FixtureOption[] {
  const league = getLeagueById(leagueId);
  const teams = getTeamsByLeague(leagueId);
  if (!league || teams.length < 2) return [];

  const baseDate = new Date("2026-05-29T15:00:00.000Z");
  const pairings: Array<[number, number]> = [];

  for (let i = 0; i < Math.min(teams.length - 1, 8); i += 2) {
    pairings.push([i, i + 1]);
  }

  return pairings.map(([homeIdx, awayIdx], index) => {
    const home = teams[homeIdx];
    const away = teams[awayIdx];
    const kickoff = new Date(baseDate.getTime() + index * 2 * 24 * 60 * 60 * 1000);
    kickoff.setUTCHours(15 + (index % 3) * 2, 0, 0, 0);

    return {
      id: 1_000_000 + leagueId * 100 + index,
      date: kickoff.toISOString(),
      venueCity: getTeamCity(home.id),
      league: { id: league.id, name: league.name, season: league.season },
      home: { id: home.id, name: home.name },
      away: { id: away.id, name: away.name },
    };
  });
}

export async function lookupCountries(): Promise<CountryOption[]> {
  if (shouldUseMockApis()) {
    return getCountries();
  }
  if (usesSportApi()) {
    try {
      return await sportApiLookupCountries();
    } catch {
      return getCountries();
    }
  }
  return getCountries();
}

export async function lookupLeagues(country: string): Promise<LeagueOption[]> {
  return getLeaguesByCountry(country);
}

export async function lookupTeams(leagueId: number): Promise<TeamOption[]> {
  if (shouldUseMockApis()) {
    return getTeamsByLeague(leagueId);
  }
  if (usesSportApi()) {
    try {
      const teams = await sportApiLookupTeams(leagueId);
      if (teams.length) return teams;
    } catch {
      // fall through to reference
    }
  }
  return getTeamsByLeague(leagueId);
}

export type FixtureDataSource = "live" | "mock" | "reference";

export async function lookupFixtures(
  leagueId: number
): Promise<{ fixtures: FixtureOption[]; source: FixtureDataSource }> {
  const league = getLeagueById(leagueId);
  if (!league) return { fixtures: [], source: "reference" };

  if (shouldUseMockApis()) {
    return { fixtures: buildMockFixtures(leagueId), source: "mock" };
  }

  if (usesSportApi()) {
    const fixtures = await sportApiLookupFixtures(leagueId);
    if (fixtures.length) return { fixtures, source: "live" };
    throw new UpstreamApiError(
      "No upcoming fixtures returned from SportAPI7 for this league. Check your RapidAPI subscription."
    );
  }

  const results = await cachedFetch<Fixture[]>({
    provider: "football",
    cacheKey: `football:fixtures:league:${leagueId}:${league.season}:next20`,
    ttlMs: TTL.FOOTBALL,
    dailyLimit: DAILY_LIMITS.football,
    fetcher: async () => {
      const client = getFootballClient();
      const response = await client.get<{ response: Fixture[] }>("/fixtures", {
        params: { league: leagueId, season: league.season, next: 20 },
      });
      return response.data.response;
    },
  }).then((r) => r.data);

  if (results.length > 0) {
    return {
      fixtures: results.map(fixtureToOption),
      source: "live",
    };
  }

  return { fixtures: buildMockFixtures(leagueId), source: "reference" };
}

export function formatFixtureLabel(fixture: FixtureOption): string {
  const kickoff = new Date(fixture.date);
  const dateLabel = kickoff.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = kickoff.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
  return `${fixture.home.name} vs ${fixture.away.name} · ${dateLabel} ${timeLabel}`;
}

export function parseFixtureDateTime(isoDate: string): { date: string; time: string } {
  const kickoff = new Date(isoDate);
  const date = kickoff.toISOString().slice(0, 10);
  const time = kickoff.toISOString().slice(11, 16);
  return { date, time };
}

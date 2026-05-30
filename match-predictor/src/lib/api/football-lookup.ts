import { shouldUseMockApis } from "@/lib/config/api-mode";
import { useSupabaseDataStore } from "@/lib/config/data-source";
import { usesSportApi } from "@/lib/config/football-provider";
import {
  loadFixturesFromStore,
  loadLeaguesFromReference,
  loadTeamsFromStore,
} from "@/lib/data/football-store";
import { syncLeagueFixturesToStore } from "@/lib/sync/sync-league-fixtures";
import {
  sportApiLookupCountries,
  sportApiLookupFixtures,
  sportApiLookupTeams,
} from "@/lib/api/sportapi";
import {
  getCountries,
  getLeaguesByCountry,
  getLeagueById,
  getLeagueEntityType,
  getTeamCity,
  getTeamsByLeague,
  isKnownClubTeamName,
} from "@/lib/data/football-reference";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import type { Fixture } from "@/lib/types/football";
import type {
  CountryOption,
  EntityType,
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

export async function lookupCountries(entityType?: EntityType): Promise<CountryOption[]> {
  if (shouldUseMockApis()) {
    return getCountries(entityType);
  }
  if (usesSportApi()) {
    try {
      const fromApi = await sportApiLookupCountries();
      if (entityType) {
        const allowed = new Set(getCountries(entityType).map((c) => c.name));
        return fromApi.filter((c) => allowed.has(c.name));
      }
      return fromApi;
    } catch {
      return getCountries(entityType);
    }
  }
  return getCountries(entityType);
}

export async function lookupLeagues(
  country: string,
  entityType?: EntityType
): Promise<LeagueOption[]> {
  if (useSupabaseDataStore()) {
    return loadLeaguesFromReference(country, entityType);
  }
  return getLeaguesByCountry(country, entityType);
}

function resolveEntityType(leagueId: number, entityType?: EntityType): EntityType {
  return entityType ?? getLeagueEntityType(leagueId);
}

/** Drop club sides when loading a national competition. */
function filterNationalTeams(teams: TeamOption[]): TeamOption[] {
  return teams.filter((t) => !isKnownClubTeamName(t.name));
}

/** Prefer stable reference ids; merge in API/store teams matched by name. */
function mergeNationalTeamLists(reference: TeamOption[], live: TeamOption[]): TeamOption[] {
  const refByName = new Map(reference.map((t) => [t.name.toLowerCase(), t]));
  const merged = new Map<number, TeamOption>();

  for (const team of live) {
    if (isKnownClubTeamName(team.name)) continue;
    const ref = refByName.get(team.name.toLowerCase());
    merged.set(ref?.id ?? team.id, ref ?? team);
  }
  for (const team of reference) {
    merged.set(team.id, team);
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function lookupTeams(
  leagueId: number,
  entityType?: EntityType
): Promise<TeamOption[]> {
  const effectiveEntity = resolveEntityType(leagueId, entityType);
  const reference = getTeamsByLeague(leagueId);

  if (shouldUseMockApis()) {
    return effectiveEntity === "national" && reference.length
      ? reference
      : getTeamsByLeague(leagueId);
  }

  if (effectiveEntity === "national") {
    let live: TeamOption[] = [];

    if (useSupabaseDataStore()) {
      live = filterNationalTeams(await loadTeamsFromStore(leagueId, "national"));
    } else if (usesSportApi()) {
      try {
        live = filterNationalTeams(await sportApiLookupTeams(leagueId, "national"));
      } catch {
        // fall through
      }
    }

    if (reference.length) {
      return live.length ? mergeNationalTeamLists(reference, live) : reference;
    }
    return live;
  }

  if (useSupabaseDataStore()) {
    const teams = await loadTeamsFromStore(leagueId, entityType);
    if (teams.length) return teams;
    return getTeamsByLeague(leagueId);
  }
  if (usesSportApi()) {
    try {
      const teams = await sportApiLookupTeams(leagueId, "club");
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
): Promise<{ fixtures: FixtureOption[]; source: FixtureDataSource; message?: string }> {
  const league = getLeagueById(leagueId);
  if (!league) return { fixtures: [], source: "reference" };

  if (shouldUseMockApis()) {
    return { fixtures: buildMockFixtures(leagueId), source: "mock" };
  }

  if (useSupabaseDataStore()) {
    let fixtures = await loadFixturesFromStore(leagueId);

    if (!fixtures.length) {
      const sync = await syncLeagueFixturesToStore(leagueId);
      if (sync.ok && sync.fixturesSynced > 0) {
        fixtures = await loadFixturesFromStore(leagueId);
      }
    }

    if (fixtures.length) {
      return {
        fixtures,
        source: "live",
        message: "Fixtures loaded from Supabase (synced on demand when needed).",
      };
    }

    try {
      const live = await sportApiLookupFixtures(leagueId);
      if (live.length) {
        return {
          fixtures: live,
          source: "live",
          message:
            "Showing live fixtures. Run POST /api/cron/sync to cache full match data for predictions.",
        };
      }
    } catch {
      // fall through to empty message
    }

    return {
      fixtures: [],
      source: "live",
      message:
        "No upcoming matches found for this competition. Check your RapidAPI key and daily limit, or try again later.",
    };
  }

  if (usesSportApi()) {
    const fixtures = await sportApiLookupFixtures(leagueId);
    if (fixtures.length) return { fixtures, source: "live" };
    return {
      fixtures: [],
      source: "live",
      message:
        "No upcoming matches found for this competition in SportAPI7. Try another league or check back when the season has scheduled fixtures.",
    };
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

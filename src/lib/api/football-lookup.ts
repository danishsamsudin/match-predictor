import {
  formatFixtureKickoffLocal,
  utcIsoToLocalDateTime,
} from "@/lib/utils/kickoff-display";
import { shouldUseMockApis } from "@/lib/config/api-mode";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { usesSportApi } from "@/lib/config/football-provider";
import {
  loadFixturesFromStore,
  loadLeaguesFromReference,
  loadTeamsFromStandingsStore,
  loadTeamsFromStore,
} from "@/lib/data/football-store";
import { importFixturesFromFbref } from "@/lib/soccerdata/import-fixtures";
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
import { enrichTeamsWithLogos } from "@/lib/data/team-logos";
import {
  filterToWorldCupTeams,
  isWorldCupLeague,
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
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

function startOfTodayUtcMs(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Keep only real kickoffs from start of today (UTC) onward. */
function filterUpcomingFixtures(fixtures: FixtureOption[]): FixtureOption[] {
  const cutoff = startOfTodayUtcMs();
  return fixtures.filter((fixture) => {
    const kickoff = new Date(fixture.date).getTime();
    return Number.isFinite(kickoff) && kickoff >= cutoff;
  });
}

function buildMockFixtures(leagueId: number): FixtureOption[] {
  const league = getLeagueById(leagueId);
  const teams = getTeamsByLeague(leagueId);
  if (!league || teams.length < 2) return [];

  const baseDate = new Date();
  baseDate.setUTCHours(15, 0, 0, 0);
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
  if (entityType === "national") {
    return getCountries("national");
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
  if (isSupabaseDataStore()) {
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
  const refByName = new Map(
    reference.map((t) => [normalizeNationalTeamName(t.name), t])
  );
  const merged = new Map<number, TeamOption>();

  for (const team of live) {
    if (isKnownClubTeamName(team.name)) continue;
    const ref = refByName.get(normalizeNationalTeamName(team.name));
    merged.set(ref?.id ?? team.id, ref ? { ...ref, name: team.name } : team);
  }
  for (const team of reference) {
    merged.set(team.id, team);
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function finishTeams(teams: TeamOption[], effectiveEntity: EntityType): TeamOption[] {
  return enrichTeamsWithLogos(teams, effectiveEntity);
}

function mergeClubTeamLists(...lists: TeamOption[][]): TeamOption[] {
  const byId = new Map<number, TeamOption>();
  for (const list of lists) {
    for (const team of list) {
      if (!team.id || !team.name) continue;
      const existing = byId.get(team.id);
      byId.set(team.id, existing ? { ...existing, ...team, name: team.name } : team);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Domestic leagues should list essentially the full table; cups vary. */
function isIncompleteClubTeamList(leagueId: number, teams: TeamOption[]): boolean {
  const league = getLeagueById(leagueId);
  if (!league || league.entityType !== "club") return false;
  const minTeams = league.type === "Cup" ? 8 : 14;
  return teams.length < minTeams;
}

async function resolveClubTeams(
  leagueId: number,
  entityType: EntityType | undefined,
  reference: TeamOption[]
): Promise<TeamOption[]> {
  const sources: TeamOption[][] = [reference];

  if (isSupabaseDataStore()) {
    const fromTable = await loadTeamsFromStore(leagueId, entityType);
    if (fromTable.length) sources.push(fromTable);
    const fromStandings = await loadTeamsFromStandingsStore(leagueId);
    if (fromStandings.length) sources.push(fromStandings);
  }

  let merged = mergeClubTeamLists(...sources);

  if (isIncompleteClubTeamList(leagueId, merged) && usesSportApi()) {
    try {
      const live = await sportApiLookupTeams(leagueId, "club");
      if (live.length) merged = mergeClubTeamLists(merged, live);
    } catch {
      // keep merged store/reference list
    }
  } else if (!isSupabaseDataStore() && usesSportApi()) {
    try {
      const live = await sportApiLookupTeams(leagueId, "club");
      if (live.length) merged = mergeClubTeamLists(merged, live);
    } catch {
      // keep reference
    }
  }

  return merged.length ? merged : reference;
}

export async function lookupTeams(
  leagueId: number,
  entityType?: EntityType
): Promise<TeamOption[]> {
  const effectiveEntity = resolveEntityType(leagueId, entityType);
  const reference = getTeamsByLeague(leagueId);

  if (shouldUseMockApis()) {
    return finishTeams(
      effectiveEntity === "national" && reference.length ? reference : getTeamsByLeague(leagueId),
      effectiveEntity
    );
  }

  if (effectiveEntity === "national") {
    let live: TeamOption[] = [];

    if (isSupabaseDataStore()) {
      live = filterNationalTeams(await loadTeamsFromStore(leagueId, "national"));
    } else if (usesSportApi()) {
      try {
        live = filterNationalTeams(await sportApiLookupTeams(leagueId, "national"));
      } catch {
        // fall through
      }
    }

    const referenceTeams = isWorldCupLeague(leagueId)
      ? WORLD_CUP_2026_TEAMS
      : reference.length
        ? reference
        : [];
    const merged = live.length
      ? mergeNationalTeamLists(referenceTeams, live)
      : referenceTeams;
    const teams = isWorldCupLeague(leagueId) ? filterToWorldCupTeams(merged) : merged;

    if (teams.length) {
      return finishTeams(teams, effectiveEntity);
    }
    return finishTeams(isWorldCupLeague(leagueId) ? WORLD_CUP_2026_TEAMS : live, effectiveEntity);
  }

  const clubTeams = await resolveClubTeams(leagueId, entityType, reference);
  return finishTeams(clubTeams, effectiveEntity);
}

export type FixtureDataSource = "live" | "mock" | "reference";

export async function lookupFixtures(
  leagueId: number
): Promise<{ fixtures: FixtureOption[]; source: FixtureDataSource; message?: string }> {
  const league = getLeagueById(leagueId);
  if (!league) return { fixtures: [], source: "reference" };

  if (shouldUseMockApis()) {
    return { fixtures: filterUpcomingFixtures(buildMockFixtures(leagueId)), source: "mock" };
  }

  if (isSupabaseDataStore()) {
    let fixtures = await loadFixturesFromStore(leagueId);

    if (!fixtures.length) {
      const sync = await syncLeagueFixturesToStore(leagueId);
      if (sync.ok && sync.fixturesSynced > 0) {
        fixtures = await loadFixturesFromStore(leagueId);
      }
    }

    if (!fixtures.length) {
      try {
        const imported = await importFixturesFromFbref({
          referenceLeagueId: leagueId,
          seasons: [league.season],
        });
        if (imported.fixturesUpserted > 0) {
          fixtures = await loadFixturesFromStore(leagueId);
        }
      } catch {
        // ignore SoccerData backfill errors and fall through
      }
    }

    const upcomingFromStore = filterUpcomingFixtures(fixtures);
    if (upcomingFromStore.length) {
      return {
        fixtures: upcomingFromStore,
        source: "live",
        message:
          "Fixtures loaded from Supabase (synced on demand when needed; SoccerData backfill when live feeds are empty).",
      };
    }

    try {
      const live = filterUpcomingFixtures(await sportApiLookupFixtures(leagueId));
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
        "No upcoming matches found for this competition. Try again later or choose another league.",
    };
  }

  if (usesSportApi()) {
    const fixtures = filterUpcomingFixtures(await sportApiLookupFixtures(leagueId));
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

  const upcoming = filterUpcomingFixtures(results.map(fixtureToOption));
  if (upcoming.length > 0) {
    return {
      fixtures: upcoming,
      source: "live",
    };
  }

  return {
    fixtures: [],
    source: "live",
    message:
      "No upcoming matches found for this competition. Try another league or check back when fixtures are scheduled.",
  };
}

export function formatFixtureLabel(fixture: FixtureOption): string {
  const timePart = formatFixtureKickoffLocal(fixture.date);
  return `${fixture.home.name} vs ${fixture.away.name} · ${timePart}`;
}

export function parseFixtureDateTime(isoDate: string): { date: string; time: string } {
  return utcIsoToLocalDateTime(isoDate);
}

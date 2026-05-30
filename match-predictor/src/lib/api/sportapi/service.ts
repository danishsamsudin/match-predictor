import {
  resolveSportApiLeague,
  SPORTAPI_CATEGORY_COUNTRIES,
  SPORTAPI_LEAGUE_MAP,
} from "@/lib/config/sportapi-leagues";
import { getLeagueById } from "@/lib/data/football-reference";
import type {
  Fixture,
  FixtureLineup,
  FixtureResult,
  FootballBundle,
  TeamInfo,
  TeamStatistics,
  TopScorer,
} from "@/lib/types/football";
import type { CountryOption, FixtureOption, TeamOption } from "@/lib/types/football-lookup";
import { UpstreamApiError } from "@/lib/types/prediction";
import type {
  SportApiCategoriesResponse,
  SportApiEvent,
  SportApiH2HResponse,
  SportApiLineupsResponse,
  SportApiScheduledEventsResponse,
  SportApiSeasonsResponse,
  SportApiStandingsResponse,
  SportApiStatisticsResponse,
  SportApiTeamEventsResponse,
  SportApiTopPlayersResponse,
} from "@/lib/types/sportapi";
import { addDays, sportApiGet, todayDateString } from "./client";

function referenceLeagueIdFromTournament(uniqueTournamentId?: number): number {
  if (!uniqueTournamentId) return 39;
  const entry = Object.entries(SPORTAPI_LEAGUE_MAP).find(
    ([, v]) => v.uniqueTournamentId === uniqueTournamentId
  );
  return entry ? Number(entry[0]) : 39;
}
import {
  enrichTeamStatsFromMatchStatistics,
  mapEventToFixture,
  mapEventToFixtureOption,
  mapEventToFixtureResult,
  mapLineups,
  mapStandingsRowToTeamStatistics,
  mapTeamInfo,
  mapTopScorers,
  parseSeasonYear,
} from "./mappers";

async function getCurrentSeasonId(uniqueTournamentId: number): Promise<number> {
  const data = await sportApiGet<SportApiSeasonsResponse>(
    `/api/v1/unique-tournament/${uniqueTournamentId}/seasons`,
    `seasons:${uniqueTournamentId}`
  );
  const seasons = data.seasons ?? [];
  if (!seasons.length) {
    throw new UpstreamApiError(`No seasons found for tournament ${uniqueTournamentId}`);
  }
  return seasons[0].id;
}

async function getStandings(
  uniqueTournamentId: number,
  seasonId: number
): Promise<SportApiStandingsResponse> {
  return sportApiGet<SportApiStandingsResponse>(
    `/api/v1/unique-tournament/${uniqueTournamentId}/season/${seasonId}/standings/total`,
    `standings:${uniqueTournamentId}:${seasonId}`
  );
}

function findStandingsRow(
  standings: SportApiStandingsResponse,
  teamId: number
): SportApiStandingsResponse["standings"][0]["rows"][0] | undefined {
  for (const group of standings.standings ?? []) {
    const row = group.rows?.find((r) => r.team.id === teamId);
    if (row) return row;
  }
  return undefined;
}

async function fetchScheduledEventsForDate(date: string): Promise<SportApiEvent[]> {
  const data = await sportApiGet<SportApiScheduledEventsResponse>(
    `/api/v1/sport/football/scheduled-events/${date}`,
    `scheduled:football:${date}`
  );
  return data.events ?? [];
}

async function fetchUpcomingEventsForTournament(
  uniqueTournamentId: number,
  daysAhead = 14
): Promise<SportApiEvent[]> {
  const start = todayDateString();
  const dates = Array.from({ length: daysAhead }, (_, i) => addDays(start, i));
  const batches = await Promise.all(dates.map((d) => fetchScheduledEventsForDate(d)));
  const all = batches.flat();
  const seen = new Set<number>();
  const filtered: SportApiEvent[] = [];
  for (const event of all) {
    const tid = event.tournament?.uniqueTournament?.id;
    if (tid !== uniqueTournamentId || seen.has(event.id)) continue;
    seen.add(event.id);
    filtered.push(event);
  }
  return filtered.sort(
    (a, b) => (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0)
  );
}

export async function sportApiLookupCountries(): Promise<CountryOption[]> {
  const today = todayDateString();
  const data = await sportApiGet<SportApiCategoriesResponse>(
    `/api/v1/sport/football/${today}/0/categories`,
    `categories:football:${today}`
  );
  const fromApi = (data.categories ?? [])
    .map((c) => {
      const id = c.category.id;
      const name = SPORTAPI_CATEGORY_COUNTRIES[id] ?? c.category.name;
      return { name, code: c.category.slug?.toUpperCase().slice(0, 2) ?? String(id) };
    })
    .filter((c) => c.name);

  if (fromApi.length) {
    const unique = new Map<string, CountryOption>();
    for (const c of fromApi) unique.set(c.name, c);
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  return Object.values(SPORTAPI_CATEGORY_COUNTRIES).map((name) => ({
    name,
    code: name.slice(0, 2).toUpperCase(),
  }));
}

export async function sportApiLookupTeams(referenceLeagueId: number): Promise<TeamOption[]> {
  const mapping = resolveSportApiLeague(referenceLeagueId);
  if (!mapping) return [];

  const seasonId = await getCurrentSeasonId(mapping.uniqueTournamentId);
  const standings = await getStandings(mapping.uniqueTournamentId, seasonId);
  const teams: TeamOption[] = [];
  for (const group of standings.standings ?? []) {
    for (const row of group.rows ?? []) {
      teams.push({ id: row.team.id, name: row.team.name });
    }
  }
  return teams;
}

export async function sportApiLookupFixtures(referenceLeagueId: number): Promise<FixtureOption[]> {
  const league = getLeagueById(referenceLeagueId);
  const mapping = resolveSportApiLeague(referenceLeagueId);
  if (!mapping || !league) return [];

  const events = await fetchUpcomingEventsForTournament(mapping.uniqueTournamentId);
  return events.slice(0, 30).map((e) => mapEventToFixtureOption(e, referenceLeagueId, league.season));
}

export async function sportApiGetFixture(matchId: number): Promise<Fixture> {
  const event = await sportApiGet<SportApiEvent>(`/api/v1/event/${matchId}`, `event:${matchId}`);
  const leagueId = referenceLeagueIdFromTournament(event.tournament?.uniqueTournament?.id);
  const league = getLeagueById(leagueId);
  return mapEventToFixture(event, leagueId, league?.season ?? parseSeasonYear(event.season));
}

export async function sportApiGetTeamStatistics(
  teamId: number,
  referenceLeagueId: number,
  season: number,
  isHomeSide: boolean,
  matchStats?: SportApiStatisticsResponse
): Promise<TeamStatistics> {
  const mapping = resolveSportApiLeague(referenceLeagueId);
  if (!mapping) throw new UpstreamApiError(`Unknown league ${referenceLeagueId}`);

  const seasonId = await getCurrentSeasonId(mapping.uniqueTournamentId);
  const standings = await getStandings(mapping.uniqueTournamentId, seasonId);
  const row = findStandingsRow(standings, teamId);
  if (!row) throw new UpstreamApiError(`Standings row not found for team ${teamId}`);

  let stats = mapStandingsRowToTeamStatistics(row, referenceLeagueId, season, isHomeSide);
  if (matchStats) {
    stats = enrichTeamStatsFromMatchStatistics(stats, matchStats, isHomeSide);
  }
  return stats;
}

async function fetchTeamRecentEvents(teamId: number): Promise<SportApiEvent[]> {
  try {
    const data = await sportApiGet<SportApiTeamEventsResponse>(
      `/api/v1/team/${teamId}/events/last/0`,
      `team:${teamId}:last`
    );
    return data.events ?? [];
  } catch {
    return [];
  }
}

export async function sportApiGetRecentForm(teamId: number, n = 5): Promise<FixtureResult[]> {
  const events = await fetchTeamRecentEvents(teamId);
  return events.slice(0, n).map(mapEventToFixtureResult);
}

export async function sportApiGetHeadToHead(
  eventId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<FixtureResult[]> {
  try {
    const data = await sportApiGet<SportApiH2HResponse>(
      `/api/v1/event/${eventId}/h2h/events`,
      `h2h:${eventId}`
    );
    const events = data.events ?? [];
    if (events.length) return events.map(mapEventToFixtureResult);
  } catch {
    // fall through to team-based filter
  }

  const [homeEvents, awayEvents] = await Promise.all([
    fetchTeamRecentEvents(homeTeamId),
    fetchTeamRecentEvents(awayTeamId),
  ]);
  const combined = [...homeEvents, ...awayEvents];
  const seen = new Set<number>();
  const h2h: SportApiEvent[] = [];
  for (const e of combined) {
    const ids = new Set([e.homeTeam.id, e.awayTeam.id]);
    if (!ids.has(homeTeamId) || !ids.has(awayTeamId) || seen.has(e.id)) continue;
    seen.add(e.id);
    h2h.push(e);
  }
  return h2h.slice(0, 10).map(mapEventToFixtureResult);
}

export async function sportApiGetLineups(
  matchId: number,
  homeTeamId: number,
  awayTeamId: number,
  homeName: string,
  awayName: string
): Promise<FixtureLineup[]> {
  const data = await sportApiGet<SportApiLineupsResponse>(
    `/api/v1/event/${matchId}/lineups`,
    `lineups:${matchId}`
  );
  return mapLineups(data, homeTeamId, awayTeamId, homeName, awayName);
}

export async function sportApiGetTopScorers(
  referenceLeagueId: number,
  season: number
): Promise<TopScorer[]> {
  const mapping = resolveSportApiLeague(referenceLeagueId);
  if (!mapping) return [];

  const seasonId = await getCurrentSeasonId(mapping.uniqueTournamentId);
  try {
    const data = await sportApiGet<SportApiTopPlayersResponse>(
      `/api/v1/unique-tournament/${mapping.uniqueTournamentId}/season/${seasonId}/top-players/overall/top-scorers`,
      `topscorers:${mapping.uniqueTournamentId}:${seasonId}`
    );
    return mapTopScorers(data);
  } catch {
    void season;
    return [];
  }
}

export async function sportApiGetTeamInfo(
  teamId: number,
  teamName: string,
  city: string,
  venueName?: string
): Promise<TeamInfo> {
  return mapTeamInfo(teamId, teamName, city, venueName);
}

export async function sportApiFetchFootballBundle(
  matchId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<FootballBundle> {
  const event = await sportApiGet<SportApiEvent>(`/api/v1/event/${matchId}`, `event:${matchId}`);
  const referenceLeagueId = referenceLeagueIdFromTournament(
    event.tournament?.uniqueTournament?.id
  );
  const league = getLeagueById(referenceLeagueId);
  const season = league?.season ?? parseSeasonYear(event.season);
  const fixture = mapEventToFixture(event, referenceLeagueId, season);
  const venueCity = fixture.fixture.venue.city;

  const [statistics, lineups, topScorers, homeForm, awayForm, h2h] = await Promise.all([
    sportApiGet<SportApiStatisticsResponse>(
      `/api/v1/event/${matchId}/statistics`,
      `stats:${matchId}`
    ).catch(() => ({ statistics: [] })),
    sportApiGetLineups(
      matchId,
      homeTeamId,
      awayTeamId,
      event.homeTeam.name,
      event.awayTeam.name
    ),
    sportApiGetTopScorers(referenceLeagueId, season),
    sportApiGetRecentForm(homeTeamId),
    sportApiGetRecentForm(awayTeamId),
    sportApiGetHeadToHead(matchId, homeTeamId, awayTeamId),
  ]);

  const [homeStats, awayStats, homeTeamInfo, awayTeamInfo] = await Promise.all([
    sportApiGetTeamStatistics(homeTeamId, referenceLeagueId, season, true, statistics),
    sportApiGetTeamStatistics(awayTeamId, referenceLeagueId, season, false, statistics),
    sportApiGetTeamInfo(homeTeamId, event.homeTeam.name, venueCity, fixture.fixture.venue.name),
    sportApiGetTeamInfo(awayTeamId, event.awayTeam.name, venueCity),
  ]);

  return {
    fixture,
    homeStats,
    awayStats,
    homeForm,
    awayForm,
    h2h,
    lineups,
    topScorers,
    homeTeamInfo,
    awayTeamInfo,
  };
}

import { shouldUseMockApis } from "@/lib/config/api-mode";
import { useSupabaseDataStore } from "@/lib/config/data-source";
import { usesSportApi } from "@/lib/config/football-provider";
import { loadRecentFormEvents } from "@/lib/data/assemble-football-bundle";
import { getLeagueById, getTeamCity } from "@/lib/data/football-reference";
import { loadTeamStatisticsFromStore } from "@/lib/data/football-store";
import { mapEventToFixtureResult, mapTeamInfo } from "@/lib/api/sportapi/mappers";
import { tryCreateServiceClient } from "@/lib/supabase";
import {
  sportApiGetRecentForm,
  sportApiGetTeamInfo,
  sportApiGetTeamStatistics,
  sportApiGetTopScorers,
} from "@/lib/api/sportapi";
import { getMockFootballBundle } from "@/lib/mocks/football";
import {
  type ComparisonBundleInput,
} from "@/lib/prediction/league-strength";
import type { FootballBundle, TeamStatistics } from "@/lib/types/football";
import { UpstreamApiError } from "@/lib/types/prediction";

async function resolveTeamStats(
  teamId: number,
  leagueId: number,
  season: number,
  isHomeSide: boolean,
  teamName?: string
): Promise<TeamStatistics> {
  if (useSupabaseDataStore()) {
    const stored = await loadTeamStatisticsFromStore(teamId, leagueId, isHomeSide);
    if (stored) return stored;
  }

  if (usesSportApi()) {
    return sportApiGetTeamStatistics(teamId, leagueId, season, isHomeSide, undefined, teamName);
  }

  throw new UpstreamApiError(
    `No statistics for team ${teamId} in league ${leagueId}. Run sync or enable SportAPI.`
  );
}

function buildH2HFromForm(
  homeForm: FootballBundle["homeForm"],
  awayForm: FootballBundle["awayForm"],
  homeTeamId: number,
  awayTeamId: number
): FootballBundle["h2h"] {
  const combined = [...homeForm, ...awayForm];
  const seen = new Set<number>();
  const h2h: FootballBundle["h2h"] = [];

  for (const match of combined) {
    const ids = new Set([match.teams.home.id, match.teams.away.id]);
    if (!ids.has(homeTeamId) || !ids.has(awayTeamId) || seen.has(match.fixture.id)) continue;
    seen.add(match.fixture.id);
    h2h.push(match);
  }

  return h2h.slice(0, 10);
}

export async function fetchComparisonBundle(
  input: ComparisonBundleInput
): Promise<FootballBundle> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(0, input.homeTeamId, input.awayTeamId);
  }

  const homeLeague = getLeagueById(input.homeLeagueId);
  const awayLeague = getLeagueById(input.awayLeagueId);
  if (!homeLeague || !awayLeague) {
    throw new UpstreamApiError("Invalid league selection for comparison.");
  }

  const season = homeLeague.season;
  const venueCity = input.city || getTeamCity(input.homeTeamId);
  const readOnlyStore = useSupabaseDataStore();

  const [homeStats, awayStats] = await Promise.all([
    resolveTeamStats(input.homeTeamId, input.homeLeagueId, season, true, input.homeTeamName),
    resolveTeamStats(
      input.awayTeamId,
      input.awayLeagueId,
      awayLeague.season,
      false,
      input.awayTeamName
    ),
  ]);

  let homeForm: FootballBundle["homeForm"] = [];
  let awayForm: FootballBundle["awayForm"] = [];
  let homeTopScorers: FootballBundle["topScorers"] = [];
  let awayTopScorers: FootballBundle["topScorers"] = [];

  if (readOnlyStore) {
    const supabase = tryCreateServiceClient();
    if (supabase) {
      const [homeFormEvents, awayFormEvents] = await Promise.all([
        loadRecentFormEvents(
          supabase,
          input.homeLeagueId,
          input.homeTeamId,
          input.homeTeamName
        ),
        loadRecentFormEvents(
          supabase,
          input.awayLeagueId,
          input.awayTeamId,
          input.awayTeamName
        ),
      ]);
      homeForm = homeFormEvents.slice(0, 5).map(mapEventToFixtureResult);
      awayForm = awayFormEvents.slice(0, 5).map(mapEventToFixtureResult);
    }
  } else if (usesSportApi()) {
    [homeForm, awayForm, homeTopScorers, awayTopScorers] = await Promise.all([
      sportApiGetRecentForm(input.homeTeamId).catch(() => []),
      sportApiGetRecentForm(input.awayTeamId).catch(() => []),
      sportApiGetTopScorers(input.homeLeagueId, homeLeague.season).catch(() => []),
      sportApiGetTopScorers(input.awayLeagueId, awayLeague.season).catch(() => []),
    ]);
  }

  const h2h = buildH2HFromForm(homeForm, awayForm, input.homeTeamId, input.awayTeamId);

  const homeTeamInfo = readOnlyStore
    ? mapTeamInfo(input.homeTeamId, input.homeTeamName, venueCity)
    : await sportApiGetTeamInfo(input.homeTeamId, input.homeTeamName, venueCity);

  const awayTeamInfo = readOnlyStore
    ? mapTeamInfo(input.awayTeamId, input.awayTeamName, venueCity)
    : await sportApiGetTeamInfo(input.awayTeamId, input.awayTeamName, venueCity);

  const fixture: FootballBundle["fixture"] = {
    fixture: {
      id: 0,
      date: input.matchDate,
      venue: { id: 0, name: "Neutral", city: venueCity },
    },
    league: {
      id: input.homeLeagueId,
      name: `${homeLeague.name} vs ${awayLeague.name}`,
      season,
    },
    teams: {
      home: { id: input.homeTeamId, name: input.homeTeamName },
      away: { id: input.awayTeamId, name: input.awayTeamName },
    },
  };

  return {
    fixture,
    homeStats,
    awayStats,
    homeForm,
    awayForm,
    h2h,
    lineups: [],
    topScorers: [...homeTopScorers, ...awayTopScorers],
    homeTeamInfo,
    awayTeamInfo,
  };
}
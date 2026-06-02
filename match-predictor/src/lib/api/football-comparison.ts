import { shouldUseMockApis } from "@/lib/config/api-mode";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { usesSportApi } from "@/lib/config/football-provider";
import { mapEventToFixtureResult, mapTeamInfo } from "@/lib/api/sportapi/mappers";
import {
  sportApiGetRecentForm,
  sportApiGetTeamInfo,
  sportApiGetTopScorers,
} from "@/lib/api/sportapi";
import { getLeagueById, getTeamCity } from "@/lib/data/football-reference";
import { loadH2HEventsFromSyncedEvents } from "@/lib/data/assemble-football-bundle";
import {
  resolveRecentFormEvents,
  resolveTeamStatistics,
} from "@/lib/data/resolve-team-statistics";
import { tryCreateServiceClient } from "@/lib/supabase";
import { getMockFootballBundle } from "@/lib/mocks/football";
import { type ComparisonBundleInput } from "@/lib/prediction/league-strength";
import type { FootballBundle } from "@/lib/types/football";
import { UpstreamApiError } from "@/lib/types/prediction";

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
  const readOnlyStore = isSupabaseDataStore();

  const entityType = input.entityType;

  const [homeStats, awayStats] = await Promise.all([
    resolveTeamStatistics({
      teamId: input.homeTeamId,
      leagueId: input.homeLeagueId,
      season,
      isHomeSide: true,
      teamName: input.homeTeamName,
      entityType,
    }),
    resolveTeamStatistics({
      teamId: input.awayTeamId,
      leagueId: input.awayLeagueId,
      season: awayLeague.season,
      isHomeSide: false,
      teamName: input.awayTeamName,
      entityType,
    }),
  ]);

  let homeForm: FootballBundle["homeForm"] = [];
  let awayForm: FootballBundle["awayForm"] = [];
  let homeTopScorers: FootballBundle["topScorers"] = [];
  let awayTopScorers: FootballBundle["topScorers"] = [];

  if (readOnlyStore) {
    const [homeFormEvents, awayFormEvents] = await Promise.all([
      resolveRecentFormEvents(
        input.homeLeagueId,
        input.homeTeamId,
        input.homeTeamName,
        entityType
      ),
      resolveRecentFormEvents(
        input.awayLeagueId,
        input.awayTeamId,
        input.awayTeamName,
        entityType
      ),
    ]);
    homeForm = homeFormEvents.slice(0, 5).map(mapEventToFixtureResult);
    awayForm = awayFormEvents.slice(0, 5).map(mapEventToFixtureResult);
  } else if (usesSportApi()) {
    [homeForm, awayForm, homeTopScorers, awayTopScorers] = await Promise.all([
      sportApiGetRecentForm(input.homeTeamId).catch(() => []),
      sportApiGetRecentForm(input.awayTeamId).catch(() => []),
      sportApiGetTopScorers(input.homeLeagueId, homeLeague.season).catch(() => []),
      sportApiGetTopScorers(input.awayLeagueId, awayLeague.season).catch(() => []),
    ]);
  }

  let h2h = buildH2HFromForm(homeForm, awayForm, input.homeTeamId, input.awayTeamId);

  if (readOnlyStore && h2h.length < 10) {
    const supabase = tryCreateServiceClient();
    if (supabase) {
      const leagueIds =
        input.homeLeagueId === input.awayLeagueId
          ? [input.homeLeagueId]
          : [input.homeLeagueId, input.awayLeagueId];
      const dbEvents = await loadH2HEventsFromSyncedEvents(
        supabase,
        input.homeTeamId,
        input.awayTeamId,
        {
          leagueIds,
          homeTeamName: input.homeTeamName,
          awayTeamName: input.awayTeamName,
          limit: 10,
          excludeEventIds: h2h.map((match) => match.fixture.id),
          maxPoolRows: 5000,
          finishedOnly: true,
        }
      );
      h2h = [...h2h, ...dbEvents.map(mapEventToFixtureResult)].slice(0, 10);
    }
  }

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
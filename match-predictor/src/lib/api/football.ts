import { shouldUseMockApis } from "@/lib/config/api-mode";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { usesSportApi } from "@/lib/config/football-provider";
import { loadFootballBundleFromStore } from "@/lib/data/football-store";
import { hydrateFootballBundleRecentForm } from "@/lib/data/hydrate-bundle-recent-form";
import {
  sportApiFetchFootballBundle,
  sportApiGetFixture,
  sportApiGetHeadToHead,
  sportApiGetLineups,
  sportApiGetRecentForm,
  sportApiGetTeamInfo,
  sportApiGetTeamStatistics,
  sportApiGetTopScorers,
} from "@/lib/api/sportapi";
import { createRapidApiClient, getApiFootballRapidApiHost } from "@/lib/config/rapidapi";
import axios from "axios";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import { fetchComparisonBundle } from "@/lib/api/football-comparison";
import { getMockFootballBundle } from "@/lib/mocks/football";
import { getTeamName } from "@/lib/data/football-reference";
import type {
  ApiFootballResponse,
  Fixture,
  FixtureLineup,
  FixtureResult,
  FootballBundle,
  TeamInfo,
  TeamStatistics,
  TopScorer,
} from "@/lib/types/football";
import { UpstreamApiError, type PredictRequest } from "@/lib/types/prediction";

function getFootballClient() {
  return createRapidApiClient(getApiFootballRapidApiHost(), { timeout: 15000 });
}

async function footballFetch<T>(
  endpoint: string,
  params: Record<string, string | number>,
  cacheKey: string
): Promise<T> {
  const { data } = await cachedFetch<T>({
    provider: "football",
    cacheKey,
    ttlMs: TTL.FOOTBALL,
    dailyLimit: DAILY_LIMITS.football,
    fetcher: async () => {
      const client = getFootballClient();
      const response = await client.get<ApiFootballResponse<T>>(endpoint, { params });
      if (response.data.errors && Object.keys(response.data.errors).length > 0) {
        throw new UpstreamApiError(
          `API-Football error: ${JSON.stringify(response.data.errors)}`
        );
      }
      return response.data.response;
    },
  });
  return data;
}

export async function getFixture(matchId: number): Promise<Fixture> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(matchId, 33, 40).fixture;
  }
  if (usesSportApi()) {
    return sportApiGetFixture(matchId);
  }
  const results = await footballFetch<Fixture[]>(
    "/fixtures",
    { id: matchId },
    `football:fixtures:${matchId}`
  );
  if (!results.length) throw new UpstreamApiError(`Fixture ${matchId} not found`);
  return results[0];
}

export async function getTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
): Promise<TeamStatistics> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(0, teamId, 0).homeStats;
  }
  if (usesSportApi()) {
    return sportApiGetTeamStatistics(teamId, leagueId, season, true);
  }
  const results = await footballFetch<TeamStatistics[]>(
    "/teams/statistics",
    { team: teamId, league: leagueId, season },
    `football:stats:${teamId}:${leagueId}:${season}`
  );
  if (!results.length) throw new UpstreamApiError(`Stats for team ${teamId} not found`);
  return results[0];
}

export async function getRecentForm(teamId: number, n = 5): Promise<FixtureResult[]> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(0, teamId, 0).homeForm;
  }
  if (usesSportApi()) {
    return sportApiGetRecentForm(teamId, n);
  }
  return footballFetch<FixtureResult[]>(
    "/fixtures",
    { team: teamId, last: n },
    `football:form:${teamId}:${n}`
  );
}

export async function getHeadToHead(
  homeId: number,
  awayId: number,
  matchId?: number
): Promise<FixtureResult[]> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(0, homeId, awayId).h2h;
  }
  if (usesSportApi() && matchId) {
    return sportApiGetHeadToHead(matchId, homeId, awayId);
  }
  return footballFetch<FixtureResult[]>(
    "/fixtures/headtohead",
    { h2h: `${homeId}-${awayId}` },
    `football:h2h:${homeId}:${awayId}`
  );
}

export async function getLineups(
  matchId: number,
  homeTeamId?: number,
  awayTeamId?: number,
  homeName?: string,
  awayName?: string
): Promise<FixtureLineup[]> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(matchId, 33, 40).lineups;
  }
  if (usesSportApi() && homeTeamId && awayTeamId && homeName && awayName) {
    return sportApiGetLineups(matchId, homeTeamId, awayTeamId, homeName, awayName);
  }
  return footballFetch<FixtureLineup[]>(
    "/fixtures/lineups",
    { fixture: matchId },
    `football:lineups:${matchId}`
  );
}

export async function getTopScorers(
  leagueId: number,
  season: number
): Promise<TopScorer[]> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(0, 33, 40).topScorers;
  }
  if (usesSportApi()) {
    return sportApiGetTopScorers(leagueId, season);
  }
  return footballFetch<TopScorer[]>(
    "/players/topscorers",
    { league: leagueId, season },
    `football:topscorers:${leagueId}:${season}`
  );
}

export async function getTeamInfo(
  teamId: number,
  teamName?: string,
  city?: string
): Promise<TeamInfo> {
  if (shouldUseMockApis()) {
    return getMockFootballBundle(0, teamId, 0).homeTeamInfo;
  }
  if (usesSportApi() && teamName) {
    return sportApiGetTeamInfo(teamId, teamName, city ?? "Unknown");
  }
  const results = await footballFetch<TeamInfo[]>(
    "/teams",
    { id: teamId },
    `football:team:${teamId}`
  );
  if (!results.length) throw new UpstreamApiError(`Team ${teamId} not found`);
  return results[0];
}

async function finalizeFootballBundle(
  bundle: FootballBundle,
  input: PredictRequest
): Promise<FootballBundle> {
  return hydrateFootballBundleRecentForm(bundle, {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeLeagueId: input.homeLeagueId ?? bundle.fixture.league.id,
    awayLeagueId: input.awayLeagueId ?? bundle.fixture.league.id,
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
  });
}

export async function fetchFootballBundle(
  input: PredictRequest
): Promise<FootballBundle> {
  const { matchId, homeTeamId, awayTeamId, homeLeagueId, awayLeagueId, entityType, city, matchDate, mode } =
    input;

  if (mode === "compare") {
    if (!homeLeagueId || !awayLeagueId) {
      throw new UpstreamApiError("Compare mode requires homeLeagueId and awayLeagueId.");
    }
    const homeTeamName =
      input.homeTeamName?.trim() ||
      getTeamName(homeTeamId, homeLeagueId) ||
      `Team ${homeTeamId}`;
    const awayTeamName =
      input.awayTeamName?.trim() ||
      getTeamName(awayTeamId, awayLeagueId) ||
      `Team ${awayTeamId}`;

    const bundle = await fetchComparisonBundle({
      homeTeamId,
      awayTeamId,
      homeLeagueId,
      awayLeagueId,
      homeTeamName,
      awayTeamName,
      entityType,
      city,
      matchDate,
    });
    return finalizeFootballBundle(bundle, input);
  }

  if (!matchId) {
    throw new UpstreamApiError("Fixture mode requires matchId.");
  }

  let bundle: FootballBundle;
  if (isSupabaseDataStore()) {
    bundle = await loadFootballBundleFromStore(matchId, homeTeamId, awayTeamId);
  } else if (shouldUseMockApis()) {
    bundle = getMockFootballBundle(matchId, homeTeamId, awayTeamId);
  } else if (usesSportApi()) {
    bundle = await sportApiFetchFootballBundle(matchId, homeTeamId, awayTeamId);
  } else {
    const fixture = await getFixture(matchId);
    const { id: leagueId, season } = fixture.league;

    const [homeStats, awayStats, homeForm, awayForm, h2h, lineups, topScorers, homeTeamInfo, awayTeamInfo] =
      await Promise.all([
        getTeamStatistics(homeTeamId, leagueId, season),
        getTeamStatistics(awayTeamId, leagueId, season),
        getRecentForm(homeTeamId),
        getRecentForm(awayTeamId),
        getHeadToHead(homeTeamId, awayTeamId, matchId),
        getLineups(matchId),
        getTopScorers(leagueId, season),
        getTeamInfo(homeTeamId),
        getTeamInfo(awayTeamId),
      ]);

    bundle = {
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

  return finalizeFootballBundle(bundle, input);
}

export function parseTeamStats(
  stats: TeamStatistics,
  isHome: boolean,
  options?: { useTotal?: boolean }
): {
  goalsFor: number;
  goalsAgainst: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  shotsOnTarget: number;
} {
  const side = options?.useTotal ? "total" : isHome ? "home" : "away";
  const yellowTotal = Object.values(stats.cards.yellow).reduce(
    (sum, v) => sum + (v.total ?? 0),
    0
  );
  const redTotal = Object.values(stats.cards.red).reduce(
    (sum, v) => sum + (v.total ?? 0),
    0
  );
  const played = stats.lineups.reduce((sum, l) => sum + l.played, 0) || 1;

  return {
    goalsFor: parseFloat(stats.goals.for.average[side] || stats.goals.for.average.total || "1.2"),
    goalsAgainst: parseFloat(
      stats.goals.against.average[side] || stats.goals.against.average.total || "1.0"
    ),
    corners: parseFloat(stats.corners.average[side] || stats.corners.average.total || "5.0"),
    fouls: parseFloat(
      stats.fouls.committed.average[side] || stats.fouls.committed.average.total || "10.0"
    ),
    yellowCards: yellowTotal / played,
    redCards: redTotal / played,
    shotsOnTarget: parseFloat(
      stats.shots.on.average[side] || stats.shots.on.average.total || "4.5"
    ),
  };
}

export {
  computeFormScore,
  computeH2HRates,
  type H2HRates,
} from "@/lib/prediction/form-momentum";

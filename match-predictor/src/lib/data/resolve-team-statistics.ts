import { getRapidApiKey } from "@/lib/config/rapidapi";
import { resolveSportApiLeague } from "@/lib/config/sportapi-leagues";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { usesSportApi } from "@/lib/config/football-provider";
import {
  loadRecentFormEvents,
  loadRecentFormEventsForTeam,
} from "@/lib/data/assemble-football-bundle";
import { getLeagueEntityType } from "@/lib/data/football-reference";
import { loadTeamStatisticsFromStore } from "@/lib/data/football-store";
import {
  deriveTeamStatisticsFromFormEvents,
  loadTeamStatisticsFromStandingsCache,
} from "@/lib/data/national-team-stats";
import { sportApiGetTeamStatistics } from "@/lib/api/sportapi";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { TeamStatistics } from "@/lib/types/football";
import type { EntityType } from "@/lib/types/football-lookup";
import { UpstreamApiError } from "@/lib/types/prediction";

/** International competitions to search when World Cup stats are missing. */
const NATIONAL_PROXY_LEAGUE_IDS = [1, 5, 4] as const;

async function tryLiveTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number,
  isHomeSide: boolean,
  teamName?: string
): Promise<TeamStatistics | null> {
  if (!getRapidApiKey() && !usesSportApi()) return null;
  try {
    return await sportApiGetTeamStatistics(
      teamId,
      leagueId,
      season,
      isHomeSide,
      undefined,
      teamName
    );
  } catch {
    return null;
  }
}

async function resolveNationalTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number,
  isHomeSide: boolean,
  teamName?: string
): Promise<TeamStatistics> {
  const label = teamName?.trim() || `team ${teamId}`;

  for (const proxyLeagueId of NATIONAL_PROXY_LEAGUE_IDS) {
    const fromStore = await loadTeamStatisticsFromStore(teamId, proxyLeagueId, isHomeSide);
    if (fromStore) return fromStore;

    const fromStandings = await loadTeamStatisticsFromStandingsCache(
      teamId,
      proxyLeagueId,
      season,
      isHomeSide,
      teamName
    );
    if (fromStandings) return fromStandings;
  }

  const supabase = tryCreateServiceClient();
  if (supabase) {
    const formEvents = await loadRecentFormEventsForTeam(supabase, teamId, teamName, 12);
    const derived = deriveTeamStatisticsFromFormEvents(
      formEvents,
      teamId,
      teamName ?? label,
      leagueId,
      season,
      isHomeSide
    );
    if (derived) return derived;
  }

  for (const proxyLeagueId of NATIONAL_PROXY_LEAGUE_IDS) {
    const live = await tryLiveTeamStatistics(
      teamId,
      proxyLeagueId,
      season,
      isHomeSide,
      teamName
    );
    if (live) return live;
  }

  return (
    deriveTeamStatisticsFromFormEvents(
      [],
      teamId,
      teamName ?? label,
      leagueId,
      season,
      isHomeSide
    ) ??
    (() => {
      throw new UpstreamApiError(`No statistics for ${label} (id ${teamId}).`);
    })()
  );
}

export async function resolveTeamStatistics(input: {
  teamId: number;
  leagueId: number;
  season: number;
  isHomeSide: boolean;
  teamName?: string;
  entityType?: EntityType;
}): Promise<TeamStatistics> {
  const { teamId, leagueId, season, isHomeSide, teamName, entityType } = input;
  const effectiveEntity =
    entityType ?? getLeagueEntityType(leagueId);

  const fromStore = await loadTeamStatisticsFromStore(teamId, leagueId, isHomeSide);
  if (fromStore) return fromStore;

  if (effectiveEntity === "national") {
    return resolveNationalTeamStatistics(teamId, leagueId, season, isHomeSide, teamName);
  }

  if (isSupabaseDataStore()) {
    const fromStandings = await loadTeamStatisticsFromStandingsCache(
      teamId,
      leagueId,
      season,
      isHomeSide,
      teamName
    );
    if (fromStandings) return fromStandings;

    const live = await tryLiveTeamStatistics(teamId, leagueId, season, isHomeSide, teamName);
    if (live) return live;

    throw new UpstreamApiError(
      `No statistics for team ${teamId} in league ${leagueId}. Run sync or enable SportAPI.`
    );
  }

  if (usesSportApi()) {
    return sportApiGetTeamStatistics(teamId, leagueId, season, isHomeSide, undefined, teamName);
  }

  throw new UpstreamApiError(
    `No statistics for team ${teamId} in league ${leagueId}. Run sync or enable SportAPI.`
  );
}

/** Recent form for compare/fixture flows (national sides search all synced events). */
export async function resolveRecentFormEvents(
  leagueId: number,
  teamId: number,
  teamName?: string,
  entityType?: EntityType
) {
  const effectiveEntity = entityType ?? getLeagueEntityType(leagueId);
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  const crossCompetition = await loadRecentFormEventsForTeam(supabase, teamId, teamName, 12);
  if (crossCompetition.length >= 5) return crossCompetition;

  if (effectiveEntity === "national" && crossCompetition.length) {
    return crossCompetition;
  }

  const leagueScoped = await loadRecentFormEvents(supabase, leagueId, teamId, teamName);
  return leagueScoped.length > crossCompetition.length ? leagueScoped : crossCompetition;
}

export function nationalProxyLeagueIds(): readonly number[] {
  return NATIONAL_PROXY_LEAGUE_IDS;
}

export function hasSportApiLeagueMapping(leagueId: number): boolean {
  return Boolean(resolveSportApiLeague(leagueId));
}

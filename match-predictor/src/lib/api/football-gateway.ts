import {
  getPrimaryProviderName,
  getSecondaryProviderName,
  type FootballApiProviderName,
} from "@/lib/config/football-providers";
import { sofascoreGet } from "@/lib/api/sofascore/client";
import type {
  SofascoreEventDetailResponse,
  SofascoreEventsResponse,
  SofascoreH2HResponse,
  SofascoreIncidentsResponse,
  SofascoreBestPlayersResponse,
  SofascoreLineupsResponse,
  SofascoreSeasonsResponse,
  SofascoreStandingsResponse,
  SofascoreStatisticsResponse,
  SofascoreTournamentDetailResponse,
} from "@/lib/api/sofascore/types";
import { sportApiGet } from "@/lib/api/sportapi/client";
import type {
  SportApiEvent,
  SportApiH2HResponse,
  SportApiIncidentsResponse,
  SportApiLineupsResponse,
  SportApiScheduledEventsResponse,
  SportApiSeasonsResponse,
  SportApiStandingsResponse,
  SportApiStatisticsResponse,
} from "@/lib/types/sportapi";
import { RateLimitError } from "@/lib/types/prediction";
import { assertFootballApiBudget, recordFootballApiCall } from "@/lib/sync/football-api-budget";

export type GatewayCallMeta = {
  endpoint: string;
  skipBudget?: boolean;
};

async function trackedCall<T>(
  provider: FootballApiProviderName,
  endpoint: string,
  fn: () => Promise<T>,
  skipBudget?: boolean
): Promise<T> {
  if (!skipBudget) {
    await assertFootballApiBudget();
  }
  try {
    const data = await fn();
    if (!skipBudget) {
      await recordFootballApiCall({ provider, endpoint });
    }
    return data;
  } catch (error) {
    throw error;
  }
}

async function withPrimaryFallback<T>(
  endpoint: string,
  primary: () => Promise<T>,
  secondary: () => Promise<T>
): Promise<{ data: T; provider: FootballApiProviderName }> {
  const primaryName = getPrimaryProviderName();
  const secondaryName = getSecondaryProviderName();

  try {
    const data = await trackedCall(primaryName, endpoint, primary);
    return { data, provider: primaryName };
  } catch (error) {
    if (!(error instanceof RateLimitError) && primaryName === secondaryName) {
      throw error;
    }
    if (error instanceof RateLimitError) {
      const data = await trackedCall(secondaryName, `${endpoint} (fallback)`, secondary);
      return { data, provider: secondaryName };
    }
    throw error;
  }
}

export async function gatewayGetSeasons(uniqueTournamentId: number) {
  return withPrimaryFallback(
    `seasons:${uniqueTournamentId}`,
    () =>
      sofascoreGet<SofascoreSeasonsResponse>("tournaments/get-seasons", {
        tournamentId: uniqueTournamentId,
      }),
    () => sportApiGet<SportApiSeasonsResponse>(`/api/v1/unique-tournament/${uniqueTournamentId}/seasons`, `seasons:${uniqueTournamentId}`, { skipCache: true })
  );
}

export async function gatewayGetStandings(uniqueTournamentId: number, seasonId: number) {
  return withPrimaryFallback(
    `standings:${uniqueTournamentId}:${seasonId}`,
    () =>
      sofascoreGet<SofascoreStandingsResponse>("tournaments/get-standings", {
        tournamentId: uniqueTournamentId,
        seasonId,
      }),
    () =>
      sportApiGet<SportApiStandingsResponse>(
        `/api/v1/unique-tournament/${uniqueTournamentId}/season/${seasonId}/standings/total`,
        `standings:${uniqueTournamentId}:${seasonId}`,
        { skipCache: true }
      )
  );
}

export async function gatewayGetNextMatches(uniqueTournamentId: number, seasonId: number) {
  return withPrimaryFallback(
    `next-matches:${uniqueTournamentId}:${seasonId}`,
    () =>
      sofascoreGet<SofascoreEventsResponse>("tournaments/get-next-matches", {
        tournamentId: uniqueTournamentId,
        seasonId,
        pageIndex: 0,
      }),
    () =>
      sportApiGet<SportApiScheduledEventsResponse>(
        `/api/v1/unique-tournament/${uniqueTournamentId}/season/${seasonId}/events/next/0`,
        `next:${uniqueTournamentId}:${seasonId}`,
        { skipCache: true }
      ).then((r) => ({ events: (r as { events?: SportApiEvent[] }).events ?? [] }))
  );
}

export async function gatewayGetLastMatches(uniqueTournamentId: number, seasonId: number) {
  return withPrimaryFallback(
    `last-matches:${uniqueTournamentId}:${seasonId}`,
    () =>
      sofascoreGet<SofascoreEventsResponse>("tournaments/get-last-matches", {
        tournamentId: uniqueTournamentId,
        seasonId,
        pageIndex: 0,
      }),
    () =>
      sportApiGet<{ events: SportApiEvent[] }>(
        `/api/v1/unique-tournament/${uniqueTournamentId}/season/${seasonId}/events/last/0`,
        `last:${uniqueTournamentId}:${seasonId}`,
        { skipCache: true }
      )
  );
}

export async function gatewayGetMatchDetail(matchId: number) {
  return withPrimaryFallback(
    `match-detail:${matchId}`,
    () => sofascoreGet<SofascoreEventDetailResponse>("matches/detail", { matchId }),
    () => sportApiGet<SportApiEvent>(`/api/v1/event/${matchId}`, `event:${matchId}`, { skipCache: true }).then((event) => ({ event }))
  );
}

export async function gatewayGetMatchStatistics(matchId: number) {
  return withPrimaryFallback(
    `match-stats:${matchId}`,
    () => sofascoreGet<SofascoreStatisticsResponse>("matches/get-statistics", { matchId }),
    () => sportApiGet<SportApiStatisticsResponse>(`/api/v1/event/${matchId}/statistics`, `stats:${matchId}`, { skipCache: true })
  );
}

export async function gatewayGetMatchLineups(matchId: number) {
  return withPrimaryFallback(
    `match-lineups:${matchId}`,
    () => sofascoreGet<SofascoreLineupsResponse>("matches/get-lineups", { matchId }),
    () => sportApiGet<SportApiLineupsResponse>(`/api/v1/event/${matchId}/lineups`, `lineups:${matchId}`, { skipCache: true })
  );
}

export async function gatewayGetMatchBestPlayers(matchId: number) {
  return withPrimaryFallback(
    `match-best-players:${matchId}`,
    () =>
      sofascoreGet<SofascoreBestPlayersResponse>("matches/get-best-players", {
        matchId,
      }),
    async () => ({ bestPlayers: [] })
  );
}

export async function gatewayGetMatchIncidents(matchId: number) {
  return withPrimaryFallback(
    `match-incidents:${matchId}`,
    () => sofascoreGet<SofascoreIncidentsResponse>("matches/get-incidents", { matchId }),
    () => sportApiGet<SportApiIncidentsResponse>(`/api/v1/event/${matchId}/incidents`, `incidents:${matchId}`, { skipCache: true })
  );
}

export async function gatewayGetMatchH2H(matchId: number) {
  return withPrimaryFallback(
    `match-h2h:${matchId}`,
    () => sofascoreGet<SofascoreH2HResponse>("matches/get-h2h", { matchId }),
    () =>
      sportApiGet<SportApiH2HResponse>(`/api/v1/event/${matchId}/h2h/events`, `h2h:${matchId}`, { skipCache: true }).then(
        (r) => ({ events: r.events ?? [] })
      )
  );
}

export async function gatewayGetTournamentDetail(uniqueTournamentId: number) {
  return withPrimaryFallback(
    `tournament-detail:${uniqueTournamentId}`,
    () =>
      sofascoreGet<SofascoreTournamentDetailResponse>("tournaments/detail", {
        tournamentId: uniqueTournamentId,
      }),
    async () => ({ uniqueTournament: { id: uniqueTournamentId, name: "" } })
  );
}

export async function persistRawPayload(
  supabase: NonNullable<ReturnType<typeof import("@/lib/supabase").tryCreateServiceClient>>,
  row: {
    provider: string;
    endpoint: string;
    entityType: string;
    entityKey: string;
    payload: unknown;
  }
) {
  await supabase.from("synced_api_payloads").upsert({
    provider: row.provider,
    endpoint: row.endpoint,
    entity_type: row.entityType,
    entity_key: row.entityKey,
    payload: row.payload as never,
    synced_at: new Date().toISOString(),
  });
}

import { tryCreateServiceClient } from "@/lib/supabase";
import type { FootballBundle } from "@/lib/types/football";
import type { SportApiEvent } from "@/lib/types/sportapi";
import type { SportApiH2HResponse } from "@/lib/types/sportapi";
import type { SportApiLineupsResponse } from "@/lib/types/sportapi";
import type { SportApiSeasonsResponse } from "@/lib/types/sportapi";
import type { SportApiStandingsResponse } from "@/lib/types/sportapi";
import type { SportApiStatisticsResponse } from "@/lib/types/sportapi";

export const SYNC_FRESH_MS = 48 * 60 * 60 * 1000;
export const WEATHER_FRESH_MS = 6 * 60 * 60 * 1000;

export function isFresh(syncedAt: string | null | undefined, maxAgeMs: number): boolean {
  if (!syncedAt) return false;
  return Date.now() - new Date(syncedAt).getTime() < maxAgeMs;
}

export async function readSyncedApiPayload<T>(
  entityType: string,
  entityKey: string
): Promise<T | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_api_payloads")
    .select("payload, synced_at")
    .eq("entity_type", entityType)
    .eq("entity_key", entityKey)
    .maybeSingle();

  if (!data?.payload || !isFresh(data.synced_at, SYNC_FRESH_MS)) return null;
  return data.payload as T;
}

export async function readSyncedEvent(eventId: number): Promise<SportApiEvent | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_events")
    .select("payload, synced_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!data?.payload || !isFresh(data.synced_at, SYNC_FRESH_MS)) return null;
  return data.payload as SportApiEvent;
}

export async function readSyncedMatchBundle(matchId: number): Promise<FootballBundle | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_match_bundles")
    .select("bundle, synced_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (!data?.bundle || !isFresh(data.synced_at, SYNC_FRESH_MS)) return null;
  return data.bundle as FootballBundle;
}

export async function readSyncedEventLineups(
  eventId: number
): Promise<SportApiLineupsResponse | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_event_lineups")
    .select("payload, synced_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!data?.payload || !isFresh(data.synced_at, SYNC_FRESH_MS)) return null;
  return data.payload as SportApiLineupsResponse;
}

export async function readSyncedEventH2H(eventId: number): Promise<SportApiH2HResponse | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_event_h2h")
    .select("payload, synced_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!data?.payload || !isFresh(data.synced_at, SYNC_FRESH_MS)) return null;
  const payload = data.payload as { events?: SportApiEvent[] };
  return { events: payload.events ?? [] };
}

export async function readSyncedEventStatistics(
  eventId: number
): Promise<SportApiStatisticsResponse | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_event_statistics")
    .select("payload, synced_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!data?.payload || !isFresh(data.synced_at, SYNC_FRESH_MS)) return null;
  return data.payload as SportApiStatisticsResponse;
}

export async function readSyncedSeasons(
  uniqueTournamentId: number
): Promise<SportApiSeasonsResponse | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_seasons")
    .select("payload, synced_at")
    .eq("unique_tournament_id", uniqueTournamentId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.payload && isFresh(data.synced_at, SYNC_FRESH_MS)) {
    return data.payload as SportApiSeasonsResponse;
  }

  return readSyncedApiPayload<SportApiSeasonsResponse>("season", String(uniqueTournamentId));
}

export async function readSyncedStandings(
  uniqueTournamentId: number,
  seasonId: number
): Promise<SportApiStandingsResponse | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_standings")
    .select("payload, synced_at")
    .eq("unique_tournament_id", uniqueTournamentId)
    .eq("season_id", seasonId)
    .eq("standing_type", "total")
    .maybeSingle();

  if (data?.payload && isFresh(data.synced_at, SYNC_FRESH_MS)) {
    return data.payload as SportApiStandingsResponse;
  }

  return readSyncedApiPayload<SportApiStandingsResponse>(
    "standings",
    `${uniqueTournamentId}:${seasonId}`
  );
}

export async function readWeatherApiCache<T>(cacheKey: string): Promise<T | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("api_cache")
    .select("response, fetched_at")
    .eq("cache_key", cacheKey)
    .eq("provider", "weather")
    .maybeSingle();

  if (!data?.response || !isFresh(data.fetched_at, WEATHER_FRESH_MS)) return null;
  return data.response as T;
}

/** Map sportApiGet cache keys to synced Supabase rows (48h fresh). */
export async function readSportApiCacheFromStore<T>(cacheKey: string): Promise<T | null> {
  const colon = cacheKey.indexOf(":");
  if (colon < 0) return null;
  const prefix = cacheKey.slice(0, colon);
  const rest = cacheKey.slice(colon + 1);

  switch (prefix) {
    case "lineups": {
      const eventId = Number(rest);
      if (!Number.isFinite(eventId)) return null;
      return (await readSyncedEventLineups(eventId)) as T | null;
    }
    case "h2h": {
      const eventId = Number(rest);
      if (!Number.isFinite(eventId)) return null;
      return (await readSyncedEventH2H(eventId)) as T | null;
    }
    case "stats": {
      const eventId = Number(rest);
      if (!Number.isFinite(eventId)) return null;
      return (await readSyncedEventStatistics(eventId)) as T | null;
    }
    case "seasons": {
      const tournamentId = Number(rest);
      if (!Number.isFinite(tournamentId)) return null;
      return (await readSyncedSeasons(tournamentId)) as T | null;
    }
    case "standings": {
      const parts = rest.split(":");
      if (parts.length !== 2) return null;
      const tournamentId = Number(parts[0]);
      const seasonId = Number(parts[1]);
      if (!Number.isFinite(tournamentId) || !Number.isFinite(seasonId)) return null;
      return (await readSyncedStandings(tournamentId, seasonId)) as T | null;
    }
    case "event": {
      const matchId = Number(rest);
      if (!Number.isFinite(matchId)) return null;
      return (await readSyncedEvent(matchId)) as T | null;
    }
    default:
      return null;
  }
}

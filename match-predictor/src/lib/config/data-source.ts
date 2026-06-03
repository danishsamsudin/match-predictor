import { serverEnv } from "@/lib/env/server-env";
import { getAllSyncLeagueIds, getLeaguesBySyncTier } from "@/lib/data/football-reference";
import { hasServiceRoleKey } from "@/lib/supabase";

/** When true, predictions and lookups read Supabase tables only — no RapidAPI calls. */
export function isSupabaseDataStore(): boolean {
  const raw = serverEnv.dataSource?.toLowerCase();
  if (raw === "live") return false;
  if (raw === "supabase" || serverEnv.useSupabaseData) return true;
  // Production-friendly default when Supabase is wired but DATA_SOURCE was not set.
  return hasServiceRoleKey() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
}

export function getSyncIntervalDays(): number {
  const n = Number(process.env.SYNC_INTERVAL_DAYS ?? "2");
  return Number.isFinite(n) && n > 0 ? n : 2;
}

export function getSyncLeagueIds(): number[] {
  const raw = process.env.SYNC_LEAGUE_IDS;
  if (raw?.trim().toLowerCase() === "all") {
    return getAllSyncLeagueIds();
  }
  if (raw?.trim()) {
    return raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return getLeaguesBySyncTier(1).map((league) => league.id);
}

export function getAllSyncLeagueIdsFromConfig(): number[] {
  return getAllSyncLeagueIds();
}

export function getSyncMaxMatchesPerLeague(): number {
  const n = Number(process.env.SYNC_MAX_MATCHES_PER_LEAGUE ?? "3");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

export function getSyncApiBudget(): number {
  const n = Number(process.env.FOOTBALL_DAILY_API_LIMIT ?? process.env.SYNC_API_BUDGET ?? "10");
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function getFootballDailyApiLimit(): number {
  return getSyncApiBudget();
}

/** Max Open-Meteo calls per calendar day (geocoding + forecast; sync + on-demand lookups). */
export function getWeatherDailyApiLimit(): number {
  const n = Number(process.env.WEATHER_DAILY_API_LIMIT ?? "1000");
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

/** Hour (0–23 UTC) when the daily sync is allowed to run. */
export function getSyncCronHourUtc(): number {
  const n = Number(process.env.SYNC_CRON_HOUR_UTC ?? "6");
  if (!Number.isFinite(n)) return 6;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

export function getSyncCronSecret(): string | undefined {
  return process.env.SYNC_CRON_SECRET?.trim() || undefined;
}

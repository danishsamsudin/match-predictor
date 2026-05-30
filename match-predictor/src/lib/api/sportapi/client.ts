import axios, { type AxiosError } from "axios";
import { shouldUseMockApis } from "@/lib/config/api-mode";
import {
  createRapidApiClient,
  getSportApiRapidApiHost,
  normalizeRapidApiHost,
} from "@/lib/config/rapidapi";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import { UpstreamApiError } from "@/lib/types/prediction";

export function getSportApiHost(): string {
  return getSportApiRapidApiHost();
}

export function getSportApiBaseUrl(): string {
  return `https://${getSportApiRapidApiHost()}`;
}

function getSportApiClient() {
  return createRapidApiClient(getSportApiRapidApiHost(), { timeout: 20000 });
}

function formatSportApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<{ message?: string }>;
    const status = ax.response?.status;
    const msg = ax.response?.data?.message;
    if (status === 403) {
      return (
        msg ??
        "RapidAPI returned 403. Subscribe to SportAPI7 at https://rapidapi.com/rapidsportapi/api/sportapi7 and use your RapidAPI key in RAPIDAPI_KEY or FOOTBALL_API_KEY."
      );
    }
    if (status === 429) {
      return msg ?? "SportAPI7 rate limit exceeded on RapidAPI.";
    }
    if (msg) return `SportAPI7 error (${status ?? "unknown"}): ${msg}`;
    return `SportAPI7 request failed (${status ?? "network"}): ${ax.message}`;
  }
  return error instanceof Error ? error.message : "SportAPI7 request failed";
}

export async function sportApiGet<T>(
  path: string,
  cacheKey: string,
  options?: { ttlMs?: number; skipCache?: boolean }
): Promise<T> {
  const fetcher = async () => {
    try {
      const client = getSportApiClient();
      const response = await client.get<T>(path);
      return response.data;
    } catch (error) {
      throw new UpstreamApiError(formatSportApiError(error));
    }
  };

  if (options?.skipCache || shouldUseMockApis()) {
    return fetcher();
  }

  const result = await cachedFetch<T>({
    provider: "football",
    cacheKey: `sportapi:${cacheKey}`,
    ttlMs: options?.ttlMs ?? TTL.FOOTBALL,
    dailyLimit: DAILY_LIMITS.football,
    fetcher,
  });
  return result.data;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export { normalizeRapidApiHost };

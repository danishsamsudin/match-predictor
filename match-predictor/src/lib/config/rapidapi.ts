import axios, { type AxiosInstance } from "axios";
import { serverEnv } from "@/lib/env/server-env";
import { UpstreamApiError } from "@/lib/types/prediction";

const DEFAULT_SPORTAPI_HOST = "sportapi7.p.rapidapi.com";
const API_FOOTBALL_HOST = "v3.football.api-sports.io";

/** Strip scheme/trailing slash so env can be host-only or a full URL. */
export function normalizeRapidApiHost(host: string | undefined): string | undefined {
  if (!host?.trim()) return undefined;
  return host.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** One RapidAPI key for every subscribed API. */
export function getRapidApiKey(): string | undefined {
  return serverEnv.rapidApiKey;
}

export function getSportApiRapidApiHost(): string {
  const secondary = normalizeRapidApiHost(serverEnv.footballSecondaryProvider);
  if (secondary?.includes("rapidapi.com")) {
    return secondary;
  }
  return normalizeRapidApiHost(serverEnv.sportApiRapidApiHost) ?? DEFAULT_SPORTAPI_HOST;
}

export function getApiFootballRapidApiHost(): string {
  return API_FOOTBALL_HOST;
}

export function createRapidApiClient(
  host: string,
  options?: { timeout?: number }
): AxiosInstance {
  const key = getRapidApiKey();
  if (!key) {
    throw new UpstreamApiError(
      "Missing RapidAPI key. Set RAPIDAPI_KEY or FOOTBALL_API_KEY in .env.local (same key for all RapidAPI subscriptions)."
    );
  }

  const rapidApiHost = normalizeRapidApiHost(host)!;

  return axios.create({
    baseURL: `https://${rapidApiHost}`,
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": rapidApiHost,
    },
    timeout: options?.timeout ?? 15000,
  });
}

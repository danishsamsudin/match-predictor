import versionManifest from "../../../config/open-meteo-version.json";
import { serverEnv } from "@/lib/env/server-env";

export const OPEN_METEO_REPO_URL = versionManifest.repositoryUrl;
export const OPEN_METEO_VERSION = versionManifest.version;

/** Open-Meteo free tier: 10,000 calls/day (see https://open-meteo.com/en/pricing). */
export const OPEN_METEO_FREE_DAILY_LIMIT = 10_000;

function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Forecast API base URL (default: public free tier). */
export function getOpenMeteoForecastBaseUrl(): string {
  const custom = read("OPEN_METEO_FORECAST_URL");
  if (custom) return stripTrailingSlash(custom);

  const apiKey = getOpenMeteoApiKey();
  if (apiKey) {
    return stripTrailingSlash(read("OPEN_METEO_CUSTOMER_URL") ?? "https://customer-api.open-meteo.com");
  }

  return "https://api.open-meteo.com";
}

/** Geocoding API base URL. */
export function getOpenMeteoGeocodingBaseUrl(): string {
  const custom = read("OPEN_METEO_GEOCODING_URL");
  if (custom) return stripTrailingSlash(custom);

  const apiKey = getOpenMeteoApiKey();
  if (apiKey) {
    return stripTrailingSlash(
      read("OPEN_METEO_CUSTOMER_GEOCODING_URL") ?? "https://customer-geocoding-api.open-meteo.com"
    );
  }

  return "https://geocoding-api.open-meteo.com";
}

/** Commercial / self-hosted API key (optional). */
export function getOpenMeteoApiKey(): string | undefined {
  return read("OPEN_METEO_API_KEY") ?? serverEnv.openMeteoApiKey;
}

/**
 * App-side daily weather call budget (geocoding + forecast).
 * Defaults to 1,000 — well under Open-Meteo's free 10,000/day cap.
 */
export function getOpenMeteoDailyApiLimit(): number {
  const n = Number(process.env.WEATHER_DAILY_API_LIMIT ?? "1000");
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

export function getOpenMeteoVersionInfo() {
  return {
    version: OPEN_METEO_VERSION,
    repositoryUrl: OPEN_METEO_REPO_URL,
    releaseUrl: versionManifest.releaseUrl,
    checkedAt: versionManifest.checkedAt,
    forecastBaseUrl: getOpenMeteoForecastBaseUrl(),
    geocodingBaseUrl: getOpenMeteoGeocodingBaseUrl(),
    hasApiKey: Boolean(getOpenMeteoApiKey()),
    dailyLimit: getOpenMeteoDailyApiLimit(),
    upstreamDailyLimit: OPEN_METEO_FREE_DAILY_LIMIT,
  };
}

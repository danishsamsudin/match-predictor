import { shouldUseMockApis } from "@/lib/config/api-mode";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { loadWeatherFromStore, saveWeatherToStore } from "@/lib/data/football-store";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import { readWeatherApiCache } from "@/lib/data/synced-resource-cache";
import {
  fetchOpenMeteoForecast,
  geocodeLocation,
  weatherForecastFromCache,
} from "@/lib/api/open-meteo/client";
import { OPEN_METEO_VERSION } from "@/lib/config/open-meteo";
import type { OpenMeteoGeocodingResult, OpenMeteoWeatherCachePayload } from "@/lib/api/open-meteo/types";
import { getMockWeatherForecast } from "@/lib/mocks/weather";
import type { WeatherForecast } from "@/lib/types/prediction";
import { UpstreamApiError } from "@/lib/types/prediction";

const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cityCacheKey(city: string): string {
  return city.trim().toLowerCase();
}

async function resolveGeocodedLocation(city: string): Promise<OpenMeteoGeocodingResult> {
  const cacheKey = `geocode:open-meteo:${cityCacheKey(city)}`;

  const { data } = await cachedFetch<OpenMeteoGeocodingResult>({
    provider: "weather",
    cacheKey,
    ttlMs: GEOCODE_TTL_MS,
    dailyLimit: DAILY_LIMITS.weather,
    fetcher: () => geocodeLocation(city),
  });

  return data;
}

function isValidWeatherCache(payload: unknown): payload is OpenMeteoWeatherCachePayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as OpenMeteoWeatherCachePayload;
  return (
    p.provider === "open-meteo" &&
    Boolean(p.location?.latitude !== undefined) &&
    Boolean(p.forecast?.hourly?.time?.length)
  );
}

export async function getWeatherForecast(
  city: string,
  matchDate: string,
  options?: { allowLive?: boolean }
): Promise<WeatherForecast> {
  if (shouldUseMockApis()) {
    return getMockWeatherForecast(city);
  }

  let fetchedForStore = false;
  if (isSupabaseDataStore() && !options?.allowLive) {
    try {
      return await loadWeatherFromStore(city, matchDate);
    } catch (err) {
      const missingStoreEntry =
        err instanceof UpstreamApiError &&
        err.message.includes("No synced weather");
      if (!missingStoreEntry) throw err;
      fetchedForStore = true;
    }
  }

  const dateOnly = matchDate.slice(0, 10);
  const cacheKey = `weather:open-meteo:${cityCacheKey(city)}:${dateOnly}`;

  const cachedWeather = await readWeatherApiCache<OpenMeteoWeatherCachePayload>(cacheKey);
  if (isValidWeatherCache(cachedWeather)) {
    return weatherForecastFromCache(cachedWeather, matchDate);
  }

  const { data: payload } = await cachedFetch<OpenMeteoWeatherCachePayload>({
    provider: "weather",
    cacheKey,
    ttlMs: TTL.WEATHER,
    dailyLimit: DAILY_LIMITS.weather,
    fetcher: async () => {
      const location = await resolveGeocodedLocation(city);
      const forecast = await fetchOpenMeteoForecast(location, matchDate);
      return {
        provider: "open-meteo" as const,
        version: OPEN_METEO_VERSION,
        location,
        forecast,
      };
    },
  });

  if (!isValidWeatherCache(payload)) {
    throw new UpstreamApiError(`No weather forecast for ${city} on ${dateOnly}`);
  }

  const forecast = weatherForecastFromCache(payload, matchDate);

  if (fetchedForStore) {
    await saveWeatherToStore(city, matchDate, forecast);
  }

  return forecast;
}

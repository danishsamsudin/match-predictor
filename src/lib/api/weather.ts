import { shouldUseMockApis } from "@/lib/config/api-mode";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { loadWeatherFromStore, saveWeatherToStore } from "@/lib/data/football-store";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import {
  readStaleWeatherApiCache,
  readWeatherApiCache,
} from "@/lib/data/synced-resource-cache";
import {
  fetchOpenMeteoForecast,
  geocodeLocation,
  weatherForecastFromCache,
} from "@/lib/api/open-meteo/client";
import { OPEN_METEO_VERSION } from "@/lib/config/open-meteo";
import type { OpenMeteoGeocodingResult, OpenMeteoWeatherCachePayload } from "@/lib/api/open-meteo/types";
import { getMockWeatherForecast } from "@/lib/mocks/weather";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import type { WeatherForecast } from "@/lib/types/prediction";
import { UpstreamApiError } from "@/lib/types/prediction";
import { resolveCityCoordinates } from "@/lib/utils/geo";

/** Representative host city when venue is explicitly neutral (Open-Meteo needs a place name). */
const NEUTRAL_WEATHER_CITY = "Mexico City";

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

/** Neutral forecast when live weather is unavailable — keeps predictions running. */
export function buildFallbackWeatherForecast(city: string): WeatherForecast {
  const coords = resolveCityCoordinates(normalizePredictorVenueCity(city));
  return {
    condition: "Weather forecast unavailable",
    tempC: 20,
    humidity: 50,
    windKph: 10,
    precipMm: 0,
    lat: coords?.lat,
    lon: coords?.lon,
  };
}

async function loadLiveWeatherPayload(
  geocodeCity: string,
  matchDate: string,
  cacheKey: string
): Promise<OpenMeteoWeatherCachePayload | null> {
  try {
    const { data: payload } = await cachedFetch<OpenMeteoWeatherCachePayload>({
      provider: "weather",
      cacheKey,
      ttlMs: TTL.WEATHER,
      dailyLimit: DAILY_LIMITS.weather,
      fetcher: async () => {
        const location = await resolveGeocodedLocation(geocodeCity);
        const forecast = await fetchOpenMeteoForecast(location, matchDate);
        return {
          provider: "open-meteo" as const,
          version: OPEN_METEO_VERSION,
          location,
          forecast,
        };
      },
    });
    return isValidWeatherCache(payload) ? payload : null;
  } catch {
    const stale = await readStaleWeatherApiCache<OpenMeteoWeatherCachePayload>(cacheKey);
    return isValidWeatherCache(stale) ? stale : null;
  }
}

export async function getWeatherForecast(
  city: string,
  matchDate: string,
  options?: { allowLive?: boolean }
): Promise<WeatherForecast> {
  const resolvedCity = normalizePredictorVenueCity(city);
  const geocodeCity =
    resolvedCity.toLowerCase() === "neutral" ? NEUTRAL_WEATHER_CITY : resolvedCity;

  if (shouldUseMockApis()) {
    return getMockWeatherForecast(geocodeCity);
  }

  let fetchedForStore = false;
  if (isSupabaseDataStore() && !options?.allowLive) {
    try {
      return await loadWeatherFromStore(geocodeCity, matchDate);
    } catch (err) {
      const missingStoreEntry =
        err instanceof UpstreamApiError &&
        err.message.includes("No synced weather");
      if (!missingStoreEntry) throw err;
      fetchedForStore = true;
    }
  }

  const dateOnly = matchDate.slice(0, 10);
  const cacheKey = `weather:open-meteo:${cityCacheKey(geocodeCity)}:${dateOnly}`;

  const cachedWeather = await readWeatherApiCache<OpenMeteoWeatherCachePayload>(cacheKey);
  if (isValidWeatherCache(cachedWeather)) {
    return weatherForecastFromCache(cachedWeather, matchDate);
  }

  const payload = await loadLiveWeatherPayload(geocodeCity, matchDate, cacheKey);
  if (!payload) {
    return buildFallbackWeatherForecast(geocodeCity);
  }

  const forecast = weatherForecastFromCache(payload, matchDate);

  if (fetchedForStore) {
    await saveWeatherToStore(city, matchDate, forecast);
  }

  return forecast;
}

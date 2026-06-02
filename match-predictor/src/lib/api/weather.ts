import axios from "axios";
import { shouldUseMockApis } from "@/lib/config/api-mode";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { loadWeatherFromStore, saveWeatherToStore } from "@/lib/data/football-store";
import { createRapidApiClient, getWeatherRapidApiHost } from "@/lib/config/rapidapi";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import { readWeatherApiCache } from "@/lib/data/synced-resource-cache";
import {
  getMockWeatherApiResponse,
  getMockWeatherForecast,
  type WeatherApiResponse,
} from "@/lib/mocks/weather";
import type { WeatherForecast } from "@/lib/types/prediction";
import { UpstreamApiError } from "@/lib/types/prediction";

function getWeatherClient() {
  return createRapidApiClient(getWeatherRapidApiHost(), { timeout: 10000 });
}

function parseForecastTimestamp(dtTxt: string): number {
  return new Date(dtTxt.replace(" ", "T")).getTime();
}

function findClosestForecastEntry(
  entries: WeatherApiResponse["list"],
  matchDate: string
) {
  if (!entries.length) return null;
  const matchTime = new Date(matchDate).getTime();
  return entries.reduce((closest, entry) => {
    const entryTime = parseForecastTimestamp(entry.dt_txt);
    const closestTime = parseForecastTimestamp(closest.dt_txt);
    return Math.abs(entryTime - matchTime) < Math.abs(closestTime - matchTime)
      ? entry
      : closest;
  });
}

function mapForecastResponse(
  response: WeatherApiResponse,
  matchDate: string
): WeatherForecast {
  const forecastEntry = findClosestForecastEntry(response.list, matchDate);
  if (!forecastEntry) {
    throw new UpstreamApiError("Empty weather forecast");
  }

  const precipMm =
    forecastEntry.rain?.["1h"] ?? forecastEntry.rain?.["3h"] ?? 0;

  return {
    condition:
      forecastEntry.weather[0]?.description ??
      forecastEntry.weather[0]?.main ??
      "Unknown",
    tempC: forecastEntry.main.temp,
    humidity: forecastEntry.main.humidity,
    windKph: forecastEntry.wind.speed * 3.6,
    precipMm,
    lat: response.city.coord.lat,
    lon: response.city.coord.lon,
  };
}

function selectForecastType(_matchDate: string): "three_hour" {
  // weather-api167 only accepts three_hour (hourly was removed upstream).
  return "three_hour";
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
  const forecastType = selectForecastType(matchDate);
  const cacheKey = `weather:${city.toLowerCase()}:${dateOnly}:${forecastType}`;

  const cachedWeather = await readWeatherApiCache<WeatherApiResponse>(cacheKey);
  if (cachedWeather?.list?.length) {
    return mapForecastResponse(cachedWeather, matchDate);
  }

  const { data: response } = await cachedFetch<WeatherApiResponse>({
    provider: "weather",
    cacheKey,
    ttlMs: TTL.WEATHER,
    dailyLimit: DAILY_LIMITS.weather,
    fetcher: async () => {
      try {
        const client = getWeatherClient();
        const { data } = await client.get<WeatherApiResponse>("/api/weather/forecast", {
          params: {
            place: city,
            units: "metric",
            type: forecastType,
            lang: "en",
          },
        });

        if ("message" in data && typeof (data as { message?: string }).message === "string") {
          throw new UpstreamApiError(
            `Weather API error: ${(data as { message: string }).message}`
          );
        }

        return data;
      } catch (err) {
        if (err instanceof UpstreamApiError) throw err;
        if (axios.isAxiosError(err)) {
          const payload = err.response?.data as { message?: string } | undefined;
          const msg = payload?.message ?? err.message;
          throw new UpstreamApiError(`Weather API error: ${msg}`);
        }
        throw err;
      }
    },
  });

  if (!response.list?.length) {
    throw new UpstreamApiError(`No weather forecast for ${city} on ${dateOnly}`);
  }

  const forecast = mapForecastResponse(response, matchDate);

  if (fetchedForStore) {
    await saveWeatherToStore(city, matchDate, forecast);
  }

  return forecast;
}

export function getMockResponse(city: string, date: string): WeatherApiResponse {
  return getMockWeatherApiResponse(city, date);
}

import axios from "axios";
import {
  getOpenMeteoApiKey,
  getOpenMeteoForecastBaseUrl,
  getOpenMeteoGeocodingBaseUrl,
  OPEN_METEO_VERSION,
} from "@/lib/config/open-meteo";
import { describeWeatherCode } from "@/lib/api/open-meteo/weather-codes";
import type {
  OpenMeteoForecastResponse,
  OpenMeteoGeocodingResponse,
  OpenMeteoGeocodingResult,
  OpenMeteoWeatherCachePayload,
} from "@/lib/api/open-meteo/types";
import type { WeatherForecast } from "@/lib/types/prediction";
import { UpstreamApiError } from "@/lib/types/prediction";

const REQUEST_TIMEOUT_MS = 12_000;

function buildAuthParams(): Record<string, string> {
  const apiKey = getOpenMeteoApiKey();
  return apiKey ? { apikey: apiKey } : {};
}

function parseOpenMeteoError(data: unknown, fallback: string): never {
  const payload = data as { error?: boolean; reason?: string } | undefined;
  if (payload?.error && payload.reason) {
    throw new UpstreamApiError(`Open-Meteo error: ${payload.reason}`);
  }
  throw new UpstreamApiError(fallback);
}

function rethrowOpenMeteoTransportError(err: unknown, context: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail =
      status != null
        ? `HTTP ${status}`
        : err.code === "ECONNABORTED"
          ? "request timed out"
          : err.message;
    throw new UpstreamApiError(`Open-Meteo ${context} failed (${detail}).`);
  }
  throw err;
}

export async function geocodeLocation(query: string): Promise<OpenMeteoGeocodingResult> {
  const name = query.trim();
  if (name.length < 2) {
    throw new UpstreamApiError("Location must be at least 2 characters.");
  }

  let data: OpenMeteoGeocodingResponse;
  try {
    ({ data } = await axios.get<OpenMeteoGeocodingResponse>(
      `${getOpenMeteoGeocodingBaseUrl()}/v1/search`,
      {
        params: {
          name,
          count: 1,
          language: "en",
          format: "json",
          ...buildAuthParams(),
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    ));
  } catch (err) {
    rethrowOpenMeteoTransportError(err, `geocoding for "${name}"`);
  }

  if (data.error) {
    parseOpenMeteoError(data, `Geocoding failed for "${name}"`);
  }

  const match = data.results?.[0];
  if (!match) {
    throw new UpstreamApiError(`No location found for "${name}". Try a city name or postal code.`);
  }

  return match;
}

function forecastDaysForMatch(matchDate: string): number {
  const matchMs = new Date(matchDate).getTime();
  if (!Number.isFinite(matchMs)) return 7;

  const daysUntil = Math.ceil((matchMs - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.min(16, Math.max(1, daysUntil + 1));
}

export async function fetchOpenMeteoForecast(
  location: OpenMeteoGeocodingResult,
  matchDate: string
): Promise<OpenMeteoForecastResponse> {
  const days = forecastDaysForMatch(matchDate);

  let data: OpenMeteoForecastResponse;
  try {
    ({ data } = await axios.get<OpenMeteoForecastResponse>(
      `${getOpenMeteoForecastBaseUrl()}/v1/forecast`,
      {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          hourly: [
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
          ].join(","),
          forecast_days: days,
          timezone: "UTC",
          wind_speed_unit: "kmh",
          precipitation_unit: "mm",
          ...buildAuthParams(),
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    ));
  } catch (err) {
    rethrowOpenMeteoTransportError(err, `forecast for ${location.name}`);
  }

  if (data.error) {
    parseOpenMeteoError(data, `Forecast failed for ${location.name}`);
  }

  if (!data.hourly?.time?.length) {
    throw new UpstreamApiError(
      `No hourly forecast for ${location.name}. Match may be beyond the 16-day forecast window.`
    );
  }

  return data;
}

function findClosestHourlyIndex(times: string[], matchDate: string): number {
  const matchMs = new Date(matchDate).getTime();
  if (!Number.isFinite(matchMs)) return 0;

  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i += 1) {
    const entryMs = new Date(`${times[i]}Z`).getTime();
    const delta = Math.abs(entryMs - matchMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function mapOpenMeteoToWeatherForecast(
  location: OpenMeteoGeocodingResult,
  forecast: OpenMeteoForecastResponse,
  matchDate: string
): WeatherForecast {
  const hourly = forecast.hourly;
  const index = findClosestHourlyIndex(hourly.time, matchDate);
  const weatherCode = hourly.weather_code[index];

  return {
    condition: describeWeatherCode(weatherCode),
    tempC: hourly.temperature_2m[index] ?? 0,
    humidity: hourly.relative_humidity_2m[index] ?? 0,
    windKph: hourly.wind_speed_10m[index] ?? 0,
    precipMm: hourly.precipitation[index] ?? 0,
    weatherCode,
    lat: location.latitude,
    lon: location.longitude,
  };
}

export async function fetchOpenMeteoWeatherBundle(
  city: string,
  matchDate: string
): Promise<OpenMeteoWeatherCachePayload> {
  const location = await geocodeLocation(city);
  const forecast = await fetchOpenMeteoForecast(location, matchDate);

  return {
    provider: "open-meteo",
    version: OPEN_METEO_VERSION,
    location,
    forecast,
  };
}

export function weatherForecastFromCache(
  payload: OpenMeteoWeatherCachePayload,
  matchDate: string
): WeatherForecast {
  return mapOpenMeteoToWeatherForecast(payload.location, payload.forecast, matchDate);
}

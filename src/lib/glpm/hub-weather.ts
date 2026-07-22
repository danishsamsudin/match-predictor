/**
 * Extract home-venue location + weather for GLPM hub upcoming cards.
 * Weather is always scoped to the match venue (home ground).
 */

import { getWeatherForecast } from "@/lib/api/weather";
import { fetchOpenMeteoForecast, mapOpenMeteoToWeatherForecast } from "@/lib/api/open-meteo/client";
import { cachedFetch, DAILY_LIMITS, TTL } from "@/lib/cache/api-cache";
import { OPEN_METEO_VERSION } from "@/lib/config/open-meteo";
import type { OpenMeteoGeocodingResult, OpenMeteoWeatherCachePayload } from "@/lib/api/open-meteo/types";
import { readWeatherApiCache } from "@/lib/data/synced-resource-cache";
import type { GlpmHubWeather } from "@/lib/glpm/hub-types";
import type { WeatherForecast } from "@/lib/types/prediction";

/** Open-Meteo free forecast horizon (~16 days). */
export const GLPM_WEATHER_FORECAST_HORIZON_DAYS = 16;

export type VenueLocationHint = {
  cityName: string | null;
  venueName: string | null;
  latitude: number | null;
  longitude: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

/** Pull city / coords from Sportmonks venue blob on glpm_matches.payload. */
export function extractVenueLocation(
  payload: unknown,
  fallbackVenueName?: string | null,
  fallbackCity?: string | null
): VenueLocationHint {
  const root = asRecord(payload);
  const venue = asRecord(root?.venue) ?? asRecord(root?.Venue);
  const cityName =
    readString(venue?.city_name) ??
    readString(venue?.city) ??
    readString(fallbackCity);
  const venueName =
    readString(venue?.name) ?? readString(fallbackVenueName);
  const latitude = readNumber(venue?.latitude);
  const longitude = readNumber(venue?.longitude);
  return { cityName, venueName, latitude, longitude };
}

/** Merge payload hints with a stored glpm_venues row (preferred for weather). */
export function mergeVenueLocation(
  payloadHint: VenueLocationHint,
  stored?: {
    name?: string | null;
    city_name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null
): VenueLocationHint {
  if (!stored) return payloadHint;
  const lat = stored.latitude != null ? Number(stored.latitude) : null;
  const lon = stored.longitude != null ? Number(stored.longitude) : null;
  return {
    cityName: stored.city_name ?? payloadHint.cityName,
    venueName: stored.name ?? payloadHint.venueName,
    latitude: lat != null && Number.isFinite(lat) ? lat : payloadHint.latitude,
    longitude: lon != null && Number.isFinite(lon) ? lon : payloadHint.longitude,
  };
}

function parseSportmonksWeather(
  payload: unknown,
  loc: VenueLocationHint
): GlpmHubWeather | null {
  const root = asRecord(payload);
  if (!root) return null;
  const report =
    asRecord(root.weatherReport) ??
    asRecord(root.weatherreport) ??
    asRecord(root.weather_report) ??
    asRecord(root.weather);
  if (!report) return null;

  const condition =
    readString(report.description) ??
    readString(report.condition) ??
    readString(report.summary) ??
    readString(report.type);
  const tempC =
    readNumber(report.temperature) ??
    readNumber(report.temp) ??
    readNumber(report.temp_c) ??
    readNumber(report.temperature_celsius);
  const weatherCode =
    readNumber(report.code) ??
    readNumber(report.weather_code) ??
    readNumber(report.weatherCode) ??
    undefined;

  if (!condition || tempC == null) return null;
  return {
    status: "available",
    condition,
    tempC,
    weatherCode: weatherCode ?? undefined,
    source: "sportmonks",
    venueName: loc.venueName,
    cityName: loc.cityName,
  };
}

function toHubWeather(
  forecast: WeatherForecast,
  source: "sportmonks" | "open-meteo",
  loc: VenueLocationHint
): GlpmHubWeather | null {
  const condition = forecast.condition?.trim();
  if (!condition) return null;
  const lower = condition.toLowerCase();
  if (
    lower.includes("unavailable") ||
    lower === "unknown" ||
    lower.includes("no hourly")
  ) {
    return null;
  }
  if (!Number.isFinite(forecast.tempC)) return null;
  return {
    status: "available",
    condition,
    tempC: Math.round(forecast.tempC),
    weatherCode: forecast.weatherCode,
    source,
    venueName: loc.venueName,
    cityName: loc.cityName,
  };
}

export function tbcWeather(loc: VenueLocationHint): GlpmHubWeather {
  return {
    status: "tbc",
    condition: "TBC",
    tempC: null,
    source: "pending",
    venueName: loc.venueName,
    cityName: loc.cityName,
  };
}

/** True when kickoff is within the Open-Meteo free forecast horizon. */
export function isWithinForecastHorizon(
  matchInstant: string,
  maxDays = GLPM_WEATHER_FORECAST_HORIZON_DAYS,
  now = Date.now()
): boolean {
  const matchMs = new Date(matchInstant).getTime();
  if (!Number.isFinite(matchMs)) return false;
  const daysUntil = (matchMs - now) / (24 * 60 * 60 * 1000);
  // Past kickoffs: still allow (historical hour lookup may fail softly).
  return daysUntil <= maxDays;
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

async function forecastFromCoordinates(
  latitude: number,
  longitude: number,
  label: string,
  matchDate: string
): Promise<WeatherForecast | null> {
  const dateOnly = matchDate.slice(0, 10);
  const cacheKey = `weather:open-meteo:coords:${latitude.toFixed(3)},${longitude.toFixed(3)}:${dateOnly}`;

  const cached = await readWeatherApiCache<OpenMeteoWeatherCachePayload>(cacheKey);
  if (isValidWeatherCache(cached)) {
    return mapOpenMeteoToWeatherForecast(cached.location, cached.forecast, matchDate);
  }

  try {
    const location: OpenMeteoGeocodingResult = {
      id: 0,
      name: label,
      latitude,
      longitude,
    };
    const { data: payload } = await cachedFetch<OpenMeteoWeatherCachePayload>({
      provider: "weather",
      cacheKey,
      ttlMs: TTL.WEATHER,
      dailyLimit: DAILY_LIMITS.weather,
      fetcher: async () => {
        const forecast = await fetchOpenMeteoForecast(location, matchDate);
        return {
          provider: "open-meteo" as const,
          version: OPEN_METEO_VERSION,
          location,
          forecast,
        };
      },
    });
    if (!isValidWeatherCache(payload)) return null;
    return mapOpenMeteoToWeatherForecast(payload.location, payload.forecast, matchDate);
  } catch {
    return null;
  }
}

/**
 * Resolve kickoff weather for the **home venue** of a fixture.
 * Returns a real forecast when within horizon; otherwise `{ status: "tbc" }`.
 */
export async function resolveHubMatchWeather(input: {
  payload: unknown;
  /** Match venue name (home ground). */
  venueName?: string | null;
  /** Home team city fallback only — never away. */
  homeTeamCity?: string | null;
  matchDate: string | null;
  kickoffAt?: string | null;
  /** Preferred home-ground coordinates from glpm_venues (match.venue_sm_id). */
  storedVenue?: {
    name?: string | null;
    city_name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}): Promise<GlpmHubWeather> {
  const loc = mergeVenueLocation(
    extractVenueLocation(input.payload, input.venueName, input.homeTeamCity),
    input.storedVenue
  );

  const matchInstant = input.kickoffAt ?? input.matchDate;
  if (!matchInstant) return tbcWeather(loc);

  // Beyond Open-Meteo horizon → show TBC (do not invent a forecast).
  if (!isWithinForecastHorizon(matchInstant)) {
    return tbcWeather(loc);
  }

  const fromSm = parseSportmonksWeather(input.payload, loc);
  if (fromSm) return fromSm;

  if (loc.latitude != null && loc.longitude != null) {
    const label = loc.cityName ?? loc.venueName ?? "Home venue";
    const fromCoords = await forecastFromCoordinates(
      loc.latitude,
      loc.longitude,
      label,
      matchInstant
    );
    const mapped = fromCoords ? toHubWeather(fromCoords, "open-meteo", loc) : null;
    if (mapped) return mapped;
  }

  // Geocode home city / home venue name only (not away).
  const cityCandidates = [loc.cityName, loc.venueName, input.homeTeamCity].filter(
    (c): c is string => Boolean(c && c.trim())
  );

  for (const city of cityCandidates) {
    try {
      const forecast = await getWeatherForecast(city, matchInstant.slice(0, 10), {
        allowLive: true,
      });
      const mapped = toHubWeather(forecast, "open-meteo", loc);
      if (mapped) return mapped;
    } catch {
      /* try next candidate */
    }
  }

  return tbcWeather(loc);
}

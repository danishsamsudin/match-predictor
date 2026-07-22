/**
 * Build rest / travel / altitude / weather features for GLPM-CX.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  cxAltitudeMultipliers,
  cxRestDaysMultiplier,
  cxTravelMultiplier,
  cxWeatherMultiplier,
  DEFAULT_CX_CONTEXT_CONFIG,
  type CxWeatherInput,
} from "@/lib/glpm-cx/apply-cx";
import { resolveHubMatchWeather } from "@/lib/glpm/hub-weather";
import { getWeatherForecast } from "@/lib/api/weather";

type Client = SupabaseClient<Database>;

const EARTH_KM = 6371;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function daysSinceLastMatch(
  client: Client,
  teamSmId: number,
  beforeDate: string
): Promise<number | null> {
  const { data } = await client
    .from("glpm_matches")
    .select("match_date")
    .or(`home_team_sm_id.eq.${teamSmId},away_team_sm_id.eq.${teamSmId}`)
    .lt("match_date", beforeDate)
    .not("home_score", "is", null)
    .order("match_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.match_date) return null;
  const prev = Date.parse(String(data.match_date));
  const next = Date.parse(beforeDate);
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return null;
  return Math.max(0, (next - prev) / (1000 * 60 * 60 * 24));
}

async function resolveHomeVenue(
  client: Client,
  homeTeamSmId: number,
  matchSmId?: number | null
): Promise<{
  venueSmId: number | null;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  cityName: string | null;
  venueName: string | null;
  matchDate: string;
  kickoffAt: string | null;
  payload: unknown;
}> {
  let matchDate = new Date().toISOString().slice(0, 10);
  let kickoffAt: string | null = null;
  let venueSmId: number | null = null;
  let payload: unknown = null;

  if (matchSmId != null) {
    const { data: match } = await client
      .from("glpm_matches")
      .select("match_date,kickoff_at,venue_sm_id,venue,payload")
      .eq("sm_id", matchSmId)
      .maybeSingle();
    if (match?.match_date) matchDate = String(match.match_date).slice(0, 10);
    kickoffAt = match?.kickoff_at ?? null;
    venueSmId = match?.venue_sm_id ?? null;
    payload = match?.payload ?? null;
  } else {
    const { data: homeMatch } = await client
      .from("glpm_matches")
      .select("match_date,venue_sm_id,venue,payload")
      .eq("home_team_sm_id", homeTeamSmId)
      .not("venue_sm_id", "is", null)
      .order("match_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    venueSmId = homeMatch?.venue_sm_id ?? null;
    payload = homeMatch?.payload ?? null;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  let altitudeM: number | null = null;
  let cityName: string | null = null;
  let venueName: string | null = null;

  if (venueSmId != null) {
    const { data: venue } = await client
      .from("glpm_venues")
      .select("latitude,longitude,altitude_m,city_name,name")
      .eq("sm_id", venueSmId)
      .maybeSingle();
    if (venue) {
      latitude = Number.isFinite(Number(venue.latitude)) ? Number(venue.latitude) : null;
      longitude = Number.isFinite(Number(venue.longitude)) ? Number(venue.longitude) : null;
      altitudeM =
        venue.altitude_m != null && Number.isFinite(Number(venue.altitude_m))
          ? Number(venue.altitude_m)
          : null;
      cityName = venue.city_name;
      venueName = venue.name;
    }
  }

  if (altitudeM == null) {
    const { data: team } = await client
      .from("glpm_teams")
      .select("altitude,city,stadium_name")
      .eq("sm_id", homeTeamSmId)
      .maybeSingle();
    if (team?.altitude != null && Number.isFinite(Number(team.altitude))) {
      altitudeM = Number(team.altitude);
    }
    cityName = cityName ?? team?.city ?? null;
    venueName = venueName ?? team?.stadium_name ?? null;
  }

  return {
    venueSmId,
    latitude,
    longitude,
    altitudeM,
    cityName,
    venueName,
    matchDate,
    kickoffAt,
    payload,
  };
}

async function teamHomeCoords(
  client: Client,
  teamSmId: number
): Promise<{ lat: number; lon: number } | null> {
  const { data: homeMatch } = await client
    .from("glpm_matches")
    .select("venue_sm_id")
    .eq("home_team_sm_id", teamSmId)
    .not("venue_sm_id", "is", null)
    .order("match_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (homeMatch?.venue_sm_id == null) return null;
  const { data: venue } = await client
    .from("glpm_venues")
    .select("latitude,longitude")
    .eq("sm_id", homeMatch.venue_sm_id)
    .maybeSingle();
  if (!venue) return null;
  const lat = Number(venue.latitude);
  const lon = Number(venue.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export type CxBuiltFeatures = {
  matchDate: string;
  homeRestDays: number | null;
  awayRestDays: number | null;
  homeTravelKm: number;
  awayTravelKm: number;
  venueAltitudeM: number | null;
  weather: CxWeatherInput | null;
  weatherSummary: string | null;
  home: {
    restDays: number | null;
    travelKm: number;
    restMult: number;
    travelMult: number;
    altitudeMult: number;
    weatherMult: number;
  };
  away: {
    restDays: number | null;
    travelKm: number;
    restMult: number;
    travelMult: number;
    altitudeMult: number;
    weatherMult: number;
  };
};

export async function buildCxContextFeatures(
  client: Client,
  opts: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    matchSmId?: number | null;
    matchDate?: string | null;
  }
): Promise<CxBuiltFeatures> {
  const config = DEFAULT_CX_CONTEXT_CONFIG;
  const venue = await resolveHomeVenue(client, opts.homeTeamSmId, opts.matchSmId);
  const matchDate = opts.matchDate ?? venue.matchDate;

  const [homeRest, awayRest, homeCoords, awayCoords] = await Promise.all([
    daysSinceLastMatch(client, opts.homeTeamSmId, matchDate),
    daysSinceLastMatch(client, opts.awayTeamSmId, matchDate),
    teamHomeCoords(client, opts.homeTeamSmId),
    teamHomeCoords(client, opts.awayTeamSmId),
  ]);

  let homeTravelKm = 0;
  let awayTravelKm = 0;
  if (venue.latitude != null && venue.longitude != null) {
    if (homeCoords) {
      homeTravelKm = haversineKm(
        homeCoords.lat,
        homeCoords.lon,
        venue.latitude,
        venue.longitude
      );
    }
    if (awayCoords) {
      awayTravelKm = haversineKm(
        awayCoords.lat,
        awayCoords.lon,
        venue.latitude,
        venue.longitude
      );
    }
  }

  const alt = cxAltitudeMultipliers(venue.altitudeM, config);

  let weather: CxWeatherInput | null = null;
  let weatherSummary: string | null = null;
  try {
    const hubWeather = await resolveHubMatchWeather({
      payload: venue.payload,
      venueName: venue.venueName,
      homeTeamCity: venue.cityName,
      matchDate,
      kickoffAt: venue.kickoffAt,
      storedVenue: {
        name: venue.venueName,
        city_name: venue.cityName,
        latitude: venue.latitude,
        longitude: venue.longitude,
      },
    });
    weatherSummary =
      hubWeather.status === "available"
        ? `${hubWeather.condition ?? "Forecast"}${
            hubWeather.tempC != null ? ` · ${hubWeather.tempC}°C` : ""
          }`
        : "TBC";

    // Pull precip/wind from Open-Meteo when city is known (hub weather omits mm/kph).
    if (venue.cityName || venue.venueName) {
      try {
        const forecast = await getWeatherForecast(
          venue.cityName ?? venue.venueName ?? "Home",
          matchDate,
          { allowLive: true }
        );
        weather = {
          precipitationMm: forecast.precipMm ?? null,
          windSpeedKph: forecast.windKph ?? null,
        };
      } catch {
        weather = null;
      }
    }
  } catch {
    weather = null;
  }

  const weatherMult = cxWeatherMultiplier(weather, config);

  return {
    matchDate,
    homeRestDays: homeRest,
    awayRestDays: awayRest,
    homeTravelKm,
    awayTravelKm,
    venueAltitudeM: venue.altitudeM,
    weather,
    weatherSummary,
    home: {
      restDays: homeRest,
      travelKm: homeTravelKm,
      restMult: cxRestDaysMultiplier(homeRest ?? config.restBaselineDays, config),
      travelMult: cxTravelMultiplier(homeTravelKm, config),
      altitudeMult: alt.home,
      weatherMult,
    },
    away: {
      restDays: awayRest,
      travelKm: awayTravelKm,
      restMult: cxRestDaysMultiplier(awayRest ?? config.restBaselineDays, config),
      travelMult: cxTravelMultiplier(awayTravelKm, config),
      altitudeMult: alt.away,
      weatherMult,
    },
  };
}

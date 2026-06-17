import type { GeoPoint, StadiumImpactResult } from "@/lib/types/prediction";
import { citiesMatch } from "@/lib/prediction/neutral-venue";
import { getStadiumAltitude, haversineKm } from "@/lib/utils/geo";

export interface TeamTravelContext {
  city: string;
  homeLocation: GeoPoint | null;
}

/** xG boost when a team plays in its home city (compare mode / neutral-ground exceptions). */
export const HOME_CITY_XG_MULTIPLIER = 1.12;
/** Capped host lift for FIFA World Cup venues (avoids stacking with altitude). */
export const INTERNATIONAL_HOST_CITY_CAP = 1.06;

function applyTravelFatigue(
  distanceKm: number,
  city: string,
  side: "home" | "away",
  notes: string[]
): number {
  if (distanceKm > 1500) {
    notes.push(
      `${side === "home" ? "Home" : "Away"} team travel distance ~${Math.round(distanceKm)} km from ${city} reduces xG by 5% (δ_travel = 0.95).`
    );
    return 0.95;
  }
  if (distanceKm > 500) {
    notes.push(
      `Moderate ${side} travel (~${Math.round(distanceKm)} km from ${city}) — within secondary fatigue band.`
    );
    return 0.98;
  }
  return 1;
}

function applyHomeCityAdvantage(
  matchCity: string,
  teamCity: string,
  side: "home" | "away",
  notes: string[],
  cap?: number
): number {
  if (!matchCity || !teamCity || !citiesMatch(matchCity, teamCity)) {
    return 1;
  }
  const multiplier = cap != null ? Math.min(HOME_CITY_XG_MULTIPLIER, cap) : HOME_CITY_XG_MULTIPLIER;
  notes.push(
    `${side === "home" ? "Home" : "Away"} side plays in ${teamCity} — home-city xG boost ${((multiplier - 1) * 100).toFixed(0)}% (δ_home_city = ${multiplier}).`
  );
  return multiplier;
}

export function computeStadiumImpact(
  venueName: string,
  matchLocation: GeoPoint,
  homeTeam: TeamTravelContext,
  awayTeam: TeamTravelContext,
  options?: {
    isNeutralVenue?: boolean;
    matchCity?: string;
    /** Cap home-city boost (FIFA World Cup host venues). */
    hostCityMultiplierCap?: number;
    /** Softer altitude shock for international tournaments. */
    internationalTournament?: boolean;
  }
): StadiumImpactResult {
  let homeXgMultiplier = 1;
  let awayXgMultiplier = 1;
  let foulsMultiplier = 1;
  let cardsMultiplier = 1;
  const notes: string[] = [];
  const isNeutral = options?.isNeutralVenue ?? false;
  const matchCity = options?.matchCity ?? "";

  if (isNeutral) {
    if (homeTeam.homeLocation) {
      const distance = haversineKm(
        homeTeam.homeLocation.lat,
        homeTeam.homeLocation.lon,
        matchLocation.lat,
        matchLocation.lon
      );
      homeXgMultiplier *= applyTravelFatigue(distance, homeTeam.city, "home", notes);
    }
    if (awayTeam.homeLocation) {
      const distance = haversineKm(
        awayTeam.homeLocation.lat,
        awayTeam.homeLocation.lon,
        matchLocation.lat,
        matchLocation.lon
      );
      awayXgMultiplier *= applyTravelFatigue(distance, awayTeam.city, "away", notes);
    }
    const hostCap = options?.hostCityMultiplierCap;
    homeXgMultiplier *= applyHomeCityAdvantage(matchCity, homeTeam.city, "home", notes, hostCap);
    awayXgMultiplier *= applyHomeCityAdvantage(matchCity, awayTeam.city, "away", notes, hostCap);
  } else if (awayTeam.homeLocation) {
    const distance = haversineKm(
      awayTeam.homeLocation.lat,
      awayTeam.homeLocation.lon,
      matchLocation.lat,
      matchLocation.lon
    );
    awayXgMultiplier *= applyTravelFatigue(distance, awayTeam.city, "away", notes);
  }

  const altitude = getStadiumAltitude(venueName);
  if (altitude > 1000) {
    const altBoost = options?.internationalTournament ? 1.015 : 1.03;
    homeXgMultiplier *= altBoost;
    awayXgMultiplier *= altBoost;
    foulsMultiplier *= 1.05;
    cardsMultiplier *= 1.05;
    notes.push(
      `High altitude venue (${altitude}m at ${venueName}) boosts xG by ${((altBoost - 1) * 100).toFixed(1)}% (δ_altitude = ${altBoost}) and increases fouls/cards by 5%.`
    );
  }

  if (isNeutral && notes.length === 0) {
    notes.push(`Neutral venue at ${venueName} — travel distances within fatigue threshold for both teams.`);
  } else if (notes.length === 0) {
    notes.push(`Standard stadium conditions at ${venueName} — no significant travel or altitude effects.`);
  }

  return { homeXgMultiplier, awayXgMultiplier, foulsMultiplier, cardsMultiplier, notes };
}

import type { GeoPoint, StadiumImpactResult } from "@/lib/types/prediction";
import { getStadiumAltitude, haversineKm } from "@/lib/utils/geo";

export function computeStadiumImpact(
  venueName: string,
  awayHomeCity: string,
  matchLocation: GeoPoint,
  awayHomeLocation: GeoPoint | null
): StadiumImpactResult {
  let homeXgMultiplier = 1;
  let awayXgMultiplier = 1;
  let foulsMultiplier = 1;
  let cardsMultiplier = 1;
  const notes: string[] = [];

  if (awayHomeLocation) {
    const distance = haversineKm(
      awayHomeLocation.lat,
      awayHomeLocation.lon,
      matchLocation.lat,
      matchLocation.lon
    );
    if (distance > 1500) {
      awayXgMultiplier *= 0.95;
      notes.push(
        `Away team travel distance ~${Math.round(distance)} km from ${awayHomeCity} reduces away xG by 5% (δ_travel = 0.95).`
      );
    } else if (distance > 500) {
      notes.push(`Moderate away travel (~${Math.round(distance)} km) - within fatigue threshold.`);
    }
  }

  const altitude = getStadiumAltitude(venueName);
  if (altitude > 1000) {
    homeXgMultiplier *= 1.03;
    awayXgMultiplier *= 1.03;
    foulsMultiplier *= 1.05;
    cardsMultiplier *= 1.05;
    notes.push(
      `High altitude venue (${altitude}m at ${venueName}) boosts xG by 3% (δ_altitude = 1.03) and increases fouls/cards by 5%.`
    );
  }

  if (notes.length === 0) {
    notes.push(`Standard stadium conditions at ${venueName} - no significant travel or altitude effects.`);
  }

  return { homeXgMultiplier, awayXgMultiplier, foulsMultiplier, cardsMultiplier, notes };
}

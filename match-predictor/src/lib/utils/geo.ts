import type { GeoPoint } from "@/lib/types/prediction";

/** City-center coordinates for travel-fatigue calculations. */
export const CITY_COORDINATES: Record<string, GeoPoint> = {
  london: { lat: 51.5074, lon: -0.1278 },
  paris: { lat: 48.8566, lon: 2.3522 },
  budapest: { lat: 47.4979, lon: 19.0402 },
  manchester: { lat: 53.4808, lon: -2.2426 },
  liverpool: { lat: 53.4084, lon: -2.9916 },
  munich: { lat: 48.1351, lon: 11.582 },
  dortmund: { lat: 51.5136, lon: 7.4653 },
  barcelona: { lat: 41.3874, lon: 2.1686 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  milan: { lat: 45.4642, lon: 9.19 },
  turin: { lat: 45.0703, lon: 7.6869 },
  amsterdam: { lat: 52.3676, lon: 4.9041 },
  brighton: { lat: 50.8225, lon: -0.1372 },
  rome: { lat: 41.9028, lon: 12.4964 },
  istanbul: { lat: 41.0082, lon: 28.9784 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  athens: { lat: 37.9838, lon: 23.7275 },
  berlin: { lat: 52.52, lon: 13.405 },
  seville: { lat: 37.3891, lon: -5.9845 },
};

export function resolveCityCoordinates(city: string | undefined): GeoPoint | null {
  const normalized = city?.trim().toLowerCase() ?? "";
  if (!normalized) return null;

  if (CITY_COORDINATES[normalized]) return CITY_COORDINATES[normalized];

  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (normalized.includes(key) || key.includes(normalized)) return coords;
  }

  return null;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const STADIUM_ALTITUDES: Record<string, number> = {
  "Estadio Azteca": 2240,
  "Estadio Hernando Siles": 3637,
  "Estadio Nacional": 2640,
  "Estadio Metropolitano": 2500,
  "Estadio de La Paz": 3577,
  "Estadio El Campín": 2640,
  "Estadio Monumental": 2500,
  "Estadio Cuscatlán": 650,
};

export function getStadiumAltitude(venueName: string): number {
  for (const [name, altitude] of Object.entries(STADIUM_ALTITUDES)) {
    if (venueName.toLowerCase().includes(name.toLowerCase())) {
      return altitude;
    }
  }
  return 0;
}

export function isWetClimateLat(lat: number): boolean {
  return lat > 45 || (lat > 5 && lat < 15);
}

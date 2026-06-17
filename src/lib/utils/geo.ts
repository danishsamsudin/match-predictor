import type { GeoPoint } from "@/lib/types/prediction";
import { GENERATED_CITY_COORDINATES } from "@/lib/utils/city-coordinates.generated";

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
  breda: { lat: 51.5719, lon: 4.7683 },
  eindhoven: { lat: 51.4416, lon: 5.4697 },
  rotterdam: { lat: 51.9244, lon: 4.4777 },
  brighton: { lat: 50.8225, lon: -0.1372 },
  rome: { lat: 41.9028, lon: 12.4964 },
  istanbul: { lat: 41.0082, lon: 28.9784 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  athens: { lat: 37.9838, lon: 23.7275 },
  berlin: { lat: 52.52, lon: 13.405 },
  seville: { lat: 37.3891, lon: -5.9845 },
  houston: { lat: 29.7604, lon: -95.3698 },
  stockholm: { lat: 59.3293, lon: 18.0686 },
  oslo: { lat: 59.9139, lon: 10.7522 },
  copenhagen: { lat: 55.6761, lon: 12.5683 },
  vienna: { lat: 48.2082, lon: 16.3738 },
  brussels: { lat: 50.8503, lon: 4.3517 },
  sarajevo: { lat: 43.8563, lon: 18.4131 },
  "rio de janeiro": { lat: -22.9068, lon: -43.1729 },
  praia: { lat: 14.933, lon: -23.5133 },
  toronto: { lat: 43.6532, lon: -79.3832 },
  bogotá: { lat: 4.711, lon: -74.0721 },
  bogota: { lat: 4.711, lon: -74.0721 },
  abidjan: { lat: 5.36, lon: -4.0083 },
  zagreb: { lat: 45.815, lon: 15.9819 },
  willemstad: { lat: 12.1224, lon: -68.8824 },
  prague: { lat: 50.0755, lon: 14.4378 },
  kinshasa: { lat: -4.4419, lon: 15.2663 },
  quito: { lat: -0.1807, lon: -78.4678 },
  cairo: { lat: 30.0444, lon: 31.2357 },
  "buenos aires": { lat: -34.6037, lon: -58.3816 },
  sydney: { lat: -33.8688, lon: 151.2093 },
  accra: { lat: 5.6037, lon: -0.187 },
  "port-au-prince": { lat: 18.5944, lon: -72.3074 },
  tehran: { lat: 35.6892, lon: 51.389 },
  baghdad: { lat: 33.3152, lon: 44.3661 },
  tokyo: { lat: 35.6762, lon: 139.6503 },
  amman: { lat: 31.9454, lon: 35.9284 },
  "mexico city": { lat: 19.4326, lon: -99.1332 },
  rabat: { lat: 34.0209, lon: -6.8416 },
  wellington: { lat: -41.2865, lon: 174.7762 },
  "panama city": { lat: 8.9824, lon: -79.5199 },
  asunción: { lat: -25.2637, lon: -57.5759 },
  asuncion: { lat: -25.2637, lon: -57.5759 },
  doha: { lat: 25.2854, lon: 51.531 },
  riyadh: { lat: 24.7136, lon: 46.6753 },
  edinburgh: { lat: 55.9533, lon: -3.1883 },
  dakar: { lat: 14.7167, lon: -17.4677 },
  johannesburg: { lat: -26.2041, lon: 28.0473 },
  seoul: { lat: 37.5665, lon: 126.978 },
  bern: { lat: 46.948, lon: 7.4474 },
  tunis: { lat: 36.8065, lon: 10.1815 },
  montevideo: { lat: -34.9011, lon: -56.1645 },
  washington: { lat: 38.9072, lon: -77.0369 },
  tashkent: { lat: 41.2995, lon: 69.2401 },
  algiers: { lat: 36.7538, lon: 3.0588 },
};

const ALL_CITY_COORDINATES: Record<string, GeoPoint> = {
  ...GENERATED_CITY_COORDINATES,
  ...CITY_COORDINATES,
};

export function resolveCityCoordinates(city: string | undefined): GeoPoint | null {
  const normalized = city?.trim().toLowerCase() ?? "";
  if (!normalized) return null;

  if (ALL_CITY_COORDINATES[normalized]) return ALL_CITY_COORDINATES[normalized];

  for (const [key, coords] of Object.entries(ALL_CITY_COORDINATES)) {
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

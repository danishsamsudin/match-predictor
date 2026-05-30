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

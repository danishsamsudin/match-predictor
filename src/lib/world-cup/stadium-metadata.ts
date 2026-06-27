import stadiumData from "../../../data/world-cup-2026/stadium-metadata.json";

export type StadiumVenue = {
  city: string;
  timezone: string;
  altitude_meters: number;
  country: string;
};

const venues = (stadiumData as { venues: StadiumVenue[] }).venues ?? [];

const byCity = new Map<string, StadiumVenue>();
for (const v of venues) {
  byCity.set(v.city.toLowerCase(), v);
}

/** Stadium / venue labels from schedules → host city for weather & predictor. */
const VENUE_NAME_TO_CITY: Record<string, string> = {
  "estadio akron": "Guadalajara",
  akron: "Guadalajara",
  "sofi stadium": "Los Angeles",
  "metlife stadium": "New York",
  "lincoln financial field": "Philadelphia",
  "gillette stadium": "Boston",
  "mercedes-benz stadium": "Atlanta",
  "hard rock stadium": "Miami",
  "nrg stadium": "Houston",
  "reliant stadium": "Houston",
  "att stadium": "Dallas",
  "at and t stadium": "Dallas",
  "arrowhead stadium": "Kansas City",
  "geha field at arrowhead stadium": "Kansas City",
  "geha field": "Kansas City",
  "empower field": "Denver",
  "lumen field": "Seattle",
  "levis stadium": "San Francisco",
  "levi s stadium": "San Francisco",
  "bc place": "Vancouver",
  "bc place stadium": "Vancouver",
  "bmo field": "Toronto",
  "estadio azteca": "Mexico City",
  "estadio banorte": "Mexico City",
  "estadio bbva": "Monterrey",
  "estadio bbva bancomer": "Monterrey",
};

function normalizeVenueLookupKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s*\(neutral\s*site\)\s*/gi, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveStadiumVenue(cityOrVenue: string | null | undefined): StadiumVenue | null {
  if (!cityOrVenue?.trim()) return null;
  const normalized = normalizeVenueLookupKey(cityOrVenue);
  if (byCity.has(normalized)) return byCity.get(normalized)!;
  const aliasCity = VENUE_NAME_TO_CITY[normalized];
  if (aliasCity) return byCity.get(aliasCity.toLowerCase()) ?? null;
  for (const [key, city] of Object.entries(VENUE_NAME_TO_CITY)) {
    if (normalized.includes(key)) return byCity.get(city.toLowerCase()) ?? null;
  }
  for (const [key, venue] of byCity) {
    if (normalized.includes(key) || key.includes(normalized)) return venue;
  }
  return null;
}

/** City string safe for Open-Meteo geocoding and the main predictor form. */
export function normalizePredictorVenueCity(
  venueCity: string | null | undefined,
  options?: { defaultWhenUnknown?: string }
): string {
  const fallback = options?.defaultWhenUnknown ?? "Neutral";
  const raw = venueCity?.trim();
  if (!raw) return fallback;
  const venue = resolveStadiumVenue(raw);
  if (venue?.city) return venue.city;
  const stripped = raw
    .replace(/\s*\(neutral\s*site\)\s*/gi, "")
    .replace(/\s*neutral\s*site\s*/gi, "")
    .trim();
  if (/^neutral$/i.test(stripped)) return fallback;
  const retry = resolveStadiumVenue(stripped);
  if (retry?.city) return retry.city;
  return stripped;
}

export function timezoneOffsetHours(iana: string): number {
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const local = new Date(now.toLocaleString("en-US", { timeZone: iana }));
    return (local.getTime() - utc.getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}

export function computeJetLagTheta(originTz: string, destTz: string): number {
  const deltaTz = timezoneOffsetHours(destTz) - timezoneOffsetHours(originTz);
  if (deltaTz === 0) return 1;

  const abs = Math.abs(deltaTz);
  const eastward = deltaTz > 0;
  const basePenalty = eastward
    ? 0.012 * abs + 0.004 * Math.max(0, abs - 6)
    : 0.006 * abs;
  return Math.max(0.82, 1 - basePenalty);
}

export function computeRestDelta(restHours: number | null | undefined): number {
  if (restHours == null || restHours >= 72) return 1;
  if (restHours <= 0) return 0.85;
  return 1 - (72 - restHours) / 240;
}

export function computeFinalDelta(
  restHours: number | null | undefined,
  originTz: string | null,
  destTz: string | null
): number {
  const rest = computeRestDelta(restHours);
  const theta =
    originTz && destTz ? computeJetLagTheta(originTz, destTz) : 1;
  const restAmplifier = rest < 0.95 ? 1 + (0.95 - rest) * 0.4 : 1;
  const jetPenalty = 1 - theta;
  const combined = rest * (1 - jetPenalty * restAmplifier);
  return Math.min(1, Math.max(0.82, combined));
}

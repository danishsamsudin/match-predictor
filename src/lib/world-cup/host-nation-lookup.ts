import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";

/** Co-host team name fragments → venue cities where home xG boost applies. */
const CO_HOST_HOME_CITIES: Record<string, string[]> = {
  mexico: ["mexico city", "guadalajara", "monterrey"],
  "united states": [
    "atlanta",
    "boston",
    "dallas",
    "denver",
    "houston",
    "kansas city",
    "los angeles",
    "miami",
    "new york",
    "philadelphia",
    "san francisco",
    "seattle",
  ],
  canada: ["toronto", "vancouver"],
};

function normalizeCity(cityOrVenue: string | null | undefined): string {
  const venue = resolveStadiumVenue(cityOrVenue ?? null);
  return (venue?.city ?? cityOrVenue ?? "").trim().toLowerCase();
}

function coHostKey(homeName: string): string | null {
  const home = normalizeNationalTeamName(homeName).toLowerCase();
  if (home.includes("mexico")) return "mexico";
  if (home.includes("united states") || home === "usa") return "united states";
  if (home.includes("canada")) return "canada";
  return null;
}

/** xG multiplier when a co-host plays in a designated home-nation venue. */
export function resolveHostNationXgBoost(matchCity: string | null, homeName: string): number {
  const key = coHostKey(homeName);
  if (!key) return 1;

  const city = normalizeCity(matchCity);
  if (!city) return 1;

  const allowed = CO_HOST_HOME_CITIES[key] ?? [];
  if (!allowed.some((c) => city.includes(c) || c.includes(city))) return 1;

  return key === "mexico" ? 1.05 : 1.04;
}

/** Motivation sigma boost for co-hosts (separate from xG host boost). */
export function resolveHostMotivationBoost(matchCity: string | null, homeName: string): number {
  const xgBoost = resolveHostNationXgBoost(matchCity, homeName);
  if (xgBoost <= 1) return 1;
  return xgBoost >= 1.05 ? 1.05 : 1.03;
}

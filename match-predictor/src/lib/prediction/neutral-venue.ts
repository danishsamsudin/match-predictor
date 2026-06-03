import type { FootballBundle } from "@/lib/types/football";

const CUP_LEAGUE_KEYWORDS = [
  "champions league",
  "europa league",
  "conference league",
  "world cup",
  "euro",
  "copa",
  "nations league",
];

export function isContinentalCupLeagueId(leagueId: number): boolean {
  return leagueId === 2 || leagueId === 3 || leagueId === 848;
}

export function normalizeMatchCity(city: string | undefined): string {
  return city?.trim().toLowerCase() ?? "";
}

/** True when two venue/city labels refer to the same place (e.g. "Breda" vs "NAC Breda"). */
export function citiesMatch(a: string, b: string): boolean {
  const left = normalizeMatchCity(a);
  const right = normalizeMatchCity(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function isCupCompetition(bundle: FootballBundle): boolean {
  const leagueName = bundle.fixture.league.name.toLowerCase();
  return (
    CUP_LEAGUE_KEYWORDS.some((keyword) => leagueName.includes(keyword)) ||
    isContinentalCupLeagueId(bundle.fixture.league.id)
  );
}

/** True when the match is on neutral ground (compare mode or cup tie away from both homes). */
export function isNeutralVenue(
  mode: "fixture" | "compare" | undefined,
  bundle: FootballBundle
): boolean {
  if (mode === "compare") return true;

  if (!isCupCompetition(bundle)) return false;

  const venueCity = normalizeMatchCity(bundle.fixture.fixture.venue.city);
  const homeCity = normalizeMatchCity(bundle.homeTeamInfo.venue.city);
  const awayCity = normalizeMatchCity(bundle.awayTeamInfo.venue.city);

  if (venueCity && homeCity && citiesMatch(venueCity, homeCity)) return false;
  if (venueCity && awayCity && citiesMatch(venueCity, awayCity)) return false;

  return true;
}

/** High-stakes neutral cup ties (finals, knockouts) warrant draw inflation and caution xG. */
export function isHighStakesCupFinal(
  bundle: FootballBundle,
  neutral: boolean
): boolean {
  if (!neutral) return false;
  return isCupCompetition(bundle);
}

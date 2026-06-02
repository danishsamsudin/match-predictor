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

function normalizeCity(city: string | undefined): string {
  return city?.trim().toLowerCase() ?? "";
}

function citiesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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

  const venueCity = normalizeCity(bundle.fixture.fixture.venue.city);
  const homeCity = normalizeCity(bundle.homeTeamInfo.venue.city);
  const awayCity = normalizeCity(bundle.awayTeamInfo.venue.city);

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

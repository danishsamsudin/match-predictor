import { inferCityFromClubName, normalizeClubName } from "@/lib/data/infer-team-city";
import { getNationalTeamBaseCity } from "@/lib/data/national-team-geography";
import { TEAM_LOGO_ID_TO_NAME } from "@/lib/data/team-logo-manifest";
import { TEAM_CITY_BY_ID } from "@/lib/data/team-cities.generated";
import { getTeamHomeCityFromVenue } from "@/lib/data/team-home-venues";

/**
 * Home city for a club or national team (SofaScore / SportAPI ids).
 * Used for compare-mode venue advantage and travel-fatigue coordinates.
 */
export function getClubHomeCity(teamId: number, teamName?: string): string {
  const national = getNationalTeamBaseCity(teamId, teamName);
  if (national) return national;

  const fromGenerated = TEAM_CITY_BY_ID[teamId];
  if (fromGenerated) return fromGenerated;

  const fromVenue = getTeamHomeCityFromVenue(teamId, teamName);
  if (fromVenue) return fromVenue;

  const resolvedName = teamName?.trim() || TEAM_LOGO_ID_TO_NAME[teamId];
  if (resolvedName) {
    const inferred = inferCityFromClubName(resolvedName);
    if (inferred) return inferred;
  }

  return "";
}

export function getClubHomeCityNormalized(teamId: number, teamName?: string): string {
  return normalizeClubName(getClubHomeCity(teamId, teamName));
}

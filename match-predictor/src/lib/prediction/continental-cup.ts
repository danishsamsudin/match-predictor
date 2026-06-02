import { getTeamStatistics, parseTeamStats } from "@/lib/api/football";
import { resolveDomesticLeagueId } from "@/lib/data/football-reference";
import { isContinentalCupLeagueId } from "@/lib/prediction/neutral-venue";
import type { TeamStatistics } from "@/lib/types/football";
import type { TeamStatAverages } from "@/lib/types/prediction";

/** Weight given to continental-cup form when blending with domestic league stats. */
const CUP_FORM_WEIGHT = 0.35;

function blendAverages(
  domestic: TeamStatAverages,
  cup: TeamStatAverages,
  cupWeight: number
): TeamStatAverages {
  const domesticWeight = 1 - cupWeight;
  const blend = (a: number, b: number) => a * domesticWeight + b * cupWeight;
  return {
    goalsFor: blend(domestic.goalsFor, cup.goalsFor),
    goalsAgainst: blend(domestic.goalsAgainst, cup.goalsAgainst),
    corners: blend(domestic.corners, cup.corners),
    fouls: blend(domestic.fouls, cup.fouls),
    yellowCards: blend(domestic.yellowCards, cup.yellowCards),
    redCards: blend(domestic.redCards, cup.redCards),
    shotsOnTarget: blend(domestic.shotsOnTarget, cup.shotsOnTarget),
  };
}

export async function resolveTeamStatsForFixture(input: {
  teamId: number;
  stats: TeamStatistics;
  leagueId: number;
  season: number;
  isHomeSide: boolean;
  isNeutralVenue: boolean;
  domesticLeagueId?: number;
}): Promise<TeamStatAverages> {
  const { teamId, stats, leagueId, season, isHomeSide, isNeutralVenue, domesticLeagueId } = input;
  const useTotal = isNeutralVenue;

  if (!isContinentalCupLeagueId(leagueId)) {
    return parseTeamStats(stats, isHomeSide, { useTotal });
  }

  const domesticId = domesticLeagueId ?? resolveDomesticLeagueId(teamId);
  const cupParsed = parseTeamStats(stats, false, { useTotal: true });

  if (!domesticId) {
    return parseTeamStats(stats, isHomeSide, { useTotal });
  }

  try {
    const domesticStats = await getTeamStatistics(teamId, domesticId, season);
    const domesticParsed = parseTeamStats(domesticStats, false, { useTotal: true });
    return blendAverages(domesticParsed, cupParsed, CUP_FORM_WEIGHT);
  } catch {
    return parseTeamStats(stats, isHomeSide, { useTotal });
  }
}

export function resolveLeagueStrengthForTeam(input: {
  fixtureLeagueId: number;
  domesticLeagueId?: number;
  explicitLeagueId?: number;
}): number {
  const { fixtureLeagueId, domesticLeagueId, explicitLeagueId } = input;

  if (explicitLeagueId != null) {
    return explicitLeagueId;
  }

  if (isContinentalCupLeagueId(fixtureLeagueId) && domesticLeagueId != null) {
    return domesticLeagueId;
  }

  return fixtureLeagueId;
}

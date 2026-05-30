import type {
  BaseProbabilityInput,
  BaseProbabilityOutput,
  TeamStatAverages,
} from "@/lib/types/prediction";

export function computeBaseProbability(input: BaseProbabilityInput): BaseProbabilityOutput {
  const { homeFormScore, awayFormScore, h2hHomeWinRate, h2hDrawRate, h2hAwayWinRate } = input;

  const formDiff = homeFormScore - awayFormScore;
  const h2hStrength = h2hHomeWinRate - h2hAwayWinRate + h2hDrawRate * 0.3;
  const combinedStrength = formDiff * 0.6 + h2hStrength * 0.4;

  const homeXg = input.homeStats.goalsFor * (1 + combinedStrength * 0.15);
  const awayXg = input.awayStats.goalsFor * (1 - combinedStrength * 0.12);

  const corners =
    input.homeStats.corners + input.awayStats.corners;
  const fouls = input.homeStats.fouls + input.awayStats.fouls;
  const yellowCards =
    input.homeStats.yellowCards + input.awayStats.yellowCards;
  const redCards = input.homeStats.redCards + input.awayStats.redCards;

  return {
    homeXg: Math.max(0.3, homeXg),
    awayXg: Math.max(0.3, awayXg),
    corners,
    fouls,
    yellowCards,
    redCards,
  };
}

export function statsFromAverages(
  home: TeamStatAverages,
  away: TeamStatAverages
): BaseProbabilityOutput {
  return {
    homeXg: home.goalsFor,
    awayXg: away.goalsFor,
    corners: home.corners + away.corners,
    fouls: home.fouls + away.fouls,
    yellowCards: home.yellowCards + away.yellowCards,
    redCards: home.redCards + away.redCards,
  };
}

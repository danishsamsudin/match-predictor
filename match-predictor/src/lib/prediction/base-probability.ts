import type {
  BaseProbabilityInput,
  BaseProbabilityOutput,
  TeamStatAverages,
} from "@/lib/types/prediction";

/** Form weight w₁ in momentum index. */
const W1_FORM = 0.6;
/** H2H weight w₂ in momentum index. */
const W2_H2H = 0.4;
/** Home momentum damping γ_home. */
const GAMMA_HOME = 0.15;
/** Away momentum damping γ_away. */
const GAMMA_AWAY = 0.12;
/** League-average goals per team per match (μ). */
const LEAGUE_AVG_GOALS = 1.35;
/** Baseline total match xG for corner velocity scaling. */
const CORNER_XG_BASELINE = 2.7;

export function computeMomentumIndex(input: BaseProbabilityInput): number {
  const formDiff = input.homeFormScore - input.awayFormScore;
  const h2hStrength =
    input.h2hHomeWinRate -
    input.h2hAwayWinRate +
    input.h2hDrawRate * 0.3;
  return formDiff * W1_FORM + h2hStrength * W2_H2H;
}

/**
 * Structural baseline λ₀, μ₀ with league-normalized attack (α) and raw defense (β),
 * then momentum-adjusted tilde-xG (λ̃, μ̃).
 */
export function computeBaseProbability(input: BaseProbabilityInput): BaseProbabilityOutput {
  const { homeStats, awayStats } = input;

  const homeAttack = homeStats.goalsFor / LEAGUE_AVG_GOALS;
  const homeDefense = homeStats.goalsAgainst / LEAGUE_AVG_GOALS;
  const awayAttack = awayStats.goalsFor / LEAGUE_AVG_GOALS;
  const awayDefense = awayStats.goalsAgainst / LEAGUE_AVG_GOALS;

  const combinedStrength = computeMomentumIndex(input);

  const homeXg =
    homeAttack * awayDefense * LEAGUE_AVG_GOALS * (1 + GAMMA_HOME * combinedStrength);
  const awayXg =
    awayAttack * homeDefense * LEAGUE_AVG_GOALS * (1 - GAMMA_AWAY * combinedStrength);

  const totalMatchXg = homeXg + awayXg;

  const corners =
    (homeStats.corners + awayStats.corners) *
    Math.exp(0.02 * (totalMatchXg - CORNER_XG_BASELINE));
  const fouls = homeStats.fouls + awayStats.fouls;
  const yellowCards = homeStats.yellowCards + awayStats.yellowCards;
  const redCards = homeStats.redCards + awayStats.redCards;

  return {
    homeXg,
    awayXg,
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
  const lambda0 = home.goalsFor * away.goalsAgainst;
  const mu0 = away.goalsFor * home.goalsAgainst;

  return {
    homeXg: lambda0,
    awayXg: mu0,
    corners: home.corners + away.corners,
    fouls: home.fouls + away.fouls,
    yellowCards: home.yellowCards + away.yellowCards,
    redCards: home.redCards + away.redCards,
  };
}

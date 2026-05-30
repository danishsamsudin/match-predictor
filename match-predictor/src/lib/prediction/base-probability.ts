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
  const {
    homeStats,
    awayStats,
    homeLeagueStrength,
    awayLeagueStrength,
  } = input;

  const alphaHome = homeStats.goalsFor * homeLeagueStrength;
  const betaHome = homeStats.goalsAgainst;
  const alphaAway = awayStats.goalsFor * awayLeagueStrength;
  const betaAway = awayStats.goalsAgainst;

  const lambda0 = alphaHome * betaAway;
  const mu0 = alphaAway * betaHome;

  const indexMomentum = computeMomentumIndex(input);

  const homeXg = lambda0 * (1 + GAMMA_HOME * indexMomentum);
  const awayXg = mu0 * (1 - GAMMA_AWAY * indexMomentum);

  const corners = homeStats.corners + awayStats.corners;
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

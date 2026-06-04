import { computeMomentumIndex } from "@/lib/prediction/form-momentum";
import type {
  BaseProbabilityInput,
  BaseProbabilityOutput,
  TeamStatAverages,
} from "@/lib/types/prediction";

export { computeMomentumIndex };

/**
 * Dixon-Coles τ (ρ) is applied only in market-probabilities.ts to **final** λ after
 * lineup, weather, stadium, and cup adjustments — never inside momentum exponentials here.
 */

/** Home momentum damping γ_home (log-linear). */
const GAMMA_HOME = 0.15;
/** Away momentum damping γ_away. */
const GAMMA_AWAY = 0.13;
/** Fallback μ when caller omits leagueAvgGoals. */
export const GLOBAL_LEAGUE_AVG_GOALS = 1.35;
/** Baseline total match xG for corner velocity scaling. */
const CORNER_XG_BASELINE = 2.7;

/**
 * Structural baseline λ with league-normalized attack (α) and defense (β),
 * then log-linear momentum-adjusted xG.
 */
export function computeBaseProbability(input: BaseProbabilityInput): BaseProbabilityOutput {
  const { homeStats, awayStats, isNeutralVenue = false } = input;
  const mu = input.leagueAvgGoals ?? GLOBAL_LEAGUE_AVG_GOALS;

  const homeAttack = homeStats.goalsFor / mu;
  const homeDefense = homeStats.goalsAgainst / mu;
  const awayAttack = awayStats.goalsFor / mu;
  const awayDefense = awayStats.goalsAgainst / mu;

  const combinedStrength = computeMomentumIndex(input);

  const gammaHome = isNeutralVenue ? 0 : GAMMA_HOME;
  const gammaAway = isNeutralVenue ? 0 : GAMMA_AWAY;

  const homeXg =
    homeAttack * awayDefense * mu * Math.exp(gammaHome * combinedStrength);
  const awayXg =
    awayAttack * homeDefense * mu * Math.exp(-gammaAway * combinedStrength);

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
  const mu = GLOBAL_LEAGUE_AVG_GOALS;
  const homeXg = (home.goalsFor / mu) * (away.goalsAgainst / mu) * mu;
  const awayXg = (away.goalsFor / mu) * (home.goalsAgainst / mu) * mu;
  return {
    homeXg,
    awayXg,
    corners: home.corners + away.corners,
    fouls: home.fouls + away.fouls,
    yellowCards: home.yellowCards + away.yellowCards,
    redCards: home.redCards + away.redCards,
  };
}

import {
  buildScoreMatrix,
  computeOutcomeProbabilities,
  resolveScoreMatrixMaxGoals,
} from "@/lib/prediction/market-probabilities";

const TAU_MIN = 0.01;

/** xG gap below which full Dixon-Coles draw inflation applies. */
export const RHO_GAP_ATTENUATION_START = 0.35;
/** xG gap span over which ρ linearly decays to zero. */
export const RHO_GAP_ATTENUATION_SPAN = 1.0;

/** Dixon-Coles ρ fades toward 0 when expected goal gap widens (mismatched internationals). */
export function attenuateRhoForExpectedGoalGap(
  rho: number,
  homeXg: number,
  awayXg: number
): number {
  const xgDiff = Math.abs(homeXg - awayXg);
  if (xgDiff <= RHO_GAP_ATTENUATION_START) return rho;
  const attenuation = Math.max(
    0,
    1 - (xgDiff - RHO_GAP_ATTENUATION_START) / RHO_GAP_ATTENUATION_SPAN
  );
  return rho * attenuation;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** Dixon-Coles τ with optional mutual-draw strategic inflation (clamped). */
export function strategicDixonColesTau(
  homeGoals: number,
  awayGoals: number,
  homeXg: number,
  awayXg: number,
  rho: number,
  mutualDrawBenefit: boolean
): number {
  let tau = 1;
  if (homeGoals === 0 && awayGoals === 0) tau = 1 - homeXg * awayXg * rho;
  else if (homeGoals === 0 && awayGoals === 1) tau = 1 + homeXg * rho;
  else if (homeGoals === 1 && awayGoals === 0) tau = 1 + awayXg * rho;
  else if (homeGoals === 1 && awayGoals === 1) tau = 1 - rho;

  if (mutualDrawBenefit) {
    const alphaAdjustment = -0.15;
    if (homeGoals === 0 && awayGoals === 0) tau = 1 - homeXg * awayXg * alphaAdjustment;
    else if (homeGoals === 1 && awayGoals === 0) tau = 1 + awayXg * alphaAdjustment;
    else if (homeGoals === 0 && awayGoals === 1) tau = 1 + homeXg * alphaAdjustment;
    else if (homeGoals === 1 && awayGoals === 1) tau = 1 - alphaAdjustment;
  }

  return Math.max(TAU_MIN, tau);
}

export function buildGuardedScoreMatrix(
  homeXg: number,
  awayXg: number,
  rho: number,
  mutualDrawBenefit: boolean
) {
  const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
  const cells: { home: number; away: number; probability: number }[] = [];

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const tau = strategicDixonColesTau(h, a, homeXg, awayXg, rho, mutualDrawBenefit);
      const base = poissonPmf(h, homeXg) * poissonPmf(a, awayXg);
      const p = Math.max(0, base * tau);
      cells.push({ home: h, away: a, probability: p });
    }
  }

  let total = cells.reduce((s, c) => s + c.probability, 0);
  let renormalized = false;
  if (total <= 0 || !Number.isFinite(total)) {
    const fallback = buildScoreMatrix(homeXg, awayXg, maxGoals, { correlation: rho });
    return {
      cells: fallback.map((c) => ({
        home: c.home,
        away: c.away,
        probability: c.probability,
      })),
      renormalized: true,
      maxGoals,
    };
  }

  const hasNegative = cells.some((c) => c.probability < 0);
  if (Math.abs(total - 1) > 0.02 || hasNegative) renormalized = true;

  return {
    cells: cells.map((c) => ({ ...c, probability: c.probability / total })),
    renormalized,
    maxGoals,
  };
}

export function selectPredictedScoreline(
  homeXg: number,
  awayXg: number,
  cells: { home: number; away: number; probability: number }[]
): { home: number; away: number } {
  let roundedHome = Math.max(0, Math.round(homeXg));
  let roundedAway = Math.max(0, Math.round(awayXg));
  const underdogLambda = Math.min(homeXg, awayXg);
  const favoriteIsHome = homeXg >= awayXg;

  if (underdogLambda >= 0.55) {
    if (favoriteIsHome && roundedAway === 0) roundedAway = 1;
    if (!favoriteIsHome && roundedHome === 0) roundedHome = 1;
  }

  const roundedCell = cells.find((c) => c.home === roundedHome && c.away === roundedAway);
  if (roundedCell && roundedCell.probability > 0) {
    return { home: roundedHome, away: roundedAway };
  }

  let top = cells[0] ?? { home: roundedHome, away: roundedAway, probability: 0 };
  for (const c of cells) {
    if (c.probability > top.probability) top = c;
  }
  return { home: top.home, away: top.away };
}

export function topScorelinesFromCells(
  cells: { home: number; away: number; probability: number }[],
  limit = 5
): { home: number; away: number; probability: number }[] {
  return [...cells]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit)
    .map((c) => ({
      home: c.home,
      away: c.away,
      probability: Math.round(c.probability * 10000) / 10000,
    }));
}

export function outcomesFromGuardedGrid(
  homeXg: number,
  awayXg: number,
  rho: number,
  mutualDrawBenefit: boolean
) {
  const { cells } = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDrawBenefit);
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let under25 = 0;

  for (const c of cells) {
    if (c.home > c.away) homeWin += c.probability;
    else if (c.home === c.away) draw += c.probability;
    else awayWin += c.probability;
    if (c.home + c.away < 2.5) under25 += c.probability;
  }

  const total = homeWin + draw + awayWin || 1;
  const predicted = selectPredictedScoreline(homeXg, awayXg, cells);

  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
    under25,
    over25: 1 - under25,
    predictedHome: predicted.home,
    predictedAway: predicted.away,
    topScorelines: topScorelinesFromCells(cells),
  };
}

export function baselineOutcomeProbs(homeXg: number, awayXg: number) {
  return computeOutcomeProbabilities(homeXg, awayXg, 8, { correlation: -0.12 });
}

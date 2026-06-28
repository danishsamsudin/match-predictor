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

export interface ScoreGridOptions {
  /** NB dispersion k (0 = Poisson). */
  goalOverdispersionK?: number;
  /** Base in-match red-card probability before discipline load. */
  redCardMatchBaseProb?: number;
  /** Multiplier on home discipline load for red-card mixture. */
  homeDisciplineLoad?: number;
  /** Multiplier on away discipline load for red-card mixture. */
  awayDisciplineLoad?: number;
  redCardAttackPenalty?: number;
  redCardOpponentBoost?: number;
}

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

function logCombination(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  let sum = 0;
  for (let i = 1; i <= k; i += 1) {
    sum += Math.log(n - k + i) - Math.log(i);
  }
  return sum;
}

/** Negative binomial PMF with mean λ and dispersion k (variance = λ + λ²/k). */
export function goalMarginalPmf(k: number, lambda: number, kDisp: number): number {
  if (kDisp <= 0 || !Number.isFinite(kDisp)) {
    return poissonPmf(k, lambda);
  }
  const r = Math.max(kDisp, 1e-6);
  const safeLambda = Math.max(lambda, 1e-9);
  const p = r / (r + safeLambda);
  const logPmf =
    logCombination(k + r - 1, k) + r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(logPmf);
}

export function resolveEffectiveOverdispersionK(
  homeXg: number,
  awayXg: number,
  baseK: number,
  homeChanceIndex?: number,
  awayChanceIndex?: number
): number {
  let k = Math.max(0, baseK);
  const total = homeXg + awayXg;
  if (
    total >= 2.8 &&
    (homeChanceIndex ?? 0) >= 1.3 &&
    (awayChanceIndex ?? 0) >= 1.3
  ) {
    k = Math.max(k, 0.08);
  }
  return k;
}

export function resolveRedCardMatchProb(options: ScoreGridOptions): number {
  const base = options.redCardMatchBaseProb ?? 0;
  if (base <= 0) return 0;
  const homeLoad = options.homeDisciplineLoad ?? 0;
  const awayLoad = options.awayDisciplineLoad ?? 0;
  const load = (homeLoad + awayLoad) / 2;
  return Math.min(0.14, base * (1 + load * 0.35));
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

function buildRawGuardedCells(
  homeXg: number,
  awayXg: number,
  rho: number,
  mutualDrawBenefit: boolean,
  maxGoals: number,
  kDisp: number
): { home: number; away: number; probability: number }[] {
  const cells: { home: number; away: number; probability: number }[] = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const tau = strategicDixonColesTau(h, a, homeXg, awayXg, rho, mutualDrawBenefit);
      const base =
        goalMarginalPmf(h, homeXg, kDisp) * goalMarginalPmf(a, awayXg, kDisp);
      const p = Math.max(0, base * tau);
      cells.push({ home: h, away: a, probability: p });
    }
  }
  return cells;
}

function normalizeCells(
  cells: { home: number; away: number; probability: number }[],
  homeXg: number,
  awayXg: number,
  maxGoals: number,
  rho: number
): { cells: { home: number; away: number; probability: number }[]; renormalized: boolean } {
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
    };
  }
  const hasNegative = cells.some((c) => c.probability < 0);
  if (Math.abs(total - 1) > 0.02 || hasNegative) renormalized = true;
  return {
    cells: cells.map((c) => ({ ...c, probability: c.probability / total })),
    renormalized,
  };
}

export function buildGuardedScoreMatrix(
  homeXg: number,
  awayXg: number,
  rho: number,
  mutualDrawBenefit: boolean,
  gridOptions: ScoreGridOptions = {}
) {
  const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
  const kDisp = gridOptions.goalOverdispersionK ?? 0;
  const raw = buildRawGuardedCells(
    homeXg,
    awayXg,
    rho,
    mutualDrawBenefit,
    maxGoals,
    kDisp
  );
  const { cells, renormalized } = normalizeCells(raw, homeXg, awayXg, maxGoals, rho);
  return { cells, renormalized, maxGoals };
}

function blendCellGrids(
  grids: Array<{ weight: number; cells: { home: number; away: number; probability: number }[] }>
): { home: number; away: number; probability: number }[] {
  const map = new Map<string, number>();
  for (const grid of grids) {
    for (const cell of grid.cells) {
      const key = `${cell.home}:${cell.away}`;
      map.set(key, (map.get(key) ?? 0) + grid.weight * cell.probability);
    }
  }
  return [...map.entries()].map(([key, probability]) => {
    const [home, away] = key.split(":").map(Number);
    return { home, away, probability };
  });
}

export function buildGuardedScoreMatrixWithMixture(
  homeXg: number,
  awayXg: number,
  rho: number,
  mutualDrawBenefit: boolean,
  gridOptions: ScoreGridOptions = {}
) {
  const kDisp = gridOptions.goalOverdispersionK ?? 0;
  const maxGoals = resolveScoreMatrixMaxGoals(
    Math.max(homeXg, awayXg * (gridOptions.redCardOpponentBoost ?? 1)),
    Math.max(awayXg, homeXg * (gridOptions.redCardOpponentBoost ?? 1))
  );
  const pRed = resolveRedCardMatchProb(gridOptions);
  const attackPenalty = gridOptions.redCardAttackPenalty ?? 0.72;
  const opponentBoost = gridOptions.redCardOpponentBoost ?? 1.18;

  if (pRed <= 1e-6) {
    const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDrawBenefit, gridOptions);
    return { ...grid, pRedMatch: 0 };
  }

  const normal = buildRawGuardedCells(
    homeXg,
    awayXg,
    rho,
    mutualDrawBenefit,
    maxGoals,
    kDisp
  );
  const homeRed = buildRawGuardedCells(
    homeXg * attackPenalty,
    awayXg * opponentBoost,
    rho,
    mutualDrawBenefit,
    maxGoals,
    kDisp
  );
  const awayRed = buildRawGuardedCells(
    homeXg * opponentBoost,
    awayXg * attackPenalty,
    rho,
    mutualDrawBenefit,
    maxGoals,
    kDisp
  );

  const blended = blendCellGrids([
    { weight: 1 - pRed, cells: normal },
    { weight: pRed / 2, cells: homeRed },
    { weight: pRed / 2, cells: awayRed },
  ]);
  const { cells, renormalized } = normalizeCells(blended, homeXg, awayXg, maxGoals, rho);
  return { cells, renormalized, maxGoals, pRedMatch: pRed };
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
  mutualDrawBenefit: boolean,
  gridOptions: ScoreGridOptions = {}
) {
  const { cells, pRedMatch } = buildGuardedScoreMatrixWithMixture(
    homeXg,
    awayXg,
    rho,
    mutualDrawBenefit,
    gridOptions
  );
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
    pRedMatch: pRedMatch ?? 0,
  };
}

export function baselineOutcomeProbs(homeXg: number, awayXg: number) {
  return computeOutcomeProbabilities(homeXg, awayXg, 8, { correlation: -0.12 });
}

export function probabilityTotalGoalsAtLeast(
  cells: { home: number; away: number; probability: number }[],
  threshold: number
): number {
  let sum = 0;
  for (const cell of cells) {
    if (cell.home + cell.away >= threshold) sum += cell.probability;
  }
  return sum;
}

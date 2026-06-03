/** Poisson-based score grid and common betting market probabilities. */

import type { OverUnderLine, PredictionAnalytics, ScoreCell } from "@/lib/types/prediction";

export type { PredictionAnalytics, ScoreCell };

export interface OutcomeProbabilityOptions {
  /** Dixon-Coles correlation ρ; negative inflates draws, positive deflates 0-0 / 1-1. */
  correlation?: number;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** Dixon-Coles adjustment τ for low-score correlation (ρ typically −0.1 to −0.2). */
function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  homeXg: number,
  awayXg: number,
  rho: number
): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - homeXg * awayXg * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + homeXg * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + awayXg * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

function scoreProbability(
  homeGoals: number,
  awayGoals: number,
  homeXg: number,
  awayXg: number,
  rho = 0
): number {
  const base = poissonPmf(homeGoals, homeXg) * poissonPmf(awayGoals, awayXg);
  if (rho === 0) return base;
  return base * dixonColesTau(homeGoals, awayGoals, homeXg, awayXg, rho);
}

export function buildScoreMatrix(
  homeXg: number,
  awayXg: number,
  maxGoals = 6,
  options?: OutcomeProbabilityOptions
): ScoreCell[] {
  const rho = options?.correlation ?? 0;
  const cells: ScoreCell[] = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      cells.push({
        home: h,
        away: a,
        probability: scoreProbability(h, a, homeXg, awayXg, rho),
      });
    }
  }
  const total = cells.reduce((s, c) => s + c.probability, 0) || 1;
  return cells.map((c) => ({ ...c, probability: c.probability / total }));
}

export function computeOutcomeProbabilities(
  homeXg: number,
  awayXg: number,
  maxGoals = 8,
  options?: OutcomeProbabilityOptions
): { homeWin: number; draw: number; awayWin: number } {
  const rho = options?.correlation ?? 0;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = scoreProbability(h, a, homeXg, awayXg, rho);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const total = homeWin + draw + awayWin || 1;
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}

/** ρ for high-stakes low-scoring cup ties; more negative ⇒ higher draw mass. */
export function resolveCupFinalCorrelation(
  homeXg: number,
  awayXg: number,
  isHighStakesCup: boolean
): number {
  if (!isHighStakesCup) return 0;
  const totalXg = homeXg + awayXg;
  if (totalXg >= 3.2) return -0.08;
  if (totalXg >= 2.6) return -0.12;
  return -0.18;
}

/**
 * Grid size for Poisson score matrices. Truncating too low renormalizes mass into
 * low-score draws; size scales with expected goals.
 */
export function resolveScoreMatrixMaxGoals(homeXg: number, awayXg: number): number {
  const peak = Math.max(homeXg, awayXg);
  return Math.min(10, Math.max(5, Math.ceil(peak + 3)));
}

/**
 * Dixon-Coles ρ for score heatmaps / correct-score markets. Cup finals use negative ρ;
 * lopsided league/compare ties use mild positive ρ to avoid overstated 0-0 / 1-1 cells.
 */
export function resolveScoreMatrixCorrelation(
  homeXg: number,
  awayXg: number,
  isHighStakesCup: boolean
): number {
  if (isHighStakesCup) {
    return resolveCupFinalCorrelation(homeXg, awayXg, true);
  }
  const diff = Math.abs(homeXg - awayXg);
  if (diff >= 1.25) return 0.1;
  if (diff >= 0.75) return 0.06;
  return 0;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeMarketAnalytics(
  homeXg: number,
  awayXg: number,
  opts: {
    h2hHomeWinRate: number;
    h2hDrawRate: number;
    h2hAwayWinRate: number;
    homeFormScore: number;
    awayFormScore: number;
    momentumIndex: number;
    modelImpact: PredictionAnalytics["modelImpact"];
    statComparison: PredictionAnalytics["statComparison"];
    heatmapMaxGoals?: number;
    correlation?: number;
  }
): PredictionAnalytics {
  const scoreOptions = { correlation: opts.correlation ?? 0 };
  const maxGoals =
    opts.heatmapMaxGoals ?? resolveScoreMatrixMaxGoals(homeXg, awayXg);
  const matrix = buildScoreMatrix(homeXg, awayXg, maxGoals, scoreOptions);
  const topScores = [...matrix]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8)
    .map((c) => ({ ...c, probability: c.probability }));

  let bttsYes = 0;
  let bttsNo = 0;
  const totalGoalsMap = new Map<number, number>();

  for (const cell of matrix) {
    const homeScored = cell.home > 0;
    const awayScored = cell.away > 0;
    if (homeScored && awayScored) bttsYes += cell.probability;
    else bttsNo += cell.probability;

    const total = cell.home + cell.away;
    totalGoalsMap.set(total, (totalGoalsMap.get(total) ?? 0) + cell.probability);
  }

  const overUnderLines = [1.5, 2.5, 3.5];
  const overUnder: OverUnderLine[] = overUnderLines.map((line) => {
    let over = 0;
    for (const cell of matrix) {
      if (cell.home + cell.away > line) over += cell.probability;
    }
    return {
      line,
      overPct: roundPct(over * 100),
      underPct: roundPct((1 - over) * 100),
    };
  });

  const totalGoalsDistribution = Array.from(totalGoalsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([goals, probability]) => ({
      goals,
      probability: roundPct(probability * 100),
    }));

  const h2hTotal =
    opts.h2hHomeWinRate + opts.h2hDrawRate + opts.h2hAwayWinRate || 1;

  return {
    topScores: topScores.map((c) => ({
      ...c,
      probability: roundPct(c.probability * 100),
    })),
    scoreHeatmap: matrix.map((c) => ({
      ...c,
      probability: roundPct(c.probability * 100),
    })),
    overUnder,
    btts: {
      yesPct: roundPct(bttsYes * 100),
      noPct: roundPct(bttsNo * 100),
    },
    totalGoalsDistribution,
    h2h: {
      homeWinPct: roundPct((opts.h2hHomeWinRate / h2hTotal) * 100),
      drawPct: roundPct((opts.h2hDrawRate / h2hTotal) * 100),
      awayWinPct: roundPct((opts.h2hAwayWinRate / h2hTotal) * 100),
    },
    formScores: {
      homePct: roundPct(opts.homeFormScore * 100),
      awayPct: roundPct(opts.awayFormScore * 100),
    },
    momentumIndex: Math.round(opts.momentumIndex * 1000) / 1000,
    modelImpact: opts.modelImpact,
    statComparison: opts.statComparison,
  };
}

export function parseSeasonStat(value: string | null | undefined): number | null {
  if (!value || value === "N/A") return null;
  const n = parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

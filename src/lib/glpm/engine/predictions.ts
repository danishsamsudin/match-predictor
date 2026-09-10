/**
 * GLPM Match Prediction Models (Chapter 12) — TypeScript port.
 */

import type { XgEngineResult } from "./types";

export const PRED_MODEL_VERSION = "glpm_pred_v1";
export const DEFAULT_RHO = -0.13;
export const DEFAULT_MAX_GOALS = 9;
export const DEFAULT_OU_LINES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;

/** Dixon–Coles ρ fades toward 0 as |λH−λA| grows. */
export const RHO_GAP_ATTENUATION_START = 0.35;
export const RHO_GAP_ATTENUATION_SPAN = 1.0;
export const RHO_GAP_POSITIVE_MID = 0.06;
export const RHO_GAP_POSITIVE_WIDE = 0.1;
export const RHO_GAP_POSITIVE_MID_START = 0.75;
export const RHO_GAP_POSITIVE_WIDE_START = 1.25;

export type PredictionConfig = {
  rho: number;
  maxGoals: number;
  ouLines: readonly number[];
  modelVersion: string;
  /** NB dispersion k (0 = Poisson). */
  goalOverdispersionK: number;
  attenuateRhoForGap: boolean;
  gapPositiveRho: boolean;
};

export function defaultPredictionConfig(
  overrides: Partial<PredictionConfig> = {}
): PredictionConfig {
  return {
    rho: DEFAULT_RHO,
    maxGoals: DEFAULT_MAX_GOALS,
    ouLines: DEFAULT_OU_LINES,
    modelVersion: PRED_MODEL_VERSION,
    goalOverdispersionK: 0,
    attenuateRhoForGap: true,
    gapPositiveRho: true,
    ...overrides,
  };
}

export type OverUnderLine = { over: number; under: number };

export type GlpmPredictionResult = {
  homeXg: number;
  awayXg: number;
  scoreMatrix: number[][];
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  overUnder: Record<string, OverUnderLine>;
  rho: number;
  effectiveRho: number;
  goalOverdispersionK: number;
  modelVersion: string;
  executedAt: string;
};

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonPmf(k: number, lam: number): number {
  if (lam < 0) throw new Error(`lambda must be non-negative, got ${lam}`);
  if (k < 0) return 0;
  if (lam === 0) return k === 0 ? 1 : 0;
  return Math.exp(-lam) * lam ** k / factorial(k);
}

function logCombination(n: number, k: number): number {
  if (k < 0) return -Infinity;
  if (k === 0) return 0;
  let sum = 0;
  for (let i = 0; i < k; i += 1) {
    sum += Math.log(n - i) - Math.log(i + 1);
  }
  return sum;
}

/** Negative binomial PMF with mean λ and dispersion k (variance = λ + λ²/k). */
export function goalMarginalPmf(k: number, lambda: number, kDisp = 0): number {
  if (k < 0) return 0;
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

export function resolveEffectiveRho(
  baseRho: number,
  homeXg: number,
  awayXg: number,
  opts: { attenuateForGap?: boolean; gapPositiveRho?: boolean } = {}
): number {
  const attenuate = opts.attenuateForGap !== false;
  const gapPositive = opts.gapPositiveRho !== false;
  let rho = attenuate
    ? attenuateRhoForExpectedGoalGap(baseRho, homeXg, awayXg)
    : baseRho;
  if (gapPositive) {
    const diff = Math.abs(homeXg - awayXg);
    if (diff >= RHO_GAP_POSITIVE_WIDE_START) rho = Math.max(rho, RHO_GAP_POSITIVE_WIDE);
    else if (diff >= RHO_GAP_POSITIVE_MID_START) rho = Math.max(rho, RHO_GAP_POSITIVE_MID);
  }
  return rho;
}

export function dixonColesTau(
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

export function scoreProbability(
  homeGoals: number,
  awayGoals: number,
  homeXg: number,
  awayXg: number,
  rho = 0,
  goalOverdispersionK = 0
): number {
  const base =
    goalMarginalPmf(homeGoals, homeXg, goalOverdispersionK) *
    goalMarginalPmf(awayGoals, awayXg, goalOverdispersionK);
  if (rho === 0) return base;
  return base * dixonColesTau(homeGoals, awayGoals, homeXg, awayXg, rho);
}

export function buildScoreMatrix(
  homeXg: number,
  awayXg: number,
  opts: {
    maxGoals?: number;
    rho?: number;
    goalOverdispersionK?: number;
    attenuateRhoForGap?: boolean;
    gapPositiveRho?: boolean;
    applyEffectiveRho?: boolean;
  } = {}
): number[][] {
  const maxGoals = opts.maxGoals ?? DEFAULT_MAX_GOALS;
  const baseRho = opts.rho ?? DEFAULT_RHO;
  const kDisp = opts.goalOverdispersionK ?? 0;
  const applyEffective = opts.applyEffectiveRho !== false;
  const rho = applyEffective
    ? resolveEffectiveRho(baseRho, homeXg, awayXg, {
        attenuateForGap: opts.attenuateRhoForGap !== false,
        gapPositiveRho: opts.gapPositiveRho !== false,
      })
    : baseRho;
  if (maxGoals < 0) throw new Error(`max_goals must be >= 0, got ${maxGoals}`);
  const n = maxGoals + 1;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  let total = 0;
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      const p = scoreProbability(h, a, homeXg, awayXg, rho, kDisp);
      matrix[h][a] = p;
      total += p;
    }
  }
  if (total <= 0) throw new Error("score matrix has zero total probability mass");
  return matrix.map((row) => row.map((p) => p / total));
}

export function derive1x2(
  scoreMatrix: number[][]
): { homeWin: number; draw: number; awayWin: number } {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (let h = 0; h < scoreMatrix.length; h++) {
    for (let a = 0; a < scoreMatrix[h].length; a++) {
      const p = scoreMatrix[h][a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }
  const total = homeWin + draw + awayWin;
  if (total <= 0) return { homeWin: 0, draw: 0, awayWin: 0 };
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}

export function deriveOverUnder(
  scoreMatrix: number[][],
  lines: readonly number[] = DEFAULT_OU_LINES
): Record<string, OverUnderLine> {
  const result: Record<string, OverUnderLine> = {};
  for (const line of lines) {
    let over = 0;
    for (let h = 0; h < scoreMatrix.length; h++) {
      for (let a = 0; a < scoreMatrix[h].length; a++) {
        if (h + a > line) over += scoreMatrix[h][a];
      }
    }
    result[String(line)] = { over, under: 1 - over };
  }
  return result;
}

export function deriveBtts(scoreMatrix: number[][]): { yes: number; no: number } {
  let yes = 0;
  for (let h = 0; h < scoreMatrix.length; h++) {
    for (let a = 0; a < scoreMatrix[h].length; a++) {
      if (h > 0 && a > 0) yes += scoreMatrix[h][a];
    }
  }
  return { yes, no: 1 - yes };
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function predictMatch(
  homeXg: number | XgEngineResult,
  awayXg?: number,
  config?: Partial<PredictionConfig>,
  executedAt?: string
): GlpmPredictionResult {
  const cfg = defaultPredictionConfig(config);

  let hx: number;
  let ax: number;
  if (typeof homeXg === "object" && homeXg != null && "homeXg" in homeXg) {
    hx = homeXg.homeXg;
    ax = homeXg.awayXg;
  } else if (awayXg == null) {
    throw new Error("awayXg is required unless homeXg is an XgEngineResult");
  } else {
    hx = Number(homeXg);
    ax = Number(awayXg);
  }

  if (hx < 0 || ax < 0) {
    throw new Error(`expected goals must be non-negative, got home=${hx}, away=${ax}`);
  }

  const effectiveRho = resolveEffectiveRho(cfg.rho, hx, ax, {
    attenuateForGap: cfg.attenuateRhoForGap,
    gapPositiveRho: cfg.gapPositiveRho,
  });
  const matrix = buildScoreMatrix(hx, ax, {
    maxGoals: cfg.maxGoals,
    rho: effectiveRho,
    goalOverdispersionK: cfg.goalOverdispersionK,
    applyEffectiveRho: false,
  });
  const { homeWin, draw, awayWin } = derive1x2(matrix);
  const btts = deriveBtts(matrix);
  const overUnder = deriveOverUnder(matrix, cfg.ouLines);

  return {
    homeXg: hx,
    awayXg: ax,
    scoreMatrix: matrix,
    homeWin,
    draw,
    awayWin,
    bttsYes: btts.yes,
    bttsNo: btts.no,
    overUnder,
    rho: cfg.rho,
    effectiveRho,
    goalOverdispersionK: cfg.goalOverdispersionK,
    modelVersion: cfg.modelVersion,
    executedAt: executedAt ?? nowIso(),
  };
}

export function toPredictionHistoryRow(
  result: GlpmPredictionResult,
  ids: {
    matchSmId?: number | null;
    homeTeamSmId?: number | null;
    awayTeamSmId?: number | null;
    seasonId?: number | null;
  } = {}
) {
  return {
    match_sm_id: ids.matchSmId ?? null,
    home_team_sm_id: ids.homeTeamSmId ?? null,
    away_team_sm_id: ids.awayTeamSmId ?? null,
    season_id: ids.seasonId ?? null,
    home_xg: Math.round(result.homeXg * 10000) / 10000,
    away_xg: Math.round(result.awayXg * 10000) / 10000,
    home_win_pct: result.homeWin,
    draw_pct: result.draw,
    away_win_pct: result.awayWin,
    btts_yes_pct: result.bttsYes,
    btts_no_pct: result.bttsNo,
    over_under: result.overUnder,
    score_matrix: result.scoreMatrix,
    rho: result.effectiveRho,
    model_version: result.modelVersion,
    executed_at: result.executedAt,
  };
}

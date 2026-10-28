/**
 * GLPM club market-model calibration (port of WC/NL logistic stacks).
 * Applied to BTTS / O/U / team totals before published fair odds.
 */

import { calibrateMarketModelsFromEvaluations } from "@/lib/world-cup/market-models/calibrate";
import {
  getDefaultMarketModelsConfig,
  mergeMarketModelsConfig,
} from "@/lib/world-cup/market-models/defaults";
import type {
  LogisticStackCoeffs,
  MarketEvaluationRow,
  MarketModelId,
  MarketModelsConfig,
} from "@/lib/world-cup/market-models/types";
import type { GlpmCalibrationConstants } from "@/lib/glpm/glpm-calibration-config";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Apply calibrated intercept / blend as a logit nudge (GLPM binary markets). */
function applyInterceptStack(rawProb: number, coeffs: LogisticStackCoeffs): number {
  const p = Math.min(0.98, Math.max(0.02, rawProb));
  const logit = Math.log(p / (1 - p)) + coeffs.intercept * coeffs.mlBlend;
  return Math.min(0.98, Math.max(0.02, sigmoid(logit)));
}

export const GLPM_MARKET_MODELS_VERSION = "glpm_market_models_v1";

export type GlpmSharpShrinkConfig = {
  /** Blend weight toward sharp fair prob (0 = off). */
  alphaByMarket: Record<string, number>;
  updatedAt: string;
  nSnapshots: number;
};

/** Defaults used when no Pinnacle archive is available yet. */
export const DEFAULT_SHARP_ALPHAS: Record<string, number> = {
  btts: 0.2,
  ou: 0.2,
  "ou-2.5": 0.2,
  "ou-3.5": 0.2,
  "1x2": 0.15,
  ah: 0.25,
  eh: 0.25,
  dc: 0.2,
  asian_handicap: 0.25,
  european_handicap: 0.25,
  double_chance: 0.2,
};

export const EMPTY_SHARP_SHRINK: GlpmSharpShrinkConfig = {
  alphaByMarket: { ...DEFAULT_SHARP_ALPHAS },
  updatedAt: "",
  nSnapshots: 0,
};

export type GlpmCalibrationWithMarkets = GlpmCalibrationConstants & {
  marketModels?: MarketModelsConfig;
  sharpShrink?: GlpmSharpShrinkConfig;
};

export function resolveGlpmMarketModels(
  calibration: GlpmCalibrationWithMarkets | null | undefined
): MarketModelsConfig {
  return mergeMarketModelsConfig(calibration?.marketModels);
}

export function resolveGlpmSharpShrink(
  calibration: GlpmCalibrationWithMarkets | null | undefined
): GlpmSharpShrinkConfig {
  const raw = calibration?.sharpShrink;
  if (!raw || typeof raw !== "object") {
    return {
      alphaByMarket: { ...DEFAULT_SHARP_ALPHAS },
      updatedAt: "",
      nSnapshots: 0,
    };
  }
  return {
    alphaByMarket: {
      ...DEFAULT_SHARP_ALPHAS,
      ...(raw.alphaByMarket ?? {}),
    },
    updatedAt: String(raw.updatedAt ?? ""),
    nSnapshots: Number(raw.nSnapshots ?? 0) || 0,
  };
}

/** Apply logistic stack to a raw probability in 0-1. */
export function calibrateBinaryProb(
  rawProb: number,
  coeffs: LogisticStackCoeffs | undefined
): number {
  if (!coeffs) return Math.max(0, Math.min(1, rawProb));
  return applyInterceptStack(rawProb, coeffs);
}

/**
 * BTTS feature-aware correction: shrink toward market base when λs are balanced
 * (classic independence overstatement) by damping yes-prob via abs-gap feature.
 */
export function calibrateBttsYes(input: {
  rawYes: number;
  homeXg: number;
  awayXg: number;
  coeffs?: LogisticStackCoeffs;
}): number {
  const gap = Math.abs(input.homeXg - input.awayXg);
  const balanceDamp = gap < 0.35 ? 0.92 : gap < 0.75 ? 0.96 : 1;
  const adjusted = Math.max(0.02, Math.min(0.98, input.rawYes * balanceDamp));
  return calibrateBinaryProb(adjusted, input.coeffs);
}

export function calibrateOverProb(input: {
  rawOver: number;
  coeffs?: LogisticStackCoeffs;
}): number {
  return calibrateBinaryProb(input.rawOver, input.coeffs);
}

/** Blend model fair p with sharp book fair p. */
export function applySharpShrink(
  modelProb: number,
  sharpFairProb: number | null | undefined,
  alpha: number
): number {
  if (sharpFairProb == null || !Number.isFinite(sharpFairProb) || alpha <= 0) {
    return modelProb;
  }
  const a = Math.max(0, Math.min(0.5, alpha));
  return (1 - a) * modelProb + a * sharpFairProb;
}

/** Implied probability from decimal odds (includes book vig; conservative fair proxy). */
export function fairProbFromDecimalOdds(
  decimalOdds: number | null | undefined
): number | null {
  if (decimalOdds == null || !Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return null;
  }
  return Math.max(0.01, Math.min(0.99, 1 / decimalOdds));
}

/**
 * Soften 1X2 favorites (τ > 1) via power tempering, matching WC/NL.
 * DC should be recomputed from the tempered triple.
 */
export function temper1x2Probs(
  homeWin: number,
  draw: number,
  awayWin: number,
  tau = 1
): { homeWin: number; draw: number; awayWin: number } {
  const t = Number.isFinite(tau) && tau > 0 ? tau : 1;
  if (Math.abs(t - 1) < 1e-9) {
    const sum = homeWin + draw + awayWin || 1;
    return {
      homeWin: homeWin / sum,
      draw: draw / sum,
      awayWin: awayWin / sum,
    };
  }
  const h = Math.pow(Math.max(1e-9, homeWin), t);
  const d = Math.pow(Math.max(1e-9, draw), t);
  const a = Math.pow(Math.max(1e-9, awayWin), t);
  const sum = h + d + a || 1;
  return { homeWin: h / sum, draw: d / sum, awayWin: a / sum };
}

/** Map GLPM evaluation market_id strings onto WC MarketModelId where possible. */
export function mapGlpmMarketId(marketId: string): MarketModelId | null {
  const id = marketId.toLowerCase();
  if (id === "btts" || id.includes("btts")) return "btts";
  if (id.includes("over_under") || id.includes("goals_ou") || id === "ou")
    return "goals_over_under";
  if (id.includes("asian") || id.includes("ah_")) return "asian_handicap";
  if (id.includes("european") || id.includes("eh_")) return "european_handicap";
  if (id.includes("double_chance") || id === "dc") return "double_chance";
  return null;
}

export function glpmEvalsToMarketRows(
  rows: Array<{
    market_id: string;
    market_key?: string;
    predicted: Record<string, unknown> | null;
    actual: Record<string, unknown> | null;
    loss_value?: number | null;
    match_sm_id?: number | null;
  }>
): MarketEvaluationRow[] {
  const out: MarketEvaluationRow[] = [];
  for (const r of rows) {
    const marketId = mapGlpmMarketId(r.market_id);
    if (!marketId) continue;
    const pred = r.predicted ?? {};
    const act = r.actual ?? {};
    const rawP = pred.prob ?? pred.yesPct ?? pred.overPct;
    let p = typeof rawP === "number" ? rawP : Number(rawP);
    if (Number.isFinite(p) && p > 1.0001) p = p / 100;
    if (!Number.isFinite(p)) p = 0.5;
    const hit =
      typeof act.hit === "boolean"
        ? act.hit
        : typeof act.yes === "boolean"
          ? act.yes
          : typeof act.over === "boolean"
            ? act.over
            : false;
    const lineRaw = pred.line ?? (r.market_key ? Number(r.market_key) : undefined);
    const line = typeof lineRaw === "number" && Number.isFinite(lineRaw) ? lineRaw : undefined;
    const selectionKey =
      typeof r.market_key === "string" && r.market_key.length
        ? r.market_key
        : typeof pred.selectionKey === "string"
          ? pred.selectionKey
          : undefined;
    out.push({
      matchId: String(r.match_sm_id ?? r.market_key ?? ""),
      marketId,
      predicted: {
        yesPct: p * 100,
        overPct: p * 100,
        ...(line != null ? { line } : {}),
        ...(selectionKey ? { selectionKey, marketKey: selectionKey } : {}),
      },
      actual: { yes: hit, over: hit },
      lossMetric: "brier",
      lossValue:
        typeof r.loss_value === "number" && Number.isFinite(r.loss_value)
          ? r.loss_value
          : (p - (hit ? 1 : 0)) ** 2,
      modelVersion: GLPM_MARKET_MODELS_VERSION,
    });
  }
  return out;
}

/** Look up a keyed logistic stack with sensible fallbacks. */
export function resolveKeyedStack(
  store: Record<string, LogisticStackCoeffs> | undefined,
  key: string
): LogisticStackCoeffs | undefined {
  if (!store) return undefined;
  return store[key] ?? store._all ?? undefined;
}

export function calibrateGlpmMarketModelsFromRows(
  evaluations: MarketEvaluationRow[],
  previous?: Partial<MarketModelsConfig> | null
): MarketModelsConfig {
  const deployed = mergeMarketModelsConfig(
    previous ?? getDefaultMarketModelsConfig()
  );
  const result = calibrateMarketModelsFromEvaluations({
    deployed,
    evaluations,
  });
  return result.marketModels;
}

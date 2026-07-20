/**
 * GLPM Expected Goals Engine (Chapter 11) — TypeScript port.
 */

import { defaultXgEngineConfig, type XgEngineConfig } from "./config";
import { resolveContextMultipliers } from "./context";
import { computeInteractionMatrix } from "./interactions";
import type { MatchContext, RatingVectorInput, XgEngineResult } from "./types";

function clampXg(value: number, floor: number, ceiling: number): number {
  return Math.max(floor, Math.min(ceiling, value));
}

export function baselineXgFromDeltaS(
  deltaS: number,
  opts: { mu: number; strengthExponent: number }
): number {
  return opts.mu * Math.exp(opts.strengthExponent * deltaS);
}

export function estimateExpectedGoals(
  home: RatingVectorInput,
  away: RatingVectorInput,
  context?: MatchContext | null,
  config?: Partial<XgEngineConfig>
): XgEngineResult {
  const cfg = defaultXgEngineConfig(config);
  const ctx = context ?? {};

  const matrix = computeInteractionMatrix(home, away, cfg);
  const ctxMult = resolveContextMultipliers(ctx, cfg);

  const mu =
    ctx.competitionMu != null && Number.isFinite(ctx.competitionMu)
      ? Number(ctx.competitionMu)
      : cfg.mu;
  const c = cfg.strengthExponent;

  const homeBase = baselineXgFromDeltaS(matrix.home.delta_s, {
    mu,
    strengthExponent: c,
  });
  const awayBase = baselineXgFromDeltaS(matrix.away.delta_s, {
    mu,
    strengthExponent: c,
  });

  const homeXg = clampXg(homeBase * ctxMult.home, cfg.xgFloor, cfg.xgCeiling);
  const awayXg = clampXg(awayBase * ctxMult.away, cfg.xgFloor, cfg.xgCeiling);

  return {
    homeXg,
    awayXg,
    interactions: {
      home: matrix.home,
      away: matrix.away,
      home_ratings: matrix.home_ratings,
      away_ratings: matrix.away_ratings,
      home_baseline_xg: homeBase,
      away_baseline_xg: awayBase,
      mu,
      strength_exponent: c,
    },
    context: {
      home_multiplier: ctxMult.home,
      away_multiplier: ctxMult.away,
      components: ctxMult.components,
    },
    modelVersion: cfg.modelVersion,
  };
}

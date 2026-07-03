import type { MarketStackFeatures } from "@/lib/world-cup/market-models/types";
import type { LogisticStackCoeffs } from "@/lib/world-cup/market-models/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function logisticStackLogit(
  features: MarketStackFeatures,
  coeffs: LogisticStackCoeffs
): number {
  return (
    coeffs.intercept +
    coeffs.totalXgSlope * features.totalXg +
    coeffs.homeAttackSlope * features.homeAttack +
    coeffs.awayAttackSlope * features.awayAttack +
    coeffs.homeDefenseSlope * features.homeDefense +
    coeffs.awayDefenseSlope * features.awayDefense +
    coeffs.lowBlockSlope * features.lowBlockIndex +
    coeffs.rhoSlope * features.rho +
    (features.isKnockout ? coeffs.knockoutSlope : 0) +
    (features.homeScoringRate + features.awayScoringRate) * 0.12 +
    features.finishingRegressionDiff * 0.08
  );
}

/**
 * Blend structural grid prior with logistic ML head.
 * priorProb = grid-derived probability; features drive residual correction.
 */
export function applyLogisticStack(
  priorProb: number,
  features: MarketStackFeatures,
  coeffs: LogisticStackCoeffs
): number {
  const prior = clamp(priorProb, 0.02, 0.98);
  const priorLogit = Math.log(prior / (1 - prior));
  const mlLogit = logisticStackLogit(features, coeffs);
  const blendedLogit =
    coeffs.priorWeight * priorLogit +
    (1 - coeffs.priorWeight) * mlLogit +
    coeffs.mlBlend * (mlLogit - priorLogit) * 0.5;
  return clamp(sigmoid(blendedLogit), 0.02, 0.98);
}

export function brierScore(probability: number, hit: boolean): number {
  const y = hit ? 1 : 0;
  return (probability - y) ** 2;
}

export function logLoss(probability: number, hit: boolean): number {
  const p = clamp(probability, 1e-6, 1 - 1e-6);
  const y = hit ? 1 : 0;
  return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
}

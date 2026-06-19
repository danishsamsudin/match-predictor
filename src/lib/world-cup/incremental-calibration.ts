import type { GrahamDeltaWeights } from "@/lib/world-cup/wc-calibration-config";
import { normalizeDeltaWeights } from "@/lib/world-cup/wc-calibration-config";

/** Fraction of the gap closed per deploy toward an ML/calibration target (delta weights). */
export const ML_DELTA_BLEND_STEP = 0.08;

/** Max relative change per deploy for scalar constants (muXg, strengthExponent). */
export const ML_SCALAR_MAX_REL_STEP = 0.05;

/** Max absolute change per deploy for process/opta feature coefficients. */
export const ML_FEATURE_MAX_ABS_STEP = 0.025;

/** Minimum composite-loss improvement vs deployed when using full bounded grid search. */
export const CALIBRATION_STRICT_IMPROVEMENT_EPS = 1e-6;

/**
 * Adaptive improvement threshold for ML holdout validation.
 * Shrinks as holdout grows; never below 0.05%.
 */
export function mlHoldoutImprovementThreshold(holdoutSize: number): number {
  if (holdoutSize <= 0) return 0.005;
  return Math.max(0.0005, 0.004 / Math.sqrt(holdoutSize / 8));
}

export function blendDeltaWeights(
  deployed: GrahamDeltaWeights,
  target: GrahamDeltaWeights,
  step = ML_DELTA_BLEND_STEP
): GrahamDeltaWeights {
  const blended = {} as GrahamDeltaWeights;
  const keys = Object.keys(deployed) as (keyof GrahamDeltaWeights)[];
  for (const key of keys) {
    const base = deployed[key];
    const tgt = target[key] ?? base;
    blended[key] = base + step * (tgt - base);
  }
  return normalizeDeltaWeights(blended);
}

export function blendScalar(
  deployed: number,
  target: number,
  maxRelStep = ML_SCALAR_MAX_REL_STEP
): number {
  if (!Number.isFinite(deployed) || !Number.isFinite(target)) return deployed;
  const scale = Math.max(Math.abs(deployed), 1e-4);
  const maxDelta = scale * maxRelStep;
  const delta = Math.max(-maxDelta, Math.min(maxDelta, target - deployed));
  return deployed + delta;
}

export function rampFeatureWeights(
  deployed: Record<string, number>,
  target: Record<string, number>,
  maxAbsStep = ML_FEATURE_MAX_ABS_STEP
): Record<string, number> {
  const keys = new Set([...Object.keys(deployed), ...Object.keys(target)]);
  const out: Record<string, number> = { ...deployed };
  for (const key of keys) {
    const base = deployed[key] ?? 0;
    const tgt = target[key] ?? 0;
    const delta = Math.max(-maxAbsStep, Math.min(maxAbsStep, tgt - base));
    const next = base + delta;
    if (Math.abs(next) < 1e-8) {
      delete out[key];
    } else {
      out[key] = next;
    }
  }
  return out;
}

export function beatsDeployedLoss(
  candidateLoss: number,
  deployedLoss: number,
  holdoutSize: number
): boolean {
  if (!Number.isFinite(candidateLoss) || !Number.isFinite(deployedLoss)) return false;
  const threshold = mlHoldoutImprovementThreshold(holdoutSize);
  return candidateLoss < deployedLoss * (1 - threshold);
}

export function calibrationGridImproved(
  candidateLoss: number,
  baselineLoss: number
): boolean {
  return candidateLoss + CALIBRATION_STRICT_IMPROVEMENT_EPS < baselineLoss;
}

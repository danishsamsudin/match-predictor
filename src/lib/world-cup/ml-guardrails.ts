import type { GrahamDeltaWeights } from "@/lib/world-cup/wc-calibration-config";

/** Minimum training examples before first ML auto-deploy. */
export const ML_MIN_TRAINING_EXAMPLES = 30;

/** Minimum new examples since last training run. */
export const ML_MIN_NEW_EXAMPLES_SINCE_LAST_TRAIN = 5;

/** Validation loss must improve by at least this fraction vs deployed (legacy default). */
export const ML_IMPROVEMENT_THRESHOLD = 0.005;

/** Max relative shift per delta weight vs deployed values (legacy hard reject — prefer incremental blend). */
export const ML_MAX_WEIGHT_SHIFT_PCT = 0.15;

/** Walk-forward holdout window size (matches). */
export const ML_WALK_FORWARD_HOLDOUT = 8;

export interface MlGuardrailResult {
  passed: boolean;
  reasons: string[];
}

export function checkWeightStability(
  candidate: GrahamDeltaWeights,
  deployed: GrahamDeltaWeights,
  maxShiftPct = ML_MAX_WEIGHT_SHIFT_PCT
): MlGuardrailResult {
  const reasons: string[] = [];
  const keys = Object.keys(candidate) as (keyof GrahamDeltaWeights)[];
  for (const key of keys) {
    const base = deployed[key];
    const next = candidate[key];
    if (base <= 0) continue;
    const shift = Math.abs(next - base) / base;
    if (shift > maxShiftPct) {
      reasons.push(`${key} shifted ${(shift * 100).toFixed(1)}% (max ${maxShiftPct * 100}%)`);
    }
  }
  return { passed: reasons.length === 0, reasons };
}

export function checkImprovement(
  candidateLoss: number,
  baselineLoss: number,
  threshold = ML_IMPROVEMENT_THRESHOLD
): MlGuardrailResult {
  if (!Number.isFinite(candidateLoss) || !Number.isFinite(baselineLoss)) {
    return { passed: false, reasons: ["invalid loss values"] };
  }
  const required = baselineLoss * (1 - threshold);
  if (candidateLoss >= required) {
    return {
      passed: false,
      reasons: [
        `loss ${candidateLoss.toFixed(4)} did not beat ${required.toFixed(4)} (${(threshold * 100).toFixed(1)}% improvement required)`,
      ],
    };
  }
  return { passed: true, reasons: [] };
}

export function checkSampleGates(
  totalExamples: number,
  newSinceLastTrain: number
): MlGuardrailResult {
  const reasons: string[] = [];
  if (totalExamples < ML_MIN_TRAINING_EXAMPLES) {
    reasons.push(
      `only ${totalExamples} examples (need ${ML_MIN_TRAINING_EXAMPLES})`
    );
  }
  if (newSinceLastTrain < ML_MIN_NEW_EXAMPLES_SINCE_LAST_TRAIN) {
    reasons.push(
      `only ${newSinceLastTrain} new since last train (need ${ML_MIN_NEW_EXAMPLES_SINCE_LAST_TRAIN})`
    );
  }
  return { passed: reasons.length === 0, reasons };
}

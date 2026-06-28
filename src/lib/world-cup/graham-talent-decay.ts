import {
  normalizeDeltaWeights,
  type GrahamDeltaWeights,
  type WcCalibrationConstants,
} from "@/lib/world-cup/wc-calibration-config";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function applyTalentWeightDecay(
  weights: GrahamDeltaWeights,
  homeWcMatches: number,
  awayWcMatches: number,
  cal: Pick<
    WcCalibrationConstants,
    "talentDecayPerMatch" | "talentDecayMatchCap" | "talentWeightFloor"
  >
): { weights: GrahamDeltaWeights; effectiveTalentWeight: number } {
  const n = Math.max(homeWcMatches, awayWcMatches);
  const decayFactor = 1 - cal.talentDecayPerMatch * Math.min(n, cal.talentDecayMatchCap);
  const scaledTalent = weights.talent * clamp(decayFactor, cal.talentWeightFloor, 1);
  return {
    weights: normalizeDeltaWeights({ ...weights, talent: scaledTalent }),
    effectiveTalentWeight: scaledTalent,
  };
}

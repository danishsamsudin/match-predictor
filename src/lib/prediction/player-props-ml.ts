import type { WcPlayerPropOverlay } from "@/lib/prediction/player-props-wc-opta";
import type { PlayerPropSotCoeffs } from "@/lib/world-cup/market-models/types";
import { DEFAULT_PLAYER_PROP_SOT } from "@/lib/world-cup/market-models/defaults";

/** Logistic calibration for anytime-scorer probabilities (walk-forward trained). */
export interface PlayerPropMlCoeffs {
  intercept: number;
  logLambdaSlope: number;
  chanceIndexSlope: number;
  penaltyTakerSlope: number;
  starterSlope: number;
  roleForwardSlope: number;
  roleMidSlope: number;
  teamXgSlope: number;
  /** Blend ML logit output with base ZIP probability (0 = base only, 1 = ML only). */
  mlBlend: number;
  /** Multiplier on ZIP structural-zero inflation (lower = higher scorer probs). */
  structuralZeroScale: number;
  /** Team goal budget share when WC Opta overlays are active. */
  wcGoalShare: number;
}

export const DEFAULT_PLAYER_PROP_ML_COEFFS: PlayerPropMlCoeffs = {
  intercept: -0.72,
  logLambdaSlope: 1.25,
  chanceIndexSlope: 0.45,
  penaltyTakerSlope: 0.32,
  starterSlope: 0.24,
  roleForwardSlope: 0.2,
  roleMidSlope: 0.1,
  teamXgSlope: 0.14,
  mlBlend: 0.58,
  structuralZeroScale: 0.42,
  wcGoalShare: 0.94,
};

export type PlayerPropMlFeatures = {
  logLambda: number;
  chanceIndexPer90: number;
  isPenaltyTaker: boolean;
  isStarter: boolean;
  roleForward: boolean;
  roleMid: boolean;
  teamExpectedGoals: number;
};

export function mergePlayerPropMlCoeffs(
  raw: Partial<PlayerPropMlCoeffs> | undefined
): PlayerPropMlCoeffs {
  const base = DEFAULT_PLAYER_PROP_ML_COEFFS;
  if (!raw) return { ...base };
  return {
    intercept: Number(raw.intercept ?? base.intercept),
    logLambdaSlope: Number(raw.logLambdaSlope ?? base.logLambdaSlope),
    chanceIndexSlope: Number(raw.chanceIndexSlope ?? base.chanceIndexSlope),
    penaltyTakerSlope: Number(raw.penaltyTakerSlope ?? base.penaltyTakerSlope),
    starterSlope: Number(raw.starterSlope ?? base.starterSlope),
    roleForwardSlope: Number(raw.roleForwardSlope ?? base.roleForwardSlope),
    roleMidSlope: Number(raw.roleMidSlope ?? base.roleMidSlope),
    teamXgSlope: Number(raw.teamXgSlope ?? base.teamXgSlope),
    mlBlend: clamp(Number(raw.mlBlend ?? base.mlBlend), 0, 1),
    structuralZeroScale: clamp(
      Number(raw.structuralZeroScale ?? base.structuralZeroScale),
      0.25,
      1
    ),
    wcGoalShare: clamp(Number(raw.wcGoalShare ?? base.wcGoalShare), 0.75, 1),
  };
}

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

export function buildPlayerPropMlFeatures(input: {
  normalizedGoalLambda: number;
  wcOverlay: WcPlayerPropOverlay | null;
  isPenaltyTaker: boolean;
  isStarter: boolean;
  role: "G" | "D" | "M" | "F";
  teamExpectedGoals: number;
}): PlayerPropMlFeatures {
  return {
    logLambda: Math.log(Math.max(input.normalizedGoalLambda, 0.005)),
    chanceIndexPer90: input.wcOverlay?.chanceIndexPer90 ?? 0,
    isPenaltyTaker: input.isPenaltyTaker,
    isStarter: input.isStarter,
    roleForward: input.role === "F",
    roleMid: input.role === "M",
    teamExpectedGoals: input.teamExpectedGoals,
  };
}

export function playerPropMlLogit(
  features: PlayerPropMlFeatures,
  coeffs: PlayerPropMlCoeffs
): number {
  return (
    coeffs.intercept +
    coeffs.logLambdaSlope * features.logLambda +
    coeffs.chanceIndexSlope * features.chanceIndexPer90 +
    (features.isPenaltyTaker ? coeffs.penaltyTakerSlope : 0) +
    (features.isStarter ? coeffs.starterSlope : 0) +
    (features.roleForward ? coeffs.roleForwardSlope : 0) +
    (features.roleMid ? coeffs.roleMidSlope : 0) +
    coeffs.teamXgSlope * features.teamExpectedGoals
  );
}

export function applyPlayerPropMlCalibration(
  baseProb: number,
  features: PlayerPropMlFeatures,
  coeffs: PlayerPropMlCoeffs
): number {
  const mlProb = sigmoid(playerPropMlLogit(features, coeffs));
  const blend = coeffs.mlBlend;
  const blended = blend * mlProb + (1 - blend) * baseProb;
  return clamp(blended, 0.01, 0.95);
}

export function scaledStructuralZero(
  basePi: number,
  coeffs: PlayerPropMlCoeffs,
  wcOverlay: WcPlayerPropOverlay | null
): number {
  let pi = basePi * coeffs.structuralZeroScale;
  if (wcOverlay && wcOverlay.chanceIndexPer90 > 0.65) {
    pi *= 0.72;
  }
  if (wcOverlay && wcOverlay.goalsPer90 > 0.25) {
    pi *= 0.65;
  }
  return clamp(pi, 0.02, 0.22);
}

export type PlayerPropTrainingRow = {
  hit: boolean;
  predictedProb: number;
  predictedLambda: number;
  chanceIndexPer90: number;
  isPenaltyTaker: boolean;
  isStarter: boolean;
  roleForward: boolean;
  roleMid: boolean;
  teamExpectedGoals: number;
};

function brierScore(probs: number[], hits: boolean[]): number {
  if (!probs.length) return 1;
  let sum = 0;
  for (let i = 0; i < probs.length; i++) {
    const y = hits[i] ? 1 : 0;
    sum += (probs[i]! - y) ** 2;
  }
  return sum / probs.length;
}

/**
 * Fit logistic calibration on player-prop evaluation rows (gradient steps).
 * Shrinks toward defaults when sample size is small.
 */
export function trainPlayerPropMlCoeffs(
  rows: PlayerPropTrainingRow[],
  deployed: PlayerPropMlCoeffs = DEFAULT_PLAYER_PROP_ML_COEFFS
): { coeffs: PlayerPropMlCoeffs; brier: number; sampleSize: number } {
  if (!rows.length) {
    return { coeffs: deployed, brier: 1, sampleSize: 0 };
  }

  const shrink = clamp(1 - rows.length / 80, 0.15, 0.85);
  const coeffs = mergePlayerPropMlCoeffs(deployed);
  const lr = 0.08;

  for (let epoch = 0; epoch < 120; epoch++) {
    let gIntercept = 0;
    let gLogLambda = 0;
    let gChance = 0;
    let gPenalty = 0;
    let gStarter = 0;
    let gForward = 0;
    let gMid = 0;
    let gTeamXg = 0;

    for (const row of rows) {
      const features: PlayerPropMlFeatures = {
        logLambda: Math.log(Math.max(row.predictedLambda, 0.005)),
        chanceIndexPer90: row.chanceIndexPer90,
        isPenaltyTaker: row.isPenaltyTaker,
        isStarter: row.isStarter,
        roleForward: row.roleForward,
        roleMid: row.roleMid,
        teamExpectedGoals: row.teamExpectedGoals,
      };
      const logit = playerPropMlLogit(features, coeffs);
      const pred = sigmoid(logit);
      const err = pred - (row.hit ? 1 : 0);

      gIntercept += err;
      gLogLambda += err * features.logLambda;
      gChance += err * features.chanceIndexPer90;
      if (row.isPenaltyTaker) gPenalty += err;
      if (row.isStarter) gStarter += err;
      if (row.roleForward) gForward += err;
      if (row.roleMid) gMid += err;
      gTeamXg += err * features.teamExpectedGoals;
    }

    const n = rows.length;
    coeffs.intercept -= (lr * gIntercept) / n;
    coeffs.logLambdaSlope -= (lr * gLogLambda) / n;
    coeffs.chanceIndexSlope -= (lr * gChance) / n;
    coeffs.penaltyTakerSlope -= (lr * gPenalty) / n;
    coeffs.starterSlope -= (lr * gStarter) / n;
    coeffs.roleForwardSlope -= (lr * gForward) / n;
    coeffs.roleMidSlope -= (lr * gMid) / n;
    coeffs.teamXgSlope -= (lr * gTeamXg) / n;
  }

  const shrunk: PlayerPropMlCoeffs = {
    intercept:
      deployed.intercept * shrink + coeffs.intercept * (1 - shrink),
    logLambdaSlope:
      deployed.logLambdaSlope * shrink + coeffs.logLambdaSlope * (1 - shrink),
    chanceIndexSlope:
      deployed.chanceIndexSlope * shrink + coeffs.chanceIndexSlope * (1 - shrink),
    penaltyTakerSlope:
      deployed.penaltyTakerSlope * shrink +
      coeffs.penaltyTakerSlope * (1 - shrink),
    starterSlope:
      deployed.starterSlope * shrink + coeffs.starterSlope * (1 - shrink),
    roleForwardSlope:
      deployed.roleForwardSlope * shrink +
      coeffs.roleForwardSlope * (1 - shrink),
    roleMidSlope:
      deployed.roleMidSlope * shrink + coeffs.roleMidSlope * (1 - shrink),
    teamXgSlope:
      deployed.teamXgSlope * shrink + coeffs.teamXgSlope * (1 - shrink),
    mlBlend: deployed.mlBlend,
    structuralZeroScale: deployed.structuralZeroScale,
    wcGoalShare: deployed.wcGoalShare,
  };

  const probs = rows.map((row) => {
    const features: PlayerPropMlFeatures = {
      logLambda: Math.log(Math.max(row.predictedLambda, 0.005)),
      chanceIndexPer90: row.chanceIndexPer90,
      isPenaltyTaker: row.isPenaltyTaker,
      isStarter: row.isStarter,
      roleForward: row.roleForward,
      roleMid: row.roleMid,
      teamExpectedGoals: row.teamExpectedGoals,
    };
    return applyPlayerPropMlCalibration(row.predictedProb, features, shrunk);
  });

  return {
    coeffs: mergePlayerPropMlCoeffs(shrunk),
    brier: brierScore(
      probs,
      rows.map((r) => r.hit)
    ),
    sampleSize: rows.length,
  };
}

export function mergePlayerPropSotCoeffs(
  raw: Partial<PlayerPropSotCoeffs> | undefined
): PlayerPropSotCoeffs {
  const base = DEFAULT_PLAYER_PROP_SOT;
  if (!raw) return { ...base };
  return {
    intercept: Number(raw.intercept ?? base.intercept),
    logLambdaSlope: Number(raw.logLambdaSlope ?? base.logLambdaSlope),
    sotRateSlope: Number(raw.sotRateSlope ?? base.sotRateSlope),
    starterSlope: Number(raw.starterSlope ?? base.starterSlope),
    roleForwardSlope: Number(raw.roleForwardSlope ?? base.roleForwardSlope),
    teamSotSlope: Number(raw.teamSotSlope ?? base.teamSotSlope),
    mlBlend: clamp(Number(raw.mlBlend ?? base.mlBlend), 0, 1),
    structuralZeroScale: clamp(
      Number(raw.structuralZeroScale ?? base.structuralZeroScale),
      0.2,
      1
    ),
  };
}

export function applyPlayerPropSotCalibration(
  baseProb: number,
  input: {
    logLambda: number;
    sotRatePer90: number;
    isStarter: boolean;
    roleForward: boolean;
    teamExpectedSot: number;
  },
  coeffs: PlayerPropSotCoeffs
): number {
  const logit =
    coeffs.intercept +
    coeffs.logLambdaSlope * input.logLambda +
    coeffs.sotRateSlope * input.sotRatePer90 +
    (input.isStarter ? coeffs.starterSlope : 0) +
    (input.roleForward ? coeffs.roleForwardSlope : 0) +
    coeffs.teamSotSlope * input.teamExpectedSot;
  const mlProb = sigmoid(logit);
  const blended = coeffs.mlBlend * mlProb + (1 - coeffs.mlBlend) * baseProb;
  return clamp(blended, 0.02, 0.92);
}

export function scaledStructuralZeroForRole(
  basePi: number,
  coeffs: PlayerPropMlCoeffs,
  role: "G" | "D" | "M" | "F"
): number {
  const roleScale = { G: 1.35, D: 1.15, M: 0.95, F: 0.78 }[role];
  return clamp(basePi * coeffs.structuralZeroScale * roleScale, 0.015, 0.2);
}

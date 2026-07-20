/**
 * GLPM Expected Goals Engine configuration (Chapter 11) — TypeScript port.
 */

export const DEFAULT_INTERACTION_WEIGHTS = {
  attack_defence: 0.4,
  finishing_goalkeeper: 0.25,
  build_up_pressing: 0.2,
  possession_pressing: 0.15,
} as const;

export type InteractionWeightKey = keyof typeof DEFAULT_INTERACTION_WEIGHTS;

export const DEFAULT_RATING_CENTER = 60;
export const DEFAULT_RATING_SCALE = 20;
export const DEFAULT_MU_XG = 1.35;
export const DEFAULT_STRENGTH_EXPONENT = 0.28;
export const DEFAULT_DELTA_S_CAP = 3;
export const DEFAULT_HOME_ADVANTAGE = 1.12;
export const DEFAULT_REST_BASELINE_DAYS = 7;
export const DEFAULT_CONGESTION_DAYS = 4;
export const DEFAULT_CONGESTION_PENALTY = 0.97;
export const DEFAULT_TRAVEL_LONG_KM = 1500;
export const DEFAULT_TRAVEL_MODERATE_KM = 500;
export const DEFAULT_TRAVEL_LONG_MULT = 0.95;
export const DEFAULT_TRAVEL_MODERATE_MULT = 0.98;
export const DEFAULT_ALTITUDE_THRESHOLD_M = 1000;
export const DEFAULT_ALTITUDE_AWAY_PENALTY = 0.97;
export const DEFAULT_XG_FLOOR = 0.15;
export const DEFAULT_XG_CEILING = 4.5;
export const XG_MODEL_VERSION = "glpm_xg_v1";

export type XgEngineConfig = {
  interactionWeights: Partial<Record<InteractionWeightKey, number>>;
  ratingCenter: number;
  ratingScale: number;
  mu: number;
  strengthExponent: number;
  deltaSCap: number;
  homeAdvantage: number;
  restBaselineDays: number;
  congestionDays: number;
  congestionPenalty: number;
  travelLongKm: number;
  travelModerateKm: number;
  travelLongMult: number;
  travelModerateMult: number;
  altitudeThresholdM: number;
  altitudeAwayPenalty: number;
  xgFloor: number;
  xgCeiling: number;
  modelVersion: string;
};

export function defaultXgEngineConfig(
  overrides: Partial<XgEngineConfig> = {}
): XgEngineConfig {
  return {
    interactionWeights: { ...DEFAULT_INTERACTION_WEIGHTS },
    ratingCenter: DEFAULT_RATING_CENTER,
    ratingScale: DEFAULT_RATING_SCALE,
    mu: DEFAULT_MU_XG,
    strengthExponent: DEFAULT_STRENGTH_EXPONENT,
    deltaSCap: DEFAULT_DELTA_S_CAP,
    homeAdvantage: DEFAULT_HOME_ADVANTAGE,
    restBaselineDays: DEFAULT_REST_BASELINE_DAYS,
    congestionDays: DEFAULT_CONGESTION_DAYS,
    congestionPenalty: DEFAULT_CONGESTION_PENALTY,
    travelLongKm: DEFAULT_TRAVEL_LONG_KM,
    travelModerateKm: DEFAULT_TRAVEL_MODERATE_KM,
    travelLongMult: DEFAULT_TRAVEL_LONG_MULT,
    travelModerateMult: DEFAULT_TRAVEL_MODERATE_MULT,
    altitudeThresholdM: DEFAULT_ALTITUDE_THRESHOLD_M,
    altitudeAwayPenalty: DEFAULT_ALTITUDE_AWAY_PENALTY,
    xgFloor: DEFAULT_XG_FLOOR,
    xgCeiling: DEFAULT_XG_CEILING,
    modelVersion: XG_MODEL_VERSION,
    ...overrides,
  };
}

export function normalizedWeights(
  config: XgEngineConfig
): Record<InteractionWeightKey, number> {
  const keys: InteractionWeightKey[] = [
    "attack_defence",
    "finishing_goalkeeper",
    "build_up_pressing",
    "possession_pressing",
  ];
  const raw = Object.fromEntries(
    keys.map((k) => [
      k,
      Number(config.interactionWeights[k] ?? DEFAULT_INTERACTION_WEIGHTS[k]),
    ])
  ) as Record<InteractionWeightKey, number>;
  const total = keys.reduce((s, k) => s + raw[k], 0);
  if (total <= 0) return { ...DEFAULT_INTERACTION_WEIGHTS };
  return Object.fromEntries(keys.map((k) => [k, raw[k] / total])) as Record<
    InteractionWeightKey,
    number
  >;
}

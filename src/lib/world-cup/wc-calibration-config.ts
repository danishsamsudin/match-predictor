import {
  GRAHAM_DELTA_WEIGHTS,
  GRAHAM_MODEL_VERSION,
  GRAHAM_MOMENTUM_CLAMP,
  GRAHAM_MOMENTUM_GAMMA,
  GRAHAM_MU_XG,
  GRAHAM_STRENGTH_EXPONENT,
  GRAHAM_XG_ELO_BASE_K,
} from "@/lib/world-cup/graham-model-config";
import { tryCreateServiceClient } from "@/lib/supabase";

export interface GrahamDeltaWeights {
  xgElo: number;
  talent: number;
  tournament: number;
  recentXgForm: number;
  fifa: number;
  momentum: number;
}

export interface MlEventModelCoeffs {
  intercept: number;
  totalXgSlope: number;
  knockoutSlope: number;
  physicalitySlope: number;
  refereeStrictnessSlope: number;
}

export interface WcCalibrationConstants {
  muXg: number;
  strengthExponent: number;
  xgEloBaseK: number;
  momentumGamma: number;
  momentumClamp: number;
  setPieceXgBump: number;
  setPieceRateThreshold: number;
  deltaWeights: GrahamDeltaWeights;
  modelVersion: string;
  /** Per-team set-piece goal share from Opta ingests (api team id → 0–1). */
  teamSetPieceRates: Record<string, number>;
  wcAttackFormWeight: number;
  wcDefenseFormWeight: number;
  wcFinishingRegressionWeight: number;
  wcLineupAttackBlend: number;
  wcLineupDefenseBlend: number;
  wcLowEventRhoBoost: number;
  /** L1-learned Opta aggregate coefficients (zeroed features excluded at inference). */
  optaFeatureWeights: Record<string, number>;
  /** ML-learned Poisson-style coefficients for secondary event markets (log-link intercepts). */
  eventModelCoeffs: {
    yellow: MlEventModelCoeffs;
    fouls: MlEventModelCoeffs;
    corners: MlEventModelCoeffs;
    red?: MlEventModelCoeffs;
  };
}

/** Legacy configs stored natural-scale intercepts; Poisson inference expects log-scale. */
export function normalizeEventCoeffs(coeffs: MlEventModelCoeffs): MlEventModelCoeffs {
  if (coeffs.intercept <= 8) return coeffs;
  return {
    ...coeffs,
    intercept: Math.log(Math.max(coeffs.intercept, 0.5)),
  };
}

const DEFAULTS: WcCalibrationConstants = {
  muXg: GRAHAM_MU_XG,
  strengthExponent: GRAHAM_STRENGTH_EXPONENT,
  xgEloBaseK: GRAHAM_XG_ELO_BASE_K,
  momentumGamma: GRAHAM_MOMENTUM_GAMMA,
  momentumClamp: GRAHAM_MOMENTUM_CLAMP,
  setPieceXgBump: 0.15,
  setPieceRateThreshold: 0.4,
  deltaWeights: { ...GRAHAM_DELTA_WEIGHTS },
  modelVersion: GRAHAM_MODEL_VERSION,
  teamSetPieceRates: {},
  wcAttackFormWeight: 0.35,
  wcDefenseFormWeight: 0.35,
  wcFinishingRegressionWeight: 0.15,
  wcLineupAttackBlend: 0.35,
  wcLineupDefenseBlend: 0.35,
  wcLowEventRhoBoost: 0.025,
  optaFeatureWeights: {},
  eventModelCoeffs: {
    yellow: {
      intercept: Math.log(3.6),
      totalXgSlope: 0.35,
      knockoutSlope: 0.15,
      physicalitySlope: 0.4,
      refereeStrictnessSlope: 0.25,
    },
    fouls: {
      intercept: Math.log(23.5),
      totalXgSlope: 0.8,
      knockoutSlope: 0.5,
      physicalitySlope: 1.2,
      refereeStrictnessSlope: 0.1,
    },
    corners: {
      intercept: Math.log(9.8),
      totalXgSlope: 0.6,
      knockoutSlope: -0.2,
      physicalitySlope: 0.3,
      refereeStrictnessSlope: 0,
    },
    red: {
      intercept: Math.log(0.12),
      totalXgSlope: 0.05,
      knockoutSlope: 0.08,
      physicalitySlope: 0.15,
      refereeStrictnessSlope: 0.1,
    },
  },
};

const DEFAULT_EVENT_COEFFS = DEFAULTS.eventModelCoeffs;

function mergeEventCoeffs(
  raw: Partial<MlEventModelCoeffs> | undefined,
  fallback: MlEventModelCoeffs
): MlEventModelCoeffs {
  return normalizeEventCoeffs({
    intercept: Number(raw?.intercept ?? fallback.intercept),
    totalXgSlope: Number(raw?.totalXgSlope ?? fallback.totalXgSlope),
    knockoutSlope: Number(raw?.knockoutSlope ?? fallback.knockoutSlope),
    physicalitySlope: Number(raw?.physicalitySlope ?? fallback.physicalitySlope),
    refereeStrictnessSlope: Number(
      raw?.refereeStrictnessSlope ?? fallback.refereeStrictnessSlope
    ),
  });
}

function mergeEventModelCoeffs(
  raw: Record<string, Partial<MlEventModelCoeffs>> | undefined
): WcCalibrationConstants["eventModelCoeffs"] {
  return {
    yellow: mergeEventCoeffs(raw?.yellow, DEFAULT_EVENT_COEFFS.yellow),
    fouls: mergeEventCoeffs(raw?.fouls, DEFAULT_EVENT_COEFFS.fouls),
    corners: mergeEventCoeffs(raw?.corners, DEFAULT_EVENT_COEFFS.corners),
    red: mergeEventCoeffs(
      raw?.red,
      DEFAULT_EVENT_COEFFS.red ?? DEFAULT_EVENT_COEFFS.yellow
    ),
  };
}

let cached: WcCalibrationConstants | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function mergeConstants(raw: Record<string, unknown> | null): WcCalibrationConstants {
  if (!raw) return getDefaultWcCalibrationConstants();
  const weights = raw.deltaWeights as Partial<typeof GRAHAM_DELTA_WEIGHTS> | undefined;
  return {
    muXg: Number(raw.muXg ?? DEFAULTS.muXg),
    strengthExponent: Number(raw.strengthExponent ?? DEFAULTS.strengthExponent),
    xgEloBaseK: Number(raw.xgEloBaseK ?? DEFAULTS.xgEloBaseK),
    momentumGamma: Number(raw.momentumGamma ?? DEFAULTS.momentumGamma),
    momentumClamp: Number(raw.momentumClamp ?? DEFAULTS.momentumClamp),
    setPieceXgBump: Number(raw.setPieceXgBump ?? DEFAULTS.setPieceXgBump),
    setPieceRateThreshold: Number(
      raw.setPieceRateThreshold ?? DEFAULTS.setPieceRateThreshold
    ),
    deltaWeights: {
      xgElo: Number(weights?.xgElo ?? GRAHAM_DELTA_WEIGHTS.xgElo),
      talent: Number(weights?.talent ?? GRAHAM_DELTA_WEIGHTS.talent),
      tournament: Number(weights?.tournament ?? GRAHAM_DELTA_WEIGHTS.tournament),
      recentXgForm: Number(weights?.recentXgForm ?? GRAHAM_DELTA_WEIGHTS.recentXgForm),
      fifa: Number(weights?.fifa ?? GRAHAM_DELTA_WEIGHTS.fifa),
      momentum: Number(weights?.momentum ?? GRAHAM_DELTA_WEIGHTS.momentum),
    },
    modelVersion: String(raw.modelVersion ?? DEFAULTS.modelVersion),
    teamSetPieceRates:
      (raw.teamSetPieceRates as Record<string, number> | undefined) ?? {},
    wcAttackFormWeight: Number(raw.wcAttackFormWeight ?? DEFAULTS.wcAttackFormWeight),
    wcDefenseFormWeight: Number(raw.wcDefenseFormWeight ?? DEFAULTS.wcDefenseFormWeight),
    wcFinishingRegressionWeight: Number(
      raw.wcFinishingRegressionWeight ?? DEFAULTS.wcFinishingRegressionWeight
    ),
    wcLineupAttackBlend: Number(raw.wcLineupAttackBlend ?? DEFAULTS.wcLineupAttackBlend),
    wcLineupDefenseBlend: Number(raw.wcLineupDefenseBlend ?? DEFAULTS.wcLineupDefenseBlend),
    wcLowEventRhoBoost: Number(raw.wcLowEventRhoBoost ?? DEFAULTS.wcLowEventRhoBoost),
    optaFeatureWeights:
      (raw.optaFeatureWeights as Record<string, number> | undefined) ?? {},
    eventModelCoeffs: mergeEventModelCoeffs(
      raw.eventModelCoeffs as Record<string, Partial<MlEventModelCoeffs>> | undefined
    ),
  };
}

export function getDefaultWcCalibrationConstants(): WcCalibrationConstants {
  return {
    ...DEFAULTS,
    deltaWeights: { ...GRAHAM_DELTA_WEIGHTS },
    optaFeatureWeights: { ...DEFAULTS.optaFeatureWeights },
    eventModelCoeffs: mergeEventModelCoeffs(undefined),
    teamSetPieceRates: { ...DEFAULTS.teamSetPieceRates },
  };
}

export function mergeCalibrationFromRecord(
  raw: Record<string, unknown>
): WcCalibrationConstants {
  return mergeConstants(raw);
}

export async function loadWcCalibrationConfig(): Promise<WcCalibrationConstants> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    cached = getDefaultWcCalibrationConstants();
    cachedAt = Date.now();
    return cached;
  }

  const { data } = await supabase
    .from("world_cup_calibration_config")
    .select("constants, version")
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const merged = mergeConstants(
    data?.constants
      ? { ...(data.constants as Record<string, unknown>), modelVersion: data.version }
      : null
  );
  cached = merged;
  cachedAt = Date.now();
  return merged;
}

export function clearWcCalibrationCache(): void {
  cached = null;
  cachedAt = 0;
}

export function normalizeDeltaWeights(weights: GrahamDeltaWeights): GrahamDeltaWeights {
  const sum =
    weights.xgElo +
    weights.talent +
    weights.tournament +
    weights.recentXgForm +
    weights.fifa +
    weights.momentum;
  if (sum <= 0) return { ...GRAHAM_DELTA_WEIGHTS };
  return {
    xgElo: weights.xgElo / sum,
    talent: weights.talent / sum,
    tournament: weights.tournament / sum,
    recentXgForm: weights.recentXgForm / sum,
    fifa: weights.fifa / sum,
    momentum: weights.momentum / sum,
  };
}

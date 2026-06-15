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
};

let cached: WcCalibrationConstants | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function mergeConstants(raw: Record<string, unknown> | null): WcCalibrationConstants {
  if (!raw) return { ...DEFAULTS, deltaWeights: { ...GRAHAM_DELTA_WEIGHTS } };
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
  };
}

export function getDefaultWcCalibrationConstants(): WcCalibrationConstants {
  return { ...DEFAULTS, deltaWeights: { ...GRAHAM_DELTA_WEIGHTS } };
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

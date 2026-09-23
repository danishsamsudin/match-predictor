import {
  GRAHAM_MOMENTUM_CLAMP,
  GRAHAM_STRENGTH_EXPONENT,
  GRAHAM_XG_ELO_BASE_K,
} from "@/lib/world-cup/graham-model-config";
import {
  getDefaultMarketModelsConfig,
  mergeMarketModelsConfig,
} from "@/lib/world-cup/market-models/defaults";
import type { MarketModelsConfig } from "@/lib/world-cup/market-models/types";
import {
  DEFAULT_PLAYER_PROP_ML_COEFFS,
  mergePlayerPropMlCoeffs,
  type PlayerPropMlCoeffs,
} from "@/lib/prediction/player-props-ml";
import type {
  GrahamDeltaWeights,
  WcCalibrationConstants,
} from "@/lib/world-cup/wc-calibration-config";
import { normalizeDeltaWeights } from "@/lib/world-cup/wc-calibration-config";
import {
  NL_GRAHAM_DELTA_WEIGHTS,
  NL_GRAHAM_MODEL_VERSION,
  NL_GRAHAM_MOMENTUM_GAMMA,
  NL_GRAHAM_MU_XG,
  NL_LINEUP_ATTACK_BLEND,
  NL_LINEUP_DEFENSE_BLEND,
  NL_TALENT_DECAY_MATCH_CAP,
  NL_TALENT_DECAY_PER_MATCH,
  NL_TALENT_WEIGHT_FLOOR,
} from "@/lib/nations-league/nl-graham-model-config";
import { tryCreateServiceClient } from "@/lib/supabase";

const DEFAULTS: WcCalibrationConstants = {
  muXg: NL_GRAHAM_MU_XG,
  strengthExponent: GRAHAM_STRENGTH_EXPONENT,
  xgEloBaseK: GRAHAM_XG_ELO_BASE_K,
  momentumGamma: NL_GRAHAM_MOMENTUM_GAMMA,
  momentumClamp: GRAHAM_MOMENTUM_CLAMP,
  setPieceXgBump: 0.12,
  setPieceXgMultiplier: 0.1,
  setPieceRateThreshold: 0.4,
  setPieceDefLeakWeight: 0.35,
  goalOverdispersionK: 0,
  // Within-window only: matchCount comes from same-window finished NL matches.
  talentDecayPerMatch: NL_TALENT_DECAY_PER_MATCH,
  talentDecayMatchCap: NL_TALENT_DECAY_MATCH_CAP,
  talentWeightFloor: NL_TALENT_WEIGHT_FLOOR,
  md3MutualRotationPenaltyScale: 0.5,
  redCardMatchBaseProb: 0.04,
  redCardAttackPenalty: 0.72,
  redCardOpponentBoost: 1.18,
  xgCapSoftness: 0.12,
  deltaWeights: { ...NL_GRAHAM_DELTA_WEIGHTS } as GrahamDeltaWeights,
  modelVersion: NL_GRAHAM_MODEL_VERSION,
  teamSetPieceRates: {},
  wcAttackFormWeight: 0.3,
  wcDefenseFormWeight: 0.3,
  wcFinishingRegressionWeight: 0.12,
  wcLineupAttackBlend: NL_LINEUP_ATTACK_BLEND,
  wcLineupDefenseBlend: NL_LINEUP_DEFENSE_BLEND,
  wcLowEventRhoBoost: 0.02,
  optaFeatureWeights: {},
  processFeatureWeights: {},
  eventModelCoeffs: {
    yellow: {
      intercept: 3.6,
      totalXgSlope: 0.35,
      knockoutSlope: 0.1,
      physicalitySlope: 0.35,
      refereeStrictnessSlope: 0.25,
    },
    fouls: {
      intercept: Math.log(22),
      totalXgSlope: 0.2,
      knockoutSlope: 0.05,
      physicalitySlope: 0.3,
      refereeStrictnessSlope: 0.2,
    },
    corners: {
      intercept: Math.log(9.5),
      totalXgSlope: 0.45,
      knockoutSlope: 0.05,
      physicalitySlope: 0.1,
      refereeStrictnessSlope: 0,
    },
  },
  playerPropModelCoeffs: { ...DEFAULT_PLAYER_PROP_ML_COEFFS },
  marketModels: getDefaultMarketModelsConfig(),
};

function mergeConstants(
  raw: Partial<WcCalibrationConstants> | null | undefined
): WcCalibrationConstants {
  if (!raw) return { ...DEFAULTS, deltaWeights: { ...DEFAULTS.deltaWeights } };
  const deltaWeights = normalizeDeltaWeights({
    ...DEFAULTS.deltaWeights,
    ...(raw.deltaWeights ?? {}),
  });
  return {
    ...DEFAULTS,
    ...raw,
    deltaWeights,
    modelVersion: raw.modelVersion ?? NL_GRAHAM_MODEL_VERSION,
    playerPropModelCoeffs: mergePlayerPropMlCoeffs(
      raw.playerPropModelCoeffs as PlayerPropMlCoeffs | undefined
    ),
    marketModels: mergeMarketModelsConfig(
      raw.marketModels as Partial<MarketModelsConfig> | undefined
    ),
    eventModelCoeffs: {
      ...DEFAULTS.eventModelCoeffs,
      ...(raw.eventModelCoeffs ?? {}),
    } as WcCalibrationConstants["eventModelCoeffs"],
  };
}

export async function loadNlCalibrationConfig(): Promise<WcCalibrationConstants> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return mergeConstants(null);

  const { data } = await supabase
    .from("nations_league_calibration_config")
    .select("constants, version")
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.constants) return mergeConstants(null);
  return mergeConstants(data.constants as Partial<WcCalibrationConstants>);
}

export { DEFAULTS as NL_CALIBRATION_DEFAULTS };

/**
 * Load / merge per-league GLPM calibration (confidence layers for Value Opportunities).
 */

import {
  EMPTY_CONFIDENCE_LAYER,
  mergeConfidenceLayer,
  type ConfidenceLayerConfig,
} from "@/lib/value-opportunities/confidence-layer";
import { tryCreateServiceClient, type Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GLPM_LEAGUE_META } from "@/lib/glpm/live-scores/league-meta";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";
import {
  DEFAULT_SHARP_ALPHAS,
  EMPTY_SHARP_SHRINK,
  type GlpmSharpShrinkConfig,
} from "@/lib/glpm/market-models";
import {
  getDefaultMarketModelsConfig,
  mergeMarketModelsConfig,
} from "@/lib/world-cup/market-models/defaults";
import type { MarketModelsConfig } from "@/lib/world-cup/market-models/types";

export type GlpmCalibrationConstants = {
  confidenceLayer: ConfidenceLayerConfig;
  modelVersion: string;
  marketModels: MarketModelsConfig;
  sharpShrink: GlpmSharpShrinkConfig;
  /**
   * Power tempering on published 1X2 (τ > 1 softens favorites in the WC/NL convention).
   * Double chance is recomputed from the tempered triple.
   */
  oneXTwoTemperature: number;
};

/** Default club 1X2 temperature - mild favorite softening. */
export const GLPM_1X2_TEMPERATURE_DEFAULT = 1.12;

export const GLPM_CALIBRATION_DEFAULTS: GlpmCalibrationConstants = {
  confidenceLayer: { ...EMPTY_CONFIDENCE_LAYER, markets: {} },
  modelVersion: "glpm_cx_v1.2",
  marketModels: getDefaultMarketModelsConfig(),
  sharpShrink: { ...EMPTY_SHARP_SHRINK },
  oneXTwoTemperature: GLPM_1X2_TEMPERATURE_DEFAULT,
};

export const GLPM_HOME_LEAGUE_IDS: number[] = [
  SM_LEAGUE.PREMIER_LEAGUE,
  SM_LEAGUE.CHAMPIONSHIP,
  SM_LEAGUE.EREDIVISIE,
  SM_LEAGUE.BUNDESLIGA,
  SM_LEAGUE.SERIE_A,
];

export function glpmConfidenceVersionPrefix(leagueSmId: number): string {
  const slug =
    GLPM_LEAGUE_META[leagueSmId]?.name
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || String(leagueSmId);
  return `glpm-${slug}-confidence`;
}

export function mergeGlpmCalibration(
  raw: Partial<GlpmCalibrationConstants> | Record<string, unknown> | null | undefined
): GlpmCalibrationConstants {
  if (!raw) {
    return {
      ...GLPM_CALIBRATION_DEFAULTS,
      confidenceLayer: { ...EMPTY_CONFIDENCE_LAYER, markets: {} },
      marketModels: getDefaultMarketModelsConfig(),
      sharpShrink: { ...EMPTY_SHARP_SHRINK },
      oneXTwoTemperature: GLPM_1X2_TEMPERATURE_DEFAULT,
    };
  }
  const sharpRaw = (raw as { sharpShrink?: GlpmSharpShrinkConfig }).sharpShrink;
  const tauRaw = Number(
    (raw as { oneXTwoTemperature?: number }).oneXTwoTemperature ??
      GLPM_1X2_TEMPERATURE_DEFAULT
  );
  return {
    modelVersion: String(raw.modelVersion ?? GLPM_CALIBRATION_DEFAULTS.modelVersion),
    confidenceLayer: mergeConfidenceLayer(
      raw.confidenceLayer as Partial<ConfidenceLayerConfig> | undefined
    ),
    marketModels: mergeMarketModelsConfig(
      (raw as { marketModels?: Partial<MarketModelsConfig> }).marketModels
    ),
    sharpShrink: {
      alphaByMarket: {
        ...DEFAULT_SHARP_ALPHAS,
        ...(sharpRaw?.alphaByMarket ?? {}),
      },
      updatedAt: String(sharpRaw?.updatedAt ?? ""),
      nSnapshots: Number(sharpRaw?.nSnapshots ?? 0) || 0,
    },
    oneXTwoTemperature:
      Number.isFinite(tauRaw) && tauRaw > 0 ? tauRaw : GLPM_1X2_TEMPERATURE_DEFAULT,
  };
}

export async function loadGlpmCalibrationConfig(
  leagueSmId: number,
  client?: SupabaseClient<Database> | null
): Promise<GlpmCalibrationConstants> {
  const supabase = client ?? tryCreateServiceClient();
  if (!supabase) return mergeGlpmCalibration(null);

  const { data, error } = await supabase
    .from("glpm_calibration_config")
    .select("constants")
    .eq("league_sm_id", leagueSmId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.constants) return mergeGlpmCalibration(null);
  return mergeGlpmCalibration(data.constants as Record<string, unknown>);
}

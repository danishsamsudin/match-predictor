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

export type GlpmCalibrationConstants = {
  confidenceLayer: ConfidenceLayerConfig;
  modelVersion: string;
};

export const GLPM_CALIBRATION_DEFAULTS: GlpmCalibrationConstants = {
  confidenceLayer: { ...EMPTY_CONFIDENCE_LAYER, markets: {} },
  modelVersion: "glpm_cx_v1",
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
  if (!raw) return { ...GLPM_CALIBRATION_DEFAULTS, confidenceLayer: { ...EMPTY_CONFIDENCE_LAYER, markets: {} } };
  return {
    modelVersion: String(raw.modelVersion ?? GLPM_CALIBRATION_DEFAULTS.modelVersion),
    confidenceLayer: mergeConfidenceLayer(
      raw.confidenceLayer as Partial<ConfidenceLayerConfig> | undefined
    ),
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

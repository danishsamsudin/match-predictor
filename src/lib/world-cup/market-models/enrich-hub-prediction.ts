import type { EstimatedMatchStats } from "@/lib/prediction/estimated-match-stats";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";
import {
  applyXgMarketBlend,
  resolveMarketModelsConfig,
} from "@/lib/world-cup/market-models/apply";
import { buildAnalyticsFromHubPrediction } from "@/lib/world-cup/graham-prediction-adapter";
import type { PredictionAnalytics } from "@/lib/types/prediction";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

function snapNum(snapshot: Record<string, unknown>, key: string, fallback = 0): number {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export type EnrichedHubPrediction = {
  hubRow: HubPredictionRow;
  analytics: PredictionAnalytics;
  displayHomeXg: number;
  displayAwayXg: number;
};

/**
 * Apply per-market ML calibration to a hub prediction row and persist display
 * values on the snapshot so hub cards and /predict share the same numbers.
 */
export function enrichHubPredictionWithMarketModels(input: {
  hubRow: HubPredictionRow;
  calibration: WcCalibrationConstants;
  homeName?: string;
  awayName?: string;
  analyticsContext?: WcPredictionAnalyticsContext;
  isKnockout?: boolean;
  estimated?: EstimatedMatchStats;
}): EnrichedHubPrediction {
  const homeName = input.homeName ?? "Home";
  const awayName = input.awayName ?? "Away";
  const analytics = buildAnalyticsFromHubPrediction(
    input.hubRow,
    homeName,
    awayName,
    input.analyticsContext,
    input.calibration
  );

  const marketModels = resolveMarketModelsConfig(input.calibration);
  const snap = { ...input.hubRow.snapshot };
  const structuralHomeXg = snapNum(snap, "home_xg", snapNum(snap, "lambda", 1.25));
  const structuralAwayXg = snapNum(snap, "away_xg", snapNum(snap, "mu", 1.25));

  const formHome =
    input.analyticsContext != null
      ? undefined
      : analytics.formScores.homePct / 100;
  const formAway =
    input.analyticsContext != null
      ? undefined
      : analytics.formScores.awayPct / 100;

  const { homeXg: displayHomeXg, awayXg: displayAwayXg } = applyXgMarketBlend(
    structuralHomeXg,
    structuralAwayXg,
    snap,
    marketModels,
    formHome ?? analytics.formScores.homePct / 100,
    formAway ?? analytics.formScores.awayPct / 100,
    analytics.momentumIndex
  );

  const ou25 = analytics.overUnder.find((l) => l.line === 2.5);
  const over25 = ou25 ? ou25.overPct / 100 : input.hubRow.over_2_5_pct;
  const under25 = ou25 ? ou25.underPct / 100 : input.hubRow.under_2_5_pct;

  const enrichedSnapshot: Record<string, unknown> = {
    ...snap,
    structural_home_xg: structuralHomeXg,
    structural_away_xg: structuralAwayXg,
    display_home_xg: Math.round(displayHomeXg * 100) / 100,
    display_away_xg: Math.round(displayAwayXg * 100) / 100,
    btts_pct: analytics.btts.yesPct,
    btts_yes_odds: analytics.btts.yesOdds ?? null,
    btts_no_odds: analytics.btts.noOdds ?? null,
    over_2_5_odds: ou25?.overOdds ?? null,
    under_2_5_odds: ou25?.underOdds ?? null,
    market_models_applied: true,
    market_models_version: input.calibration.modelVersion,
    estimated_stats: input.estimated ?? snap.estimated_stats ?? null,
  };

  const enrichedHubRow: HubPredictionRow = {
    ...input.hubRow,
    over_2_5_pct: Number(over25.toFixed(4)),
    under_2_5_pct: Number(under25.toFixed(4)),
    snapshot: enrichedSnapshot,
  };

  return {
    hubRow: enrichedHubRow,
    analytics,
    displayHomeXg,
    displayAwayXg,
  };
}

/** Apply market-model enrichment to a raw DB row before hub card parsing. */
export function enrichRawHubPredictionRow(
  raw: Record<string, unknown> | null | undefined,
  calibration: WcCalibrationConstants
): Record<string, unknown> | null {
  if (!raw) return null;
  const snapshot = (raw.snapshot as Record<string, unknown>) ?? {};
  const hubRow: HubPredictionRow = {
    home_win_pct: Number(raw.home_win_pct),
    draw_pct: Number(raw.draw_pct),
    away_win_pct: Number(raw.away_win_pct),
    predicted_score_home: Number(raw.predicted_score_home),
    predicted_score_away: Number(raw.predicted_score_away),
    under_2_5_pct: Number(raw.under_2_5_pct),
    over_2_5_pct: Number(raw.over_2_5_pct),
    model_version: String(raw.model_version ?? calibration.modelVersion),
    snapshot,
  };
  if (![hubRow.home_win_pct, hubRow.draw_pct, hubRow.away_win_pct].every(Number.isFinite)) {
    return raw;
  }

  const enriched = enrichHubPredictionWithMarketModels({ hubRow, calibration });
  return {
    ...raw,
    over_2_5_pct: enriched.hubRow.over_2_5_pct,
    under_2_5_pct: enriched.hubRow.under_2_5_pct,
    snapshot: enriched.hubRow.snapshot,
  };
}

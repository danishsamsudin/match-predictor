import { applyLineupImpactToHubPrediction } from "@/lib/world-cup/apply-wc-lineup-impact";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { INTERNATIONAL_BASE_GOALS } from "@/lib/world-cup/international-strength";
import {
  resolveWcLineupPlayerStats,
  unresolvedWcLineupPlayerNames,
} from "@/lib/world-cup/resolve-wc-lineup-player-stats";
import { resolveWcModelStartingXi } from "@/lib/world-cup/resolve-wc-model-starting-xi";
import { computeWcLineupPlayerXgImpact } from "@/lib/world-cup/wc-lineup-player-xg-impact";
import { computeRotationIndicesForFixture } from "@/lib/world-cup/wc-rotation-intensity";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import type { SupabaseClient } from "@supabase/supabase-js";

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

/** Project Model Squad XI and apply WC lineup impact when validation passes. */
export async function applyWcModelXiToHubPrediction(input: {
  supabase: SupabaseClient;
  hubRow: HubPredictionRow;
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeTeamName?: string;
  awayTeamName?: string;
  calibration?: WcCalibrationConstants;
}): Promise<HubPredictionRow> {
  const [homeXi, awayXi] = await Promise.all([
    resolveWcModelStartingXi({
      supabase: input.supabase,
      teamApiId: input.homeTeamApiId,
      teamName: input.homeTeamName,
    }),
    resolveWcModelStartingXi({
      supabase: input.supabase,
      teamApiId: input.awayTeamApiId,
      teamName: input.awayTeamName,
    }),
  ]);

  const homeNames = homeXi.playerNames;
  const awayNames = awayXi.playerNames;

  const snapshot = { ...input.hubRow.snapshot } as Record<string, unknown>;
  const opta = { ...((snapshot.opta_features as Record<string, unknown>) ?? {}) };
  opta.model_xi_source_home = homeXi.source;
  opta.model_xi_source_away = awayXi.source;
  opta.model_xi_coverage_home = homeXi.coverage.matched;
  opta.model_xi_coverage_away = awayXi.coverage.matched;
  if (homeXi.warnings.length || awayXi.warnings.length) {
    opta.model_xi_warnings = [...homeXi.warnings, ...awayXi.warnings];
  }

  const skipLineup =
    homeNames.length < 11 ||
    awayNames.length < 11 ||
    !homeXi.validation.hasGoalkeeper ||
    !awayXi.validation.hasGoalkeeper;

  if (skipLineup) {
    snapshot.opta_features = opta;
    return { ...input.hubRow, snapshot };
  }

  const [homePlayers, awayPlayers] = await Promise.all([
    resolveWcLineupPlayerStats({
      supabase: input.supabase,
      teamApiId: input.homeTeamApiId,
      playerNames: homeNames,
    }),
    resolveWcLineupPlayerStats({
      supabase: input.supabase,
      teamApiId: input.awayTeamApiId,
      playerNames: awayNames,
    }),
  ]);

  const unresolved = [
    ...unresolvedWcLineupPlayerNames(homeNames, homePlayers),
    ...unresolvedWcLineupPlayerNames(awayNames, awayPlayers),
  ];
  if (unresolved.length) {
    opta.lineup_unresolved_players = unresolved;
  }

  const rotation = await computeRotationIndicesForFixture({
    supabase: input.supabase,
    homeTeamApiId: input.homeTeamApiId,
    awayTeamApiId: input.awayTeamApiId,
    homeProjectedXi: homeNames,
    awayProjectedXi: awayNames,
  });
  Object.assign(opta, rotation);

  const baseHomeXg = snapshotNumber(snapshot, "home_xg", "lambda");
  const baseAwayXg = snapshotNumber(snapshot, "away_xg", "mu");

  const lineup = computeWcLineupPlayerXgImpact({
    homePlayers,
    awayPlayers,
    baseHomeXg,
    baseAwayXg,
    mu: INTERNATIONAL_BASE_GOALS,
    calibration: input.calibration,
    mode: "model_xi",
  });

  const adjusted = applyLineupImpactToHubPrediction(input.hubRow, lineup);
  return {
    ...adjusted,
    snapshot: {
      ...adjusted.snapshot,
      opta_features: {
        ...((adjusted.snapshot.opta_features as Record<string, unknown>) ?? {}),
        ...opta,
      },
    },
  };
}

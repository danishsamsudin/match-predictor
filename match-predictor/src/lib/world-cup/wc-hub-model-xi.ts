import { projectWcModelXiFromSofifa } from "@/lib/data/load-sofifa-wc-squad-for-comparison";
import { resolveWc2026TeamLabel } from "@/lib/data/world-cup-2026-official-squads";
import { applyLineupImpactToHubPrediction } from "@/lib/world-cup/apply-wc-lineup-impact";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { INTERNATIONAL_BASE_GOALS } from "@/lib/world-cup/international-strength";
import {
  projectWcModelXiFromLastStarters,
  resolveWcLineupPlayerStats,
} from "@/lib/world-cup/resolve-wc-lineup-player-stats";
import { computeWcLineupPlayerXgImpact } from "@/lib/world-cup/wc-lineup-player-xg-impact";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import type { SupabaseClient } from "@supabase/supabase-js";

async function projectWcModelXiNames(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  teamName?: string;
}): Promise<string[]> {
  const teamLabel = resolveWc2026TeamLabel(input.teamName, input.teamApiId);
  if (teamLabel) {
    const fromSofifa = await projectWcModelXiFromSofifa({
      supabase: input.supabase,
      teamApiId: input.teamApiId,
      teamLabel,
      teamName: input.teamName,
    });
    if (fromSofifa.length >= 11) return fromSofifa;
  }
  return projectWcModelXiFromLastStarters({
    supabase: input.supabase,
    teamApiId: input.teamApiId,
  });
}

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

/** Project SoFIFA HTML starters (fallback: last Opta match) and apply WC lineup impact. */
export async function applyWcModelXiToHubPrediction(input: {
  supabase: SupabaseClient;
  hubRow: HubPredictionRow;
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeTeamName?: string;
  awayTeamName?: string;
  calibration?: WcCalibrationConstants;
}): Promise<HubPredictionRow> {
  const [homeNames, awayNames] = await Promise.all([
    projectWcModelXiNames({
      supabase: input.supabase,
      teamApiId: input.homeTeamApiId,
      teamName: input.homeTeamName,
    }),
    projectWcModelXiNames({
      supabase: input.supabase,
      teamApiId: input.awayTeamApiId,
      teamName: input.awayTeamName,
    }),
  ]);

  if (!homeNames.length && !awayNames.length) return input.hubRow;

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

  const baseHomeXg = snapshotNumber(input.hubRow.snapshot, "home_xg", "lambda");
  const baseAwayXg = snapshotNumber(input.hubRow.snapshot, "away_xg", "mu");

  const lineup = computeWcLineupPlayerXgImpact({
    homePlayers,
    awayPlayers,
    baseHomeXg,
    baseAwayXg,
    mu: INTERNATIONAL_BASE_GOALS,
    calibration: input.calibration,
    mode: "model_xi",
  });

  return applyLineupImpactToHubPrediction(input.hubRow, lineup);
}

import { applyLineupImpactToHubPrediction } from "@/lib/world-cup/apply-wc-lineup-impact";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { INTERNATIONAL_BASE_GOALS } from "@/lib/world-cup/international-strength";
import {
  resolveWcLineupPlayerStats,
  unresolvedWcLineupPlayerNames,
  type WcLineupPlayerStatsMap,
} from "@/lib/world-cup/resolve-wc-lineup-player-stats";
import { resolveWcModelStartingXi } from "@/lib/world-cup/resolve-wc-model-starting-xi";
import { computeWcLineupPlayerXgImpact } from "@/lib/world-cup/wc-lineup-player-xg-impact";
import { computeRotationIndicesForFixture } from "@/lib/world-cup/wc-rotation-intensity";
import {
  isPlayerNameSuspended,
  loadWcSuspendedPlayerNamesForTeam,
} from "@/lib/world-cup/wc-tournament-discipline";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { SupabaseClient } from "@supabase/supabase-js";

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

function downgradeSuspendedInPlayerMap(
  players: WcLineupPlayerStatsMap,
  suspendedNames: Set<string>
): WcLineupPlayerStatsMap {
  if (!suspendedNames.size) return players;
  const next: WcLineupPlayerStatsMap = { ...players };
  for (const [key, player] of Object.entries(next)) {
    if (isPlayerNameSuspended(player.playerName, suspendedNames)) {
      next[key] = {
        ...player,
        availabilityFactor: Math.min(player.availabilityFactor, 0.5),
        isStarter: false,
      };
    }
  }
  return next;
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
  finishedMatches?: WcMatchRow[];
  upcomingMatchDate?: string | null;
}): Promise<HubPredictionRow> {
  const finishedMatches = input.finishedMatches ?? [];
  const beforeDate = input.upcomingMatchDate ?? null;

  const [homeSuspended, awaySuspended] = await Promise.all([
    loadWcSuspendedPlayerNamesForTeam({
      supabase: input.supabase,
      teamApiId: input.homeTeamApiId,
      finishedMatches,
      beforeDate,
    }),
    loadWcSuspendedPlayerNamesForTeam({
      supabase: input.supabase,
      teamApiId: input.awayTeamApiId,
      finishedMatches,
      beforeDate,
    }),
  ]);

  const [homeXi, awayXi] = await Promise.all([
    resolveWcModelStartingXi({
      supabase: input.supabase,
      teamApiId: input.homeTeamApiId,
      teamName: input.homeTeamName,
      excludedPlayerNames: homeSuspended,
    }),
    resolveWcModelStartingXi({
      supabase: input.supabase,
      teamApiId: input.awayTeamApiId,
      teamName: input.awayTeamName,
      excludedPlayerNames: awaySuspended,
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
  if (homeSuspended.size) {
    opta.home_suspended_players = [...homeSuspended];
  }
  if (awaySuspended.size) {
    opta.away_suspended_players = [...awaySuspended];
  }
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

  const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
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

  const homePlayers = downgradeSuspendedInPlayerMap(homePlayersRaw, homeSuspended);
  const awayPlayers = downgradeSuspendedInPlayerMap(awayPlayersRaw, awaySuspended);

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

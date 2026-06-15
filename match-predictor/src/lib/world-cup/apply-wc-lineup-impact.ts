import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { INTERNATIONAL_XG_FLOOR } from "@/lib/world-cup/international-strength";
import { outcomesFromGuardedGrid } from "@/lib/world-cup/score-grid";
import type { LineupImpactResult } from "@/lib/types/prediction";

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

/** Apply manual-XI player-xG multipliers to a Graham hub prediction and recompute outcomes. */
export function applyLineupImpactToHubPrediction(
  hubRow: HubPredictionRow,
  lineup: LineupImpactResult
): HubPredictionRow {
  const snap = hubRow.snapshot;
  const baseHomeXg = snapshotNumber(snap, "home_xg", "lambda");
  const baseAwayXg = snapshotNumber(snap, "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");

  let homeXg = baseHomeXg * lineup.homeXgMultiplier;
  let awayXg = baseAwayXg * lineup.awayXgMultiplier;
  awayXg *= lineup.homeDefenseMultiplier ?? 1;
  homeXg *= lineup.awayDefenseMultiplier ?? 1;

  homeXg = Math.max(INTERNATIONAL_XG_FLOOR, Math.round(homeXg * 100) / 100);
  awayXg = Math.max(INTERNATIONAL_XG_FLOOR, Math.round(awayXg * 100) / 100);

  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw);

  return {
    ...hubRow,
    home_win_pct: Number(outcomes.homeWin.toFixed(4)),
    draw_pct: Number(outcomes.draw.toFixed(4)),
    away_win_pct: Number(outcomes.awayWin.toFixed(4)),
    predicted_score_home: outcomes.predictedHome,
    predicted_score_away: outcomes.predictedAway,
    under_2_5_pct: Number(outcomes.under25.toFixed(4)),
    over_2_5_pct: Number(outcomes.over25.toFixed(4)),
    snapshot: {
      ...snap,
      home_xg: homeXg,
      away_xg: awayXg,
      lambda: homeXg,
      mu: awayXg,
      base_home_xg: baseHomeXg,
      base_away_xg: baseAwayXg,
      lineup_home_xg_mult: lineup.homeXgMultiplier,
      lineup_away_xg_mult: lineup.awayXgMultiplier,
      lineup_home_defense_mult: lineup.homeDefenseMultiplier,
      lineup_away_defense_mult: lineup.awayDefenseMultiplier,
    },
  };
}

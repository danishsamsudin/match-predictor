import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";
import { swapTeamComparisonSides } from "@/lib/prediction/align-player-props-orientation";

function swapSnapshotHomeAway(snapshot: Record<string, unknown>): Record<string, unknown> {
  const next = { ...snapshot };
  const pairs: [string, string][] = [
    ["home_xg", "away_xg"],
    ["lambda", "mu"],
    ["gamma_home", "gamma_away"],
    ["home_xg_elo", "away_xg_elo"],
    ["home_wctr", "away_wctr"],
    ["home_attack", "away_attack"],
    ["home_defense", "away_defense"],
  ];

  for (const [homeKey, awayKey] of pairs) {
    const homeVal = next[homeKey];
    const awayVal = next[awayKey];
    if (homeVal === undefined && awayVal === undefined) continue;
    next[homeKey] = awayVal;
    next[awayKey] = homeVal;
  }

  return next;
}

export function swapHubPredictionRow(pred: HubPredictionRow): HubPredictionRow {
  return {
    ...pred,
    home_win_pct: pred.away_win_pct,
    away_win_pct: pred.home_win_pct,
    predicted_score_home: pred.predicted_score_away,
    predicted_score_away: pred.predicted_score_home,
    snapshot: swapSnapshotHomeAway(pred.snapshot),
  };
}

export function swapWcAnalyticsContext(
  context: WcPredictionAnalyticsContext
): WcPredictionAnalyticsContext {
  return {
    homeFormScore: context.awayFormScore,
    awayFormScore: context.homeFormScore,
    h2hHomeWinRate: context.h2hAwayWinRate,
    h2hDrawRate: context.h2hDrawRate,
    h2hAwayWinRate: context.h2hHomeWinRate,
    statComparison: context.statComparison.map((row) => ({
      ...row,
      home: row.away,
      away: row.home,
    })),
    teamComparison: swapTeamComparisonSides(context.teamComparison),
  };
}

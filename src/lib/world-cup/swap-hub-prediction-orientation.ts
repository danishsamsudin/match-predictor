import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";
import { swapTeamComparisonSides } from "@/lib/prediction/align-player-props-orientation";

const HOME_AWAY_SWAP_PAIRS: [string, string][] = [
  ["home_xg", "away_xg"],
  ["display_home_xg", "display_away_xg"],
  ["structural_home_xg", "structural_away_xg"],
  ["lambda", "mu"],
  ["gamma_home", "gamma_away"],
  ["home_xg_elo", "away_xg_elo"],
  ["home_wctr", "away_wctr"],
  ["home_attack", "away_attack"],
  ["home_defense", "away_defense"],
  ["home_sci", "away_sci"],
  ["home_ssi", "away_ssi"],
  ["home_talent_eur", "away_talent_eur"],
  ["home_fifa_pts", "away_fifa_pts"],
  ["home_talent_source", "away_talent_source"],
  ["home_form_fallback", "away_form_fallback"],
  ["home_form_match_count", "away_form_match_count"],
  ["sigma_home", "sigma_away"],
  ["delta_final_home", "delta_final_away"],
  ["finishing_regression_home", "finishing_regression_away"],
  ["wc_attack_nudge_home", "wc_attack_nudge_away"],
  ["wc_form_home_matches", "wc_form_away_matches"],
  ["home_avg_chance_index", "away_avg_chance_index"],
  ["home_avg_defensive_solidity", "away_avg_defensive_solidity"],
  ["home_team_api_id", "away_team_api_id"],
  ["lineup_home_xg_mult", "lineup_away_xg_mult"],
  ["lineup_home_defense_mult", "lineup_away_defense_mult"],
  ["motivation_sigma_home", "motivation_sigma_away"],
  ["rotation_index_home", "rotation_index_away"],
];

const SIGNED_NEGATE_KEYS = [
  "delta_xg_elo",
  "delta_talent",
  "delta_tournament",
  "delta_recent_form",
  "delta_fifa",
  "delta_s",
  "momentum_index",
  "process_delta_s",
  "opta_delta_s",
  "motivation_sigma_diff",
  "motivation_rho_offset",
  "wide_play_index",
];

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function swapPair(record: Record<string, unknown>, homeKey: string, awayKey: string): void {
  const homeVal = record[homeKey];
  const awayVal = record[awayKey];
  if (homeVal === undefined && awayVal === undefined) return;
  record[homeKey] = awayVal;
  record[awayKey] = homeVal;
}

function negateSigned(record: Record<string, unknown>, key: string): void {
  const v = num(record[key]);
  if (v != null) record[key] = -v;
}

function swapNestedDiffs(obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!obj) return obj;
  const next = { ...obj };
  for (const [key, val] of Object.entries(next)) {
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    if (key.endsWith("_diff") || key === "wide_play_index") {
      next[key] = -val;
    }
    if (key.endsWith("_home") && typeof next[key.replace("_home", "_away")] === "number") {
      // handled by explicit pairs below
    }
  }
  swapPair(next, "rotation_index_home", "rotation_index_away");
  swapPair(next, "low_block_index_home", "low_block_index_away");
  swapPair(next, "lineup_impact_home", "lineup_impact_away");
  negateSigned(next, "motivation_sigma_diff");
  return next;
}

/** Swap home/away orientation on a locked prediction snapshot for display-aligned scoring. */
export function swapSnapshotHomeAway(snapshot: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...snapshot };

  for (const [homeKey, awayKey] of HOME_AWAY_SWAP_PAIRS) {
    swapPair(next, homeKey, awayKey);
  }

  for (const key of SIGNED_NEGATE_KEYS) {
    negateSigned(next, key);
  }

  if (typeof next.host_nation_boost === "number") {
    next.host_nation_boost = 1;
  }
  if (typeof next.host_motivation_home === "number") {
    next.host_motivation_home = 1;
  }

  if (next.opta_features && typeof next.opta_features === "object") {
    next.opta_features = swapNestedDiffs(next.opta_features as Record<string, unknown>);
  }
  if (next.process_features && typeof next.process_features === "object") {
    next.process_features = swapNestedDiffs(next.process_features as Record<string, unknown>);
  }
  if (next.motivation_features && typeof next.motivation_features === "object") {
    next.motivation_features = swapNestedDiffs(next.motivation_features as Record<string, unknown>);
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

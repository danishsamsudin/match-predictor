/**
 * Chapter 2.7 tactical style labels — metric-derived facts, not ratings.
 */

export const STYLE_THRESHOLD_VERSION = "v1";

export type StyleMetrics = {
  possessionAvg: number | null;
  ppdaAvg: number | null;
  directnessAvg: number | null;
  crossesPer90?: number | null;
  setPieceXgShare?: number | null;
};

export type StyleLabel =
  | "high_possession"
  | "low_possession"
  | "high_press"
  | "mid_block"
  | "low_block"
  | "counter_attacking"
  | "direct_play"
  | "crossing_oriented"
  | "set_piece_reliant"
  | "build_up_play";

const T = {
  highPossession: 55,
  lowPossession: 42,
  highPressPpda: 9,
  midBlockPpdaLow: 9,
  midBlockPpdaHigh: 14,
  lowBlockPpda: 14,
  directness: 0.35,
  crossingPer90: 18,
  setPieceShare: 0.28,
} as const;

export function classifyStyleLabels(metrics: StyleMetrics): StyleLabel[] {
  const labels: StyleLabel[] = [];
  const { possessionAvg: poss, ppdaAvg: ppda, directnessAvg: direct } = metrics;

  if (poss != null) {
    if (poss >= T.highPossession) labels.push("high_possession");
    if (poss <= T.lowPossession) labels.push("low_possession");
  }

  if (ppda != null) {
    if (ppda <= T.highPressPpda) labels.push("high_press");
    else if (ppda > T.midBlockPpdaLow && ppda <= T.midBlockPpdaHigh) labels.push("mid_block");
    else if (ppda > T.lowBlockPpda) labels.push("low_block");
  }

  if (poss != null && poss <= T.lowPossession && (direct == null || direct >= T.directness)) {
    labels.push("counter_attacking");
  }

  if (direct != null && direct >= T.directness) labels.push("direct_play");
  if (direct != null && direct < T.directness && poss != null && poss >= T.highPossession) {
    labels.push("build_up_play");
  }

  if (metrics.crossesPer90 != null && metrics.crossesPer90 >= T.crossingPer90) {
    labels.push("crossing_oriented");
  }
  if (metrics.setPieceXgShare != null && metrics.setPieceXgShare >= T.setPieceShare) {
    labels.push("set_piece_reliant");
  }

  return [...new Set(labels)];
}

export function buildStyleSnapshotRow(args: {
  teamSmId: number;
  seasonId: number;
  asOfDate: string;
  asOfMatchSmId?: number | null;
  metrics: StyleMetrics;
}) {
  return {
    team_sm_id: args.teamSmId,
    season_id: args.seasonId,
    as_of_match_sm_id: args.asOfMatchSmId ?? null,
    as_of_date: args.asOfDate,
    style_labels: classifyStyleLabels(args.metrics),
    possession_avg: args.metrics.possessionAvg,
    ppda_avg: args.metrics.ppdaAvg,
    directness_avg: args.metrics.directnessAvg,
    threshold_version: STYLE_THRESHOLD_VERSION,
    metrics: args.metrics as unknown,
    synced_at: new Date().toISOString(),
  };
}

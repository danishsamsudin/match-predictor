/**
 * Chapter 2.7 tactical style labels — metric-derived facts, not ratings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";

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

function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000;
}

/** Season-to-date (or last N) style averages from Layer-1 match stats. */
export async function upsertStyleSnapshotsForSeason(
  supabase: SupabaseClient<Database>,
  args: {
    seasonId: number;
    asOfDate?: string;
    lastN?: number;
  }
): Promise<{ teams: number }> {
  const lastN = args.lastN ?? 10;
  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id, match_date, home_score, away_score")
    .eq("season_id", args.seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("match_date", { ascending: true });
  if (matchErr) throw new Error(`load matches for style: ${matchErr.message}`);
  if (!matches?.length) return { teams: 0 };

  const matchIds = matches.map((m) => m.sm_id);
  const { data: stats, error: statsErr } = await supabase
    .from("glpm_match_team_stats")
    .select("match_sm_id, team_sm_id, possession_pct, ppda, progressive_passes, passes")
    .in("match_sm_id", matchIds);
  if (statsErr) throw new Error(`load stats for style: ${statsErr.message}`);

  const dateByMatch = new Map(matches.map((m) => [m.sm_id, m.match_date as string]));
  const byTeam = new Map<
    number,
    Array<{
      matchSmId: number;
      matchDate: string;
      possession: number | null;
      ppda: number | null;
      directness: number | null;
    }>
  >();

  for (const row of stats ?? []) {
    const matchDate = dateByMatch.get(row.match_sm_id);
    if (!matchDate) continue;
    const prog = row.progressive_passes;
    const passes = row.passes;
    const directness =
      prog != null && passes != null && passes > 0 ? prog / passes : null;
    const list = byTeam.get(row.team_sm_id) ?? [];
    list.push({
      matchSmId: row.match_sm_id,
      matchDate,
      possession: row.possession_pct != null ? Number(row.possession_pct) : null,
      ppda: row.ppda != null ? Number(row.ppda) : null,
      directness,
    });
    byTeam.set(row.team_sm_id, list);
  }

  const asOfDate =
    args.asOfDate ??
    matches[matches.length - 1]?.match_date ??
    new Date().toISOString().slice(0, 10);

  const rows = [];
  for (const [teamSmId, history] of byTeam) {
    history.sort((a, b) => a.matchDate.localeCompare(b.matchDate));
    const window = history.slice(-lastN);
    const last = window[window.length - 1];
    rows.push(
      buildStyleSnapshotRow({
        teamSmId,
        seasonId: args.seasonId,
        asOfDate,
        asOfMatchSmId: last?.matchSmId ?? null,
        metrics: {
          possessionAvg: mean(window.map((h) => h.possession)),
          ppdaAvg: mean(window.map((h) => h.ppda)),
          directnessAvg: mean(window.map((h) => h.directness)),
        },
      })
    );
  }

  if (!rows.length) return { teams: 0 };
  const { error: upsertErr } = await supabase
    .from("glpm_team_style_snapshots")
    .upsert(rows, { onConflict: "team_sm_id,season_id,as_of_date" });
  if (upsertErr) throw new Error(`upsert style snapshots: ${upsertErr.message}`);
  return { teams: rows.length };
}


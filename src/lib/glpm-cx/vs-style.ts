/**
 * Writer + aggregator for glpm_match_vs_style (style-vs-style lift).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { GlpmMatchVsStyleTable } from "@/lib/glpm/types";

type Client = SupabaseClient<Database>;
type VsStyleInsert = GlpmMatchVsStyleTable["Insert"];

export type MatchVsStyleStatSlice = {
  xg?: number | null;
  xg_conceded?: number | null;
  shots?: number | null;
  ppda?: number | null;
  field_tilt?: number | null;
  metrics?: unknown;
};

export type VsStyleLiftRow = {
  style: string;
  liftPct: number;
  n: number;
  meanXgFor: number;
  overallMeanXgFor: number;
};

function uniqStyles(styles: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of styles) {
    const s = String(raw ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Build upsert rows: one row per (team, opponent_style) for the match.
 * homeOppStyles = away team's style labels; awayOppStyles = home team's labels.
 */
export function buildMatchVsStyleRows(
  matchSmId: number,
  homeTeamSmId: number,
  awayTeamSmId: number,
  homeStats: MatchVsStyleStatSlice,
  awayStats: MatchVsStyleStatSlice,
  homeOppStyles: string[],
  awayOppStyles: string[]
): VsStyleInsert[] {
  const syncedAt = new Date().toISOString();
  const rows: VsStyleInsert[] = [];

  for (const opponent_style of uniqStyles(homeOppStyles)) {
    rows.push({
      match_sm_id: matchSmId,
      team_sm_id: homeTeamSmId,
      opponent_style,
      xg_for: homeStats.xg ?? null,
      xg_against: homeStats.xg_conceded ?? awayStats.xg ?? null,
      shots: homeStats.shots ?? null,
      ppda: homeStats.ppda ?? null,
      field_tilt: homeStats.field_tilt ?? null,
      metrics: homeStats.metrics ?? null,
      synced_at: syncedAt,
    });
  }

  for (const opponent_style of uniqStyles(awayOppStyles)) {
    rows.push({
      match_sm_id: matchSmId,
      team_sm_id: awayTeamSmId,
      opponent_style,
      xg_for: awayStats.xg ?? null,
      xg_against: awayStats.xg_conceded ?? homeStats.xg ?? null,
      shots: awayStats.shots ?? null,
      ppda: awayStats.ppda ?? null,
      field_tilt: awayStats.field_tilt ?? null,
      metrics: awayStats.metrics ?? null,
      synced_at: syncedAt,
    });
  }

  return rows;
}

export async function upsertMatchVsStyle(
  client: Client,
  rows: VsStyleInsert[]
): Promise<{ upserted: number; error: string | null }> {
  if (!rows.length) return { upserted: 0, error: null };
  const { error } = await client.from("glpm_match_vs_style").upsert(rows, {
    onConflict: "match_sm_id,team_sm_id,opponent_style",
  });
  if (error) return { upserted: 0, error: error.message };
  return { upserted: rows.length, error: null };
}

/**
 * For each opponent_style, mean xg_for vs overall mean → lift pct and sample size.
 * Season filter is applied by loading finished match ids for the season.
 */
export async function aggregateVsStyleLift(
  client: Client,
  teamSmId: number,
  seasonId: number
): Promise<VsStyleLiftRow[]> {
  const { data: matches } = await client
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(500);

  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) return [];

  const { data: rows } = await client
    .from("glpm_match_vs_style")
    .select("opponent_style,xg_for,match_sm_id")
    .eq("team_sm_id", teamSmId)
    .in("match_sm_id", matchIds);

  const xgs = (rows ?? [])
    .map((r) => (r.xg_for != null ? Number(r.xg_for) : null))
    .filter((v): v is number => v != null && Number.isFinite(v));

  if (!xgs.length) return [];

  const overallMeanXgFor = xgs.reduce((a, b) => a + b, 0) / xgs.length;

  const byStyle = new Map<string, number[]>();
  for (const row of rows ?? []) {
    if (row.xg_for == null || !Number.isFinite(Number(row.xg_for))) continue;
    const style = String(row.opponent_style ?? "").trim();
    if (!style) continue;
    const list = byStyle.get(style) ?? [];
    list.push(Number(row.xg_for));
    byStyle.set(style, list);
  }

  const out: VsStyleLiftRow[] = [];
  for (const [style, vals] of byStyle) {
    const meanXgFor = vals.reduce((a, b) => a + b, 0) / vals.length;
    const liftPct =
      overallMeanXgFor > 0
        ? ((meanXgFor - overallMeanXgFor) / overallMeanXgFor) * 100
        : 0;
    out.push({
      style,
      liftPct: Math.round(liftPct * 10) / 10,
      n: vals.length,
      meanXgFor: Math.round(meanXgFor * 1000) / 1000,
      overallMeanXgFor: Math.round(overallMeanXgFor * 1000) / 1000,
    });
  }

  return out.sort((a, b) => b.liftPct - a.liftPct);
}

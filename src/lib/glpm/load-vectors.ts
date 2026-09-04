/**
 * Load GLPM rating vectors and related rows from Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { GlpmRatingDimensionMetadata } from "@/lib/glpm/types";
import {
  PRIMARY_ORDER,
  type PrimaryKey,
  type RatingVectorInput,
} from "@/lib/glpm/engine";
import { classifyStyleLabels } from "@/lib/glpm/layer2/styleSnapshots";

type Client = SupabaseClient<Database>;

export type LoadedRatingVector = {
  teamSmId: number;
  seasonId: number;
  asOfDate: string;
  ratings: Record<PrimaryKey, number>;
  metadata: Partial<Record<PrimaryKey, GlpmRatingDimensionMetadata>>;
  modelVersion: string;
  teamName: string | null;
};

function rowToRatings(row: {
  r_attack: number | null;
  r_defence: number | null;
  r_goalkeeper: number | null;
  r_build_up: number | null;
  r_possession: number | null;
  r_pressing: number | null;
  r_finishing: number | null;
}): Record<PrimaryKey, number> {
  const map: Record<PrimaryKey, number | null> = {
    attack: row.r_attack,
    defence: row.r_defence,
    goalkeeper: row.r_goalkeeper,
    build_up: row.r_build_up,
    possession: row.r_possession,
    pressing: row.r_pressing,
    finishing: row.r_finishing,
  };
  const out = {} as Record<PrimaryKey, number>;
  for (const key of PRIMARY_ORDER) {
    const v = map[key];
    out[key] = v != null && Number.isFinite(Number(v)) ? Number(v) : 60;
  }
  return out;
}

export function toRatingVectorInput(
  loaded: LoadedRatingVector
): RatingVectorInput {
  return { ...loaded.ratings };
}

export async function loadLatestRatingVector(
  client: Client,
  opts: { teamSmId: number; seasonId?: number | null }
): Promise<LoadedRatingVector | null> {
  let q = client
    .from("glpm_team_rating_vectors")
    .select("*")
    .eq("team_sm_id", opts.teamSmId)
    .order("as_of_date", { ascending: false })
    .limit(1);
  if (opts.seasonId != null) {
    q = q.eq("season_id", opts.seasonId);
  }
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;

  const { data: team } = await client
    .from("glpm_teams")
    .select("name")
    .eq("sm_id", opts.teamSmId)
    .maybeSingle();

  return {
    teamSmId: data.team_sm_id,
    seasonId: data.season_id,
    asOfDate: data.as_of_date,
    ratings: rowToRatings(data),
    metadata: (data.metadata ?? {}) as Partial<
      Record<PrimaryKey, GlpmRatingDimensionMetadata>
    >,
    modelVersion: data.model_version,
    teamName: team?.name ?? null,
  };
}

export type LoadedStyleSnapshot = {
  style_labels: string[] | null;
  possession_avg: number | null;
  ppda_avg: number | null;
  directness_avg: number | null;
};

function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000;
}

function coerceStyleRow(data: {
  style_labels: unknown;
  possession_avg: number | null;
  ppda_avg: number | null;
  directness_avg: number | null;
} | null): LoadedStyleSnapshot | null {
  if (!data) return null;
  const labels = Array.isArray(data.style_labels)
    ? data.style_labels.filter(
        (l): l is string => typeof l === "string" && l.trim().length > 0
      )
    : [];
  return {
    style_labels: labels,
    possession_avg:
      data.possession_avg != null ? Number(data.possession_avg) : null,
    ppda_avg: data.ppda_avg != null ? Number(data.ppda_avg) : null,
    directness_avg:
      data.directness_avg != null ? Number(data.directness_avg) : null,
  };
}

function snapshotHasStyleSignal(row: LoadedStyleSnapshot | null): boolean {
  if (!row) return false;
  const labels = Array.isArray(row.style_labels) ? row.style_labels.length : 0;
  return (
    labels > 0 ||
    row.possession_avg != null ||
    row.ppda_avg != null
  );
}

async function loadStyleFromMatchStats(
  client: Client,
  opts: { teamSmId: number; seasonId?: number | null }
): Promise<LoadedStyleSnapshot | null> {
  let stats: Array<{
    possession_pct: number | null;
    ppda: number | null;
    progressive_passes: number | null;
    passes: number | null;
  }> = [];

  if (opts.seasonId != null) {
    const { data: matches } = await client
      .from("glpm_matches")
      .select("sm_id")
      .eq("season_id", opts.seasonId)
      .not("home_score", "is", null)
      .not("away_score", "is", null);
    const matchIds = (matches ?? []).map((m) => m.sm_id);
    if (matchIds.length) {
      const { data } = await client
        .from("glpm_match_team_stats")
        .select("possession_pct,ppda,progressive_passes,passes")
        .eq("team_sm_id", opts.teamSmId)
        .in("match_sm_id", matchIds.slice(0, 500));
      stats = data ?? [];
    }
  }

  if (!stats.length) {
    const { data } = await client
      .from("glpm_match_team_stats")
      .select("possession_pct,ppda,progressive_passes,passes")
      .eq("team_sm_id", opts.teamSmId)
      .limit(80);
    stats = data ?? [];
  }

  const possessionAvg = mean(stats.map((r) => r.possession_pct));
  const ppdaAvg = mean(stats.map((r) => r.ppda));
  const directnessAvg = mean(
    stats.map((r) => {
      const prog = r.progressive_passes;
      const passes = r.passes;
      if (prog == null || passes == null || passes <= 0) return null;
      return prog / passes;
    })
  );
  if (possessionAvg == null && ppdaAvg == null) return null;
  return {
    style_labels: classifyStyleLabels({
      possessionAvg,
      ppdaAvg,
      directnessAvg,
    }),
    possession_avg: possessionAvg,
    ppda_avg: ppdaAvg,
    directness_avg: directnessAvg,
  };
}

export async function loadStyleSnapshot(
  client: Client,
  opts: { teamSmId: number; seasonId?: number | null }
): Promise<LoadedStyleSnapshot | null> {
  let q = client
    .from("glpm_team_style_snapshots")
    .select("style_labels,possession_avg,ppda_avg,directness_avg")
    .eq("team_sm_id", opts.teamSmId)
    .order("as_of_date", { ascending: false })
    .limit(1);
  if (opts.seasonId != null) {
    q = q.eq("season_id", opts.seasonId);
  }
  const { data } = await q.maybeSingle();
  let row = coerceStyleRow(data);
  if (!snapshotHasStyleSignal(row) && opts.seasonId != null) {
    const { data: fallback } = await client
      .from("glpm_team_style_snapshots")
      .select("style_labels,possession_avg,ppda_avg,directness_avg")
      .eq("team_sm_id", opts.teamSmId)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = coerceStyleRow(fallback);
  }
  if (snapshotHasStyleSignal(row)) return row;
  return loadStyleFromMatchStats(client, opts);
}

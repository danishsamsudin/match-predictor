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

export async function loadStyleSnapshot(
  client: Client,
  opts: { teamSmId: number; seasonId?: number | null }
) {
  let q = client
    .from("glpm_team_style_snapshots")
    .select("*")
    .eq("team_sm_id", opts.teamSmId)
    .order("as_of_date", { ascending: false })
    .limit(1);
  if (opts.seasonId != null) {
    q = q.eq("season_id", opts.seasonId);
  }
  const { data } = await q.maybeSingle();
  return data;
}

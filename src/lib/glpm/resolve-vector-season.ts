/**
 * Load latest rating vectors for a season and detect calibrator collapse.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  seasonVectorsAreCollapsed,
  type PrimaryVectorRow,
} from "@/lib/glpm/rating-discrimination";
import { TRAIN_FALLBACK_BY_LEAGUE } from "@/lib/glpm/resolve-train-season";

type Client = SupabaseClient<Database>;

const VECTOR_SPREAD_SELECT =
  "team_sm_id,r_attack,r_defence,r_build_up,r_possession,r_pressing,r_finishing,as_of_date";

/**
 * Latest vector row per team for a season (by as_of_date desc).
 */
export async function loadLatestSeasonVectorRows(
  client: Client,
  seasonId: number
): Promise<PrimaryVectorRow[]> {
  const { data, error } = await client
    .from("glpm_team_rating_vectors")
    .select(VECTOR_SPREAD_SELECT)
    .eq("season_id", seasonId)
    .order("as_of_date", { ascending: false });
  if (error || !data?.length) return [];

  const latest = new Map<number, PrimaryVectorRow>();
  for (const row of data) {
    const id = Number(row.team_sm_id);
    if (!Number.isFinite(id) || latest.has(id)) continue;
    latest.set(id, row);
  }
  return [...latest.values()];
}

export async function seasonHasCollapsedVectors(
  client: Client,
  seasonId: number
): Promise<boolean> {
  const rows = await loadLatestSeasonVectorRows(client, seasonId);
  // Fewer than 2 teams ⇒ no usable league table (empty or purged).
  if (rows.length < 2) return true;
  return seasonVectorsAreCollapsed(rows);
}

/**
 * Prefer the requested season when its primaries separate clubs; otherwise
 * fall back to the mapped prior season (or null if none).
 */
export async function resolveVectorSeasonId(
  client: Client,
  preferredSeasonId: number,
  competitionId?: number | null
): Promise<{ seasonId: number; collapsedPreferred: boolean }> {
  const collapsed = await seasonHasCollapsedVectors(client, preferredSeasonId);
  if (!collapsed) {
    return { seasonId: preferredSeasonId, collapsedPreferred: false };
  }
  const fallback =
    competitionId != null ? TRAIN_FALLBACK_BY_LEAGUE[competitionId] ?? null : null;
  if (fallback != null && fallback !== preferredSeasonId) {
    const fallbackCollapsed = await seasonHasCollapsedVectors(client, fallback);
    if (!fallbackCollapsed) {
      return { seasonId: fallback, collapsedPreferred: true };
    }
  }
  return { seasonId: preferredSeasonId, collapsedPreferred: true };
}

/**
 * True when a prior-season bracket would duplicate the main line because
 * predict already borrowed that prior season's vectors (collapse fallback).
 */
export function priorSeasonCompareIsRedundant(opts: {
  vectorSeasonId: number | null | undefined;
  priorSeasonId: number | null | undefined;
}): boolean {
  const { vectorSeasonId, priorSeasonId } = opts;
  if (vectorSeasonId == null || priorSeasonId == null) return false;
  return vectorSeasonId === priorSeasonId;
}

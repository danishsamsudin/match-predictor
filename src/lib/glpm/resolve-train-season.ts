/**
 * Pick which season historical stats / training should read from.
 *
 * Rating engines switch to the current season as soon as it has any finished
 * match (minFinished = 1). CX satellites wait until the Bayesian sample-size
 * floor (matches_used / 20) so early 2026/27 rounds still use 2025/26 rates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { SM_LEAGUE, SM_SEASON_2025_26 } from "@/lib/sportmonks/constants";

type Client = SupabaseClient<Database>;

/** Same n as core/bayesian.py confidence_from_state: clip(matches_used / 20, ...). */
export const GLPM_BAYESIAN_MATCH_CONFIDENCE_N = 20;

/** Engines retrain on the preferred season after any finished match. */
export const GLPM_ENGINE_TRAIN_MIN_FINISHED = 1;

export const TRAIN_FALLBACK_BY_LEAGUE: Partial<Record<number, number>> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: SM_SEASON_2025_26.PREMIER_LEAGUE,
};

export type ResolveTrainSeasonResult = {
  seasonId: number;
  reason: string;
  preferredFinished: number;
};

export function pickStatsSeasonId(opts: {
  preferredSeasonId: number;
  preferredFinishedCount: number;
  fallbackSeasonId: number | null;
  minFinished?: number;
}): { seasonId: number; reason: string } {
  const min = opts.minFinished ?? GLPM_BAYESIAN_MATCH_CONFIDENCE_N;
  if (opts.preferredFinishedCount >= min) {
    return { seasonId: opts.preferredSeasonId, reason: "preferred_has_finished" };
  }
  if (opts.fallbackSeasonId != null && opts.fallbackSeasonId !== opts.preferredSeasonId) {
    return {
      seasonId: opts.fallbackSeasonId,
      reason: `fallback_${opts.fallbackSeasonId}`,
    };
  }
  return { seasonId: opts.preferredSeasonId, reason: "preferred_no_finished_yet" };
}

export async function countFinishedMatches(
  client: Client,
  seasonId: number
): Promise<number> {
  const { count, error } = await client
    .from("glpm_matches")
    .select("sm_id", { count: "exact", head: true })
    .eq("season_id", seasonId)
    .not("home_score", "is", null);
  if (error) return 0;
  return count ?? 0;
}

export async function seasonHasFinishedMatches(
  client: Client,
  seasonId: number
): Promise<boolean> {
  return (await countFinishedMatches(client, seasonId)) > 0;
}

/**
 * Pick train / stats season: preferred if it has enough finished matches,
 * else mapped prior season, else latest finished season in the same competition.
 */
export async function resolveTrainSeasonId(
  client: Client,
  preferredSeasonId: number,
  leagueId?: number | null,
  opts?: { minFinished?: number }
): Promise<ResolveTrainSeasonResult> {
  const minFinished = opts?.minFinished ?? GLPM_ENGINE_TRAIN_MIN_FINISHED;
  const preferredFinished = await countFinishedMatches(client, preferredSeasonId);
  if (preferredFinished >= minFinished) {
    return {
      seasonId: preferredSeasonId,
      reason: "preferred_has_finished",
      preferredFinished,
    };
  }

  const mappedFallback =
    leagueId != null ? TRAIN_FALLBACK_BY_LEAGUE[leagueId] : undefined;
  if (
    mappedFallback != null &&
    (await countFinishedMatches(client, mappedFallback)) >= Math.min(minFinished, 1)
  ) {
    return {
      seasonId: mappedFallback,
      reason: `fallback_${mappedFallback}`,
      preferredFinished,
    };
  }

  const { data: seasons } = await client
    .from("glpm_seasons")
    .select("sm_id,competition_id,start_date")
    .order("start_date", { ascending: false });

  const preferredMeta = (seasons ?? []).find((s) => s.sm_id === preferredSeasonId);
  const competitionId = preferredMeta?.competition_id ?? leagueId ?? null;
  const pool =
    competitionId != null
      ? (seasons ?? []).filter((s) => s.competition_id === competitionId)
      : (seasons ?? []);

  for (const s of pool) {
    if (s.sm_id === preferredSeasonId) continue;
    const n = await countFinishedMatches(client, s.sm_id);
    if (n >= Math.min(minFinished, 1) && n > 0) {
      return {
        seasonId: s.sm_id,
        reason: `latest_finished_${s.sm_id}`,
        preferredFinished,
      };
    }
  }

  return {
    seasonId: preferredSeasonId,
    reason: "preferred_no_finished_yet",
    preferredFinished,
  };
}

/** CX / satellite historical stats: wait for the Bayesian n=20 floor. */
export async function resolveStatsSeasonId(
  client: Client,
  preferredSeasonId: number,
  leagueId?: number | null
): Promise<ResolveTrainSeasonResult & { mlEligible: boolean }> {
  const picked = await resolveTrainSeasonId(client, preferredSeasonId, leagueId, {
    minFinished: GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
  });
  return {
    ...picked,
    mlEligible:
      picked.seasonId === preferredSeasonId &&
      picked.preferredFinished >= GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
  };
}

/**
 * Detect newly promoted (or newly arrived) clubs in a season and build
 * a promotion prior rating vector when second-tier history is missing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import type { LoadedRatingVector } from "@/lib/glpm/load-vectors";
import {
  PROMOTION_PRIOR_ANCHOR,
} from "@/lib/glpm/league-strength";

type Client = SupabaseClient<Database>;

export const PROMOTION_PRIOR_MODEL = "glpm_promotion_prior_v1";

export type SeasonCompetitionRef = {
  smId: number;
  competitionId: number;
  /** ISO date string when available; used to pick the previous season. */
  startDate?: string | null;
};

/** Pick the most recent prior season in the same competition. */
export function pickPriorSeasonId(
  seasons: SeasonCompetitionRef[],
  competitionId: number,
  currentSeasonId: number
): number | null {
  const candidates = seasons
    .filter(
      (s) => s.competitionId === competitionId && s.smId !== currentSeasonId
    )
    .slice()
    .sort((a, b) => {
      const da = a.startDate ?? "";
      const db = b.startDate ?? "";
      if (da && db) return db.localeCompare(da);
      return b.smId - a.smId;
    });
  return candidates[0]?.smId ?? null;
}

/** Flat lower-table prior used when a promoted side has no usable vector. */
export function buildPromotionPriorVector(opts: {
  teamSmId: number;
  seasonId: number;
  asOfDate?: string;
  teamName?: string | null;
  rating?: number;
}): LoadedRatingVector {
  const rating = opts.rating ?? PROMOTION_PRIOR_ANCHOR;
  const ratings = {} as Record<PrimaryKey, number>;
  for (const key of PRIMARY_ORDER) ratings[key] = rating;
  return {
    teamSmId: opts.teamSmId,
    seasonId: opts.seasonId,
    asOfDate: opts.asOfDate ?? new Date().toISOString().slice(0, 10),
    ratings,
    metadata: {},
    modelVersion: PROMOTION_PRIOR_MODEL,
    teamName: opts.teamName ?? null,
  };
}

/**
 * Teams that appear in `currentTeamIds` but not in the immediately prior
 * season of the same competition (matches + standings).
 */
export async function loadPromotedTeamIds(
  client: Client,
  opts: {
    seasonId: number;
    competitionId: number;
    currentTeamIds: Iterable<number>;
    seasons: SeasonCompetitionRef[];
  }
): Promise<Set<number>> {
  const current = new Set(
    [...opts.currentTeamIds].filter((id) => Number.isFinite(id))
  );
  if (!current.size) return new Set();

  const priorSeasonId = pickPriorSeasonId(
    opts.seasons,
    opts.competitionId,
    opts.seasonId
  );
  if (priorSeasonId == null) return new Set();

  const priorTeams = await loadSeasonTeamIds(client, priorSeasonId);
  const promoted = new Set<number>();
  for (const id of current) {
    if (!priorTeams.has(id)) promoted.add(id);
  }
  return promoted;
}

async function loadSeasonTeamIds(
  client: Client,
  seasonId: number
): Promise<Set<number>> {
  const out = new Set<number>();

  // Prefer standings snapshot (small) before scanning every match row.
  const { data: standings } = await client
    .from("glpm_standings_current")
    .select("team_sm_id")
    .eq("season_id", seasonId);
  for (const row of standings ?? []) {
    out.add(row.team_sm_id);
  }
  if (out.size > 0) return out;

  const { data: matches } = await client
    .from("glpm_matches")
    .select("home_team_sm_id,away_team_sm_id")
    .eq("season_id", seasonId)
    .limit(800);
  for (const m of matches ?? []) {
    out.add(m.home_team_sm_id);
    out.add(m.away_team_sm_id);
  }

  return out;
}

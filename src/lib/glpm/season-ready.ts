/**
 * Pick GLPM seasons that actually have ingest and/or trained vectors.
 * Default predict/hub picker avoids future seasons that only have schedule
 * backfill when a finished / trained season is available. Fixture and home
 * standings callers use pickFixtureSeasonId to prefer upcoming seasons.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { seasonVectorsAreCollapsed } from "@/lib/glpm/rating-discrimination";

type Client = SupabaseClient<Database>;

export type GlpmSeasonRef = {
  smId: number;
  name: string | null;
  competitionId: number;
  /** ISO date when available; used for prior-season / ordering helpers. */
  startDate?: string | null;
};

export type GlpmSeasonReadiness = {
  hasVectors: boolean;
  hasFinishedMatches: boolean;
  hasUpcomingMatches: boolean;
  isPredictReady: boolean;
  /** Primaries separate clubs (not early-season calibrator collapse). */
  hasDiscriminatingVectors: boolean;
};

function emptyReadiness(): GlpmSeasonReadiness {
  return {
    hasVectors: false,
    hasFinishedMatches: false,
    hasUpcomingMatches: false,
    isPredictReady: false,
    hasDiscriminatingVectors: false,
  };
}

export async function loadGlpmSeasonReadiness(
  client: Client
): Promise<Map<number, GlpmSeasonReadiness>> {
  const map = new Map<number, GlpmSeasonReadiness>();

  const [{ data: vectorRows }, { data: finishedRows }, { data: upcomingRows }] =
    await Promise.all([
      client
        .from("glpm_team_rating_vectors")
        .select(
          "season_id,team_sm_id,r_attack,r_defence,r_build_up,r_possession,r_pressing,r_finishing,as_of_date"
        )
        .order("as_of_date", { ascending: false }),
      client
        .from("glpm_matches")
        .select("season_id")
        .not("home_score", "is", null)
        .limit(5000),
      client
        .from("glpm_matches")
        .select("season_id")
        .or("home_score.is.null,away_score.is.null")
        .limit(5000),
    ]);

  const latestBySeasonTeam = new Map<
    number,
    Map<
      number,
      {
        r_attack: number | null;
        r_defence: number | null;
        r_build_up: number | null;
        r_possession: number | null;
        r_pressing: number | null;
        r_finishing: number | null;
      }
    >
  >();
  for (const row of vectorRows ?? []) {
    const seasonId = row.season_id;
    const teamId = row.team_sm_id;
    let byTeam = latestBySeasonTeam.get(seasonId);
    if (!byTeam) {
      byTeam = new Map();
      latestBySeasonTeam.set(seasonId, byTeam);
    }
    if (byTeam.has(teamId)) continue;
    byTeam.set(teamId, row);
    const cur = map.get(seasonId) ?? emptyReadiness();
    cur.hasVectors = true;
    map.set(seasonId, cur);
  }

  for (const [seasonId, byTeam] of latestBySeasonTeam) {
    const cur = map.get(seasonId) ?? emptyReadiness();
    const discriminating = !seasonVectorsAreCollapsed([...byTeam.values()]);
    cur.hasDiscriminatingVectors = discriminating;
    cur.isPredictReady = discriminating;
    map.set(seasonId, cur);
  }

  for (const row of finishedRows ?? []) {
    if (row.season_id == null) continue;
    const cur = map.get(row.season_id) ?? emptyReadiness();
    cur.hasFinishedMatches = true;
    map.set(row.season_id, cur);
  }

  for (const row of upcomingRows ?? []) {
    if (row.season_id == null) continue;
    const cur = map.get(row.season_id) ?? emptyReadiness();
    cur.hasUpcomingMatches = true;
    map.set(row.season_id, cur);
  }

  return map;
}

/**
 * Seasons are assumed newest-first (start_date desc).
 * Prefer the latest season with discriminating vectors, else any vectors,
 * else upcoming fixtures, else finished matches.
 */
export function pickDefaultGlpmSeasonId(
  seasons: GlpmSeasonRef[],
  readiness: Map<number, GlpmSeasonReadiness>,
  competitionId?: number | null
): number | null {
  const pool =
    competitionId != null
      ? seasons.filter((s) => s.competitionId === competitionId)
      : seasons;
  if (!pool.length) return null;

  for (const s of pool) {
    if (readiness.get(s.smId)?.hasDiscriminatingVectors) return s.smId;
  }
  for (const s of pool) {
    if (readiness.get(s.smId)?.hasVectors) return s.smId;
  }
  for (const s of pool) {
    if (readiness.get(s.smId)?.hasUpcomingMatches) return s.smId;
  }
  for (const s of pool) {
    if (readiness.get(s.smId)?.hasFinishedMatches) return s.smId;
  }
  return null;
}

/**
 * Prefer seasons that still have open fixtures (home / upcoming previews).
 * Falls back to the default predict-ready season picker.
 */
export function pickFixtureSeasonId(
  seasons: GlpmSeasonRef[],
  readiness: Map<number, GlpmSeasonReadiness>,
  competitionId?: number | null
): number | null {
  const pool =
    competitionId != null
      ? seasons.filter((s) => s.competitionId === competitionId)
      : seasons;
  if (!pool.length) return null;

  for (const s of pool) {
    if (readiness.get(s.smId)?.hasUpcomingMatches) return s.smId;
  }
  return pickDefaultGlpmSeasonId(seasons, readiness, competitionId);
}

export function annotateSeasonReadiness(
  seasons: GlpmSeasonRef[],
  readiness: Map<number, GlpmSeasonReadiness>
) {
  return seasons.map((s) => {
    const r = readiness.get(s.smId);
    return {
      ...s,
      hasVectors: r?.hasVectors ?? false,
      hasFinishedMatches: r?.hasFinishedMatches ?? false,
      hasUpcomingMatches: r?.hasUpcomingMatches ?? false,
      isPredictReady: r?.isPredictReady ?? false,
      hasDiscriminatingVectors: r?.hasDiscriminatingVectors ?? false,
    };
  });
}

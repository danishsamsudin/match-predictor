/**
 * Pick GLPM seasons that actually have ingest and/or trained vectors.
 * Default predict/hub picker avoids future seasons that only have schedule
 * backfill when a finished / trained season is available. Fixture and home
 * standings callers use pickFixtureSeasonId to prefer upcoming seasons.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { seasonVectorsAreCollapsed } from "@/lib/glpm/rating-discrimination";
import { TRAIN_FALLBACK_BY_LEAGUE } from "@/lib/glpm/resolve-train-season";

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

  const [{ data: vectorRows }, { data: seasonRows }] = await Promise.all([
    client
      .from("glpm_team_rating_vectors")
      .select(
        "season_id,team_sm_id,r_attack,r_defence,r_build_up,r_possession,r_pressing,r_finishing,as_of_date"
      )
      .order("as_of_date", { ascending: false }),
    client.from("glpm_seasons").select("sm_id"),
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

  // Per-season head counts: a global limit(5000) on glpm_matches under-samples
  // finished seasons once the DB has more than ~max-rows finished fixtures,
  // which made home Top Teams fall back to early current-season vectors.
  const seasonIds = [
    ...new Set(
      (seasonRows ?? [])
        .map((s) => s.sm_id)
        .filter((id): id is number => typeof id === "number")
    ),
  ];
  await Promise.all(
    seasonIds.map(async (seasonId) => {
      const [{ count: finishedCount }, { count: upcomingCount }] =
        await Promise.all([
          client
            .from("glpm_matches")
            .select("sm_id", { count: "exact", head: true })
            .eq("season_id", seasonId)
            .not("home_score", "is", null),
          client
            .from("glpm_matches")
            .select("sm_id", { count: "exact", head: true })
            .eq("season_id", seasonId)
            .or("home_score.is.null,away_score.is.null"),
        ]);
      const cur = map.get(seasonId) ?? emptyReadiness();
      if ((finishedCount ?? 0) > 0) cur.hasFinishedMatches = true;
      if ((upcomingCount ?? 0) > 0) cur.hasUpcomingMatches = true;
      map.set(seasonId, cur);
    })
  );

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
 * Prefer a completed, discriminating season for cross-league rating snapshots.
 * Falls back to the mapped prior train season, then pickDefaultGlpmSeasonId.
 */
export function pickRatingSeasonId(
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
    const r = readiness.get(s.smId);
    if (
      r?.hasDiscriminatingVectors &&
      r.hasFinishedMatches &&
      !r.hasUpcomingMatches
    ) {
      return s.smId;
    }
  }

  // Early current seasons often look "predict-ready" after a few matchdays but
  // are too noisy for a cross-league Top Teams Snapshot. Prefer the mapped
  // prior season when it still has discriminating vectors.
  if (competitionId != null) {
    const fallback = TRAIN_FALLBACK_BY_LEAGUE[competitionId];
    if (
      fallback != null &&
      pool.some((s) => s.smId === fallback) &&
      readiness.get(fallback)?.hasDiscriminatingVectors
    ) {
      return fallback;
    }
  }

  for (const s of pool) {
    const r = readiness.get(s.smId);
    if (r?.hasDiscriminatingVectors && r.hasFinishedMatches) {
      return s.smId;
    }
  }

  return pickDefaultGlpmSeasonId(seasons, readiness, competitionId);
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

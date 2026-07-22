/**
 * Refresh materialized league standings (current + optional snapshot).
 * Intended for cron / GitHub Actions after match score ingest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { buildSeasonStandingsFromMatches } from "@/lib/glpm/build-season-standings";
import {
  attachPreviousRanks,
  resolvePreviousRanksForRefresh,
} from "@/lib/glpm/standings-movement";
import { DEFAULT_GLPM_SEASON_IDS_2026_27 } from "@/lib/sportmonks/constants";

type Client = SupabaseClient<Database>;

export type RefreshStandingsTrigger = "cron" | "github" | "manual" | "cli" | "schedule_refresh";

export type RefreshStandingsSeasonResult = {
  seasonId: number;
  teamCount: number;
  fingerprint: string;
  fingerprintChanged: boolean;
  snapshotWritten: boolean;
};

export type RefreshStandingsResult = {
  seasons: RefreshStandingsSeasonResult[];
  totals: {
    seasons: number;
    teamsUpserted: number;
    fingerprintsChanged: number;
  };
};

export async function refreshGlpmStandings(
  client: Client,
  opts?: {
    seasonIds?: number[];
    trigger?: RefreshStandingsTrigger;
    writeSnapshot?: boolean;
    dryRun?: boolean;
  }
): Promise<RefreshStandingsResult> {
  const seasonIds = opts?.seasonIds?.length
    ? opts.seasonIds
    : DEFAULT_GLPM_SEASON_IDS_2026_27;
  const trigger = opts?.trigger ?? "manual";
  const writeSnapshot = opts?.writeSnapshot !== false;
  const dryRun = opts?.dryRun === true;

  const seasons: RefreshStandingsSeasonResult[] = [];
  let teamsUpserted = 0;
  let fingerprintsChanged = 0;

  for (const seasonId of seasonIds) {
    const built = await buildSeasonStandingsFromMatches(client, seasonId);

    const { data: storedRows } = await client
      .from("glpm_standings_current")
      .select("team_sm_id,rank,previous_rank,results_fingerprint")
      .eq("season_id", seasonId);

    const storedByTeam = new Map<
      number,
      { rank: number; previousRank: number | null }
    >();
    let priorFingerprint: string | null = null;
    for (const row of storedRows ?? []) {
      storedByTeam.set(row.team_sm_id, {
        rank: row.rank,
        previousRank: row.previous_rank,
      });
      priorFingerprint = row.results_fingerprint;
    }

    // First materialization: treat as unchanged for arrows (no prior ranks).
    const effectiveChanged = priorFingerprint != null && priorFingerprint !== built.fingerprint;

    if (effectiveChanged) fingerprintsChanged += 1;

    const previousByTeam = resolvePreviousRanksForRefresh({
      currentRows: built.rows,
      storedByTeam,
      fingerprintChanged: effectiveChanged,
    });
    const rowsWithMovement = attachPreviousRanks(built.rows, previousByTeam);

    if (!dryRun) {
      const upsertPayload = rowsWithMovement.map((row) => ({
        season_id: seasonId,
        team_sm_id: row.teamSmId,
        rank: row.rank,
        previous_rank: row.previousRank ?? null,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goals_for: row.goalsFor,
        goals_against: row.goalsAgainst,
        goal_difference: row.goalDifference,
        points: row.points,
        form: row.form,
        results_fingerprint: built.fingerprint,
        computed_at: new Date().toISOString(),
      }));

      if (upsertPayload.length) {
        const { error } = await client
          .from("glpm_standings_current")
          .upsert(upsertPayload, { onConflict: "season_id,team_sm_id" });
        if (error) throw new Error(`standings upsert season ${seasonId}: ${error.message}`);
        teamsUpserted += upsertPayload.length;

        // Drop teams no longer in the season table (rare, but keeps PK set clean).
        const keepIds = new Set(upsertPayload.map((r) => r.team_sm_id));
        const staleIds = [...storedByTeam.keys()].filter((id) => !keepIds.has(id));
        if (staleIds.length) {
          await client
            .from("glpm_standings_current")
            .delete()
            .eq("season_id", seasonId)
            .in("team_sm_id", staleIds);
        }
      }

      if (writeSnapshot && (effectiveChanged || priorFingerprint == null)) {
        const { error: snapError } = await client.from("glpm_standings_snapshots").insert({
          season_id: seasonId,
          trigger,
          results_fingerprint: built.fingerprint,
          rows: rowsWithMovement,
        });
        if (snapError) {
          throw new Error(`standings snapshot season ${seasonId}: ${snapError.message}`);
        }
      }
    }

    seasons.push({
      seasonId,
      teamCount: built.rows.length,
      fingerprint: built.fingerprint,
      fingerprintChanged: effectiveChanged,
      snapshotWritten: !dryRun && writeSnapshot && (effectiveChanged || priorFingerprint == null),
    });
  }

  return {
    seasons,
    totals: {
      seasons: seasons.length,
      teamsUpserted,
      fingerprintsChanged,
    },
  };
}

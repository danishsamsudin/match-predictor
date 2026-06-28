import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSnapshotBatchSize,
  getSnapshotLeagueIds,
  getSnapshotMaxMatchesPerRun,
  isSupabaseDataStore,
} from "@/lib/config/data-source";
import {
  loadFixturesKickingOffOnUtcDate,
  loadSyncedBundleMatchIds,
} from "@/lib/data/football-store";
import { runPrediction } from "@/lib/prediction/engine";
import {
  buildLeagueSnapshotRow,
  finishPredictionSnapshotRun,
  persistPredictionSnapshot,
  startPredictionSnapshotRun,
} from "@/lib/prediction/persist-prediction-snapshot";
import { snapshotDateUtc } from "@/lib/prediction/snapshot-types";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { FixtureOption } from "@/lib/types/football-lookup";

export type LeagueSnapshotResult = {
  ok: boolean;
  snapshotDate: string;
  fixturesAttempted: number;
  snapshotsWritten: number;
  skippedNoBundle: number;
  errors: string[];
};

async function predictLeagueFixture(fixture: FixtureOption): Promise<{
  fixture: FixtureOption;
  result: Awaited<ReturnType<typeof runPrediction>> | null;
  error: string | null;
}> {
  try {
    const result = await runPrediction({
      mode: "fixture",
      lineupSource: "model_xi",
      matchId: fixture.id,
      homeTeamId: fixture.home.id,
      awayTeamId: fixture.away.id,
      homeLeagueId: fixture.league.id,
      awayLeagueId: fixture.league.id,
      entityType: "club",
      homeTeamName: fixture.home.name,
      awayTeamName: fixture.away.name,
      city: fixture.venueCity,
      matchDate: fixture.date.slice(0, 10),
    });
    return { fixture, result, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { fixture, result: null, error: message };
  }
}

export async function runLeaguePredictionSnapshots(options?: {
  client?: SupabaseClient;
  snapshotDate?: string;
  leagueIds?: number[];
}): Promise<LeagueSnapshotResult> {
  const snapshotDate = options?.snapshotDate ?? snapshotDateUtc();
  const errors: string[] = [];

  if (!isSupabaseDataStore()) {
    return {
      ok: false,
      snapshotDate,
      fixturesAttempted: 0,
      snapshotsWritten: 0,
      skippedNoBundle: 0,
      errors: ["DATA_SOURCE must be supabase for league snapshot cron (reads synced bundles)."],
    };
  }

  const client = options?.client ?? tryCreateServiceClient();
  if (!client) {
    return {
      ok: false,
      snapshotDate,
      fixturesAttempted: 0,
      snapshotsWritten: 0,
      skippedNoBundle: 0,
      errors: ["No Supabase service client"],
    };
  }

  const leagueIds = options?.leagueIds ?? getSnapshotLeagueIds();
  const maxMatches = getSnapshotMaxMatchesPerRun();
  const batchSize = getSnapshotBatchSize();

  const fixtures: FixtureOption[] = [];
  for (const leagueId of leagueIds) {
    try {
      const rows = await loadFixturesKickingOffOnUtcDate(leagueId, snapshotDate);
      fixtures.push(...rows);
    } catch (e) {
      errors.push(
        `League ${leagueId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const nowMs = Date.now();
  const upcoming = fixtures
    .filter((f) => new Date(f.date).getTime() > nowMs)
    .slice(0, maxMatches);

  const runId = await startPredictionSnapshotRun(client, "league", snapshotDate);

  if (upcoming.length === 0) {
    if (runId) {
      await finishPredictionSnapshotRun(client, runId, {
        status: "completed",
        fixtures_attempted: 0,
        snapshots_written: 0,
        errors,
      });
    }
    return {
      ok: errors.length === 0,
      snapshotDate,
      fixturesAttempted: 0,
      snapshotsWritten: 0,
      skippedNoBundle: 0,
      errors,
    };
  }

  const bundleIds = await loadSyncedBundleMatchIds(upcoming.map((f) => f.id));
  const withBundle = upcoming.filter((f) => bundleIds.has(f.id));
  const skippedNoBundle = upcoming.length - withBundle.length;

  let fixturesAttempted = 0;
  let snapshotsWritten = 0;

  for (let i = 0; i < withBundle.length; i += batchSize) {
    const batch = withBundle.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((fixture) => predictLeagueFixture(fixture)));

    for (const { fixture, result, error } of results) {
      fixturesAttempted += 1;
      if (error || !result) {
        errors.push(
          `${fixture.league.name} ${fixture.home.name} vs ${fixture.away.name}: ${error ?? "No result"}`
        );
        continue;
      }

      const row = buildLeagueSnapshotRow({
        fixture,
        result,
        source: "league_snapshot_cron",
        snapshotDate,
      });
      const persistErr = await persistPredictionSnapshot(client, row);
      if (persistErr) {
        errors.push(`${fixture.id}: ${persistErr}`);
      } else {
        snapshotsWritten += 1;
      }
    }
  }

  if (runId) {
    await finishPredictionSnapshotRun(client, runId, {
      status: errors.length && snapshotsWritten === 0 ? "failed" : "completed",
      fixtures_attempted: fixturesAttempted,
      snapshots_written: snapshotsWritten,
      errors,
    });
  }

  return {
    ok: snapshotsWritten > 0 || (fixturesAttempted === 0 && errors.length === 0),
    snapshotDate,
    fixturesAttempted,
    snapshotsWritten,
    skippedNoBundle,
    errors,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { tryCreateServiceClient } from "@/lib/supabase";
import { buildWorldCupHubPayload } from "@/lib/world-cup/hub-load";
import {
  assertManualRefreshAllowed,
  persistHubSnapshot,
  setHubRefreshRunning,
} from "@/lib/world-cup/hub-snapshot";
import { runWorldCupHubSync } from "@/lib/world-cup/run-world-cup-sync";

export type HubRefreshResult = {
  ok: boolean;
  updatedAt: string | null;
  matchesEnriched: number;
  predictionsUpserted: number;
  tournamentForecastUpdated: boolean;
  optaIngested: number;
  snapshotPersisted: boolean;
  errors: string[];
  retryAfterSeconds?: number;
};

function wcSnapshotDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

async function markRefreshFailed(client: SupabaseClient, errors: string[]): Promise<void> {
  await wcSnapshotDb(client)
    .from("world_cup_hub_snapshot")
    .update({
      refresh_status: "failed",
      refresh_errors: errors,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "latest");
}

/**
 * Full write path: ingest → predictions → forecast → build hub payload → persist snapshot.
 * Used by cron and the manual refresh button.
 */
export async function runWorldCupHubRefresh(
  source: "cron" | "manual"
): Promise<HubRefreshResult> {
  const client = tryCreateServiceClient();
  if (!client) {
    return {
      ok: false,
      updatedAt: null,
      matchesEnriched: 0,
      predictionsUpserted: 0,
      tournamentForecastUpdated: false,
      optaIngested: 0,
      snapshotPersisted: false,
      errors: ["No Supabase client"],
    };
  }

  if (source === "manual") {
    const allowed = await assertManualRefreshAllowed(client);
    if (!allowed.ok) {
      return {
        ok: false,
        updatedAt: null,
        matchesEnriched: 0,
        predictionsUpserted: 0,
        tournamentForecastUpdated: false,
        optaIngested: 0,
        snapshotPersisted: false,
        errors: [allowed.reason],
        retryAfterSeconds: allowed.retryAfterSeconds,
      };
    }
  }

  const runningErr = await setHubRefreshRunning(client);
  if (runningErr) {
    return {
      ok: false,
      updatedAt: null,
      matchesEnriched: 0,
      predictionsUpserted: 0,
      tournamentForecastUpdated: false,
      optaIngested: 0,
      snapshotPersisted: false,
      errors: [runningErr],
    };
  }

  const errors: string[] = [];

  try {
    const syncResult = await runWorldCupHubSync();
    errors.push(...syncResult.errors);

    const payload = await buildWorldCupHubPayload({ skipIngest: true });
    if (!payload) {
      errors.push("Failed to build hub payload after sync");
      await markRefreshFailed(client, errors);
      return {
        ok: false,
        updatedAt: null,
        matchesEnriched: syncResult.matchesEnriched,
        predictionsUpserted: syncResult.predictionsUpserted,
        tournamentForecastUpdated: syncResult.tournamentForecastUpdated,
        optaIngested: syncResult.optaIngested,
        snapshotPersisted: false,
        errors,
      };
    }

    const persistErr = await persistHubSnapshot(client, payload, source, errors);
    if (persistErr) {
      errors.push(`Snapshot persist failed: ${persistErr}`);
      await markRefreshFailed(client, errors);
      return {
        ok: false,
        updatedAt: payload.updatedAt,
        matchesEnriched: syncResult.matchesEnriched,
        predictionsUpserted: syncResult.predictionsUpserted,
        tournamentForecastUpdated: syncResult.tournamentForecastUpdated,
        optaIngested: syncResult.optaIngested,
        snapshotPersisted: false,
        errors,
      };
    }

    revalidatePath("/world-cup");
    revalidatePath("/api/world-cup");

    return {
      ok: errors.length === 0,
      updatedAt: payload.updatedAt,
      matchesEnriched: syncResult.matchesEnriched,
      predictionsUpserted: syncResult.predictionsUpserted,
      tournamentForecastUpdated: syncResult.tournamentForecastUpdated,
      optaIngested: syncResult.optaIngested,
      snapshotPersisted: true,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    await markRefreshFailed(client, errors);
    return {
      ok: false,
      updatedAt: null,
      matchesEnriched: 0,
      predictionsUpserted: 0,
      tournamentForecastUpdated: false,
      optaIngested: 0,
      snapshotPersisted: false,
      errors,
    };
  }
}

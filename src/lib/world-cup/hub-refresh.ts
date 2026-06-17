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

/** Only works inside a Next.js server context (API routes, cron). No-op from CLI scripts. */
function revalidateWorldCupPaths(): void {
  try {
    revalidatePath("/world-cup");
    revalidatePath("/api/world-cup");
  } catch {
    // e.g. wc-sync-cli — snapshot is already persisted; ISR cache is not available here.
  }
}

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
export async function executeWorldCupHubRefresh(
  source: "cron" | "manual" | "cli"
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

  const errors: string[] = [];

  try {
    const syncResult = await runWorldCupHubSync();
    errors.push(...syncResult.errors);

    const payload = await buildWorldCupHubPayload({ skipIngest: true, knockoutMode: "hub" });
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

    revalidateWorldCupPaths();

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

export type HubRefreshTriggerResult =
  | { ok: true }
  | { ok: false; reason: string; retryAfterSeconds?: number };

/** Pre-flight checks + mark running (for async manual refresh). */
export async function triggerWorldCupHubRefresh(): Promise<HubRefreshTriggerResult> {
  const client = tryCreateServiceClient();
  if (!client) {
    return { ok: false, reason: "No Supabase client" };
  }

  const allowed = await assertManualRefreshAllowed(client);
  if (!allowed.ok) {
    return {
      ok: false,
      reason: allowed.reason,
      retryAfterSeconds: allowed.retryAfterSeconds,
    };
  }

  const runningErr = await setHubRefreshRunning(client);
  if (runningErr) {
    return { ok: false, reason: runningErr };
  }

  return { ok: true };
}

export async function runWorldCupHubRefresh(
  source: "cron" | "manual" | "cli"
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

  return executeWorldCupHubRefresh(source);
}

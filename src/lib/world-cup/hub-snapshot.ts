import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { WorldCupHubPayload } from "@/lib/world-cup/hub-load";

/** Minimum gap between manual hub refreshes (10 minutes). */
export const HUB_MANUAL_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

/** ISR / page cache TTL — hub data changes at most once daily. */
export const HUB_PAGE_REVALIDATE_SECONDS = 3600;

export type HubRefreshStatus = "idle" | "running" | "failed";

export type HubSnapshotMeta = {
  computedAt: string | null;
  refreshStatus: HubRefreshStatus;
  lastManualRefreshAt: string | null;
  lastCronRefreshAt: string | null;
  refreshErrors: string[];
  canRefreshAt: string | null;
  cooldownSecondsRemaining: number;
};

type HubSnapshotRow = {
  computed_at: string;
  payload: WorldCupHubPayload;
  refresh_status: HubRefreshStatus;
  last_manual_refresh_at: string | null;
  last_cron_refresh_at: string | null;
  refresh_errors: string[] | null;
};

function wcSnapshotDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string
        ) => Promise<{
          data: Array<HubSnapshotRow | { id: string }> | null;
          error: { message: string } | null;
        }>;
      };
      upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

function cooldownMeta(lastManualRefreshAt: string | null): {
  canRefreshAt: string | null;
  cooldownSecondsRemaining: number;
} {
  if (!lastManualRefreshAt) {
    return { canRefreshAt: null, cooldownSecondsRemaining: 0 };
  }
  const lastMs = new Date(lastManualRefreshAt).getTime();
  const canAtMs = lastMs + HUB_MANUAL_REFRESH_COOLDOWN_MS;
  const remaining = Math.max(0, Math.ceil((canAtMs - Date.now()) / 1000));
  return {
    canRefreshAt: remaining > 0 ? new Date(canAtMs).toISOString() : null,
    cooldownSecondsRemaining: remaining,
  };
}

export function buildHubSnapshotMeta(row: HubSnapshotRow | null): HubSnapshotMeta {
  const lastManual = row?.last_manual_refresh_at ?? null;
  const { canRefreshAt, cooldownSecondsRemaining } = cooldownMeta(lastManual);
  return {
    computedAt: row?.computed_at ?? null,
    refreshStatus: row?.refresh_status ?? "idle",
    lastManualRefreshAt: lastManual,
    lastCronRefreshAt: row?.last_cron_refresh_at ?? null,
    refreshErrors: row?.refresh_errors ?? [],
    canRefreshAt,
    cooldownSecondsRemaining,
  };
}

export async function loadHubSnapshotPayload(): Promise<WorldCupHubPayload | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data, error } = await wcSnapshotDb(supabase)
    .from("world_cup_hub_snapshot")
    .select(
      "computed_at, payload, refresh_status, last_manual_refresh_at, last_cron_refresh_at, refresh_errors"
    )
    .eq("id", "latest");

  if (error || !data?.length) return null;
  const row = data[0] as HubSnapshotRow;
  return row.payload;
}

export async function loadHubSnapshotMeta(): Promise<HubSnapshotMeta> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return buildHubSnapshotMeta(null);
  }

  const { data } = await wcSnapshotDb(supabase)
    .from("world_cup_hub_snapshot")
    .select(
      "computed_at, payload, refresh_status, last_manual_refresh_at, last_cron_refresh_at, refresh_errors"
    )
    .eq("id", "latest");

  return buildHubSnapshotMeta((data?.[0] as HubSnapshotRow | undefined) ?? null);
}

export async function persistHubSnapshot(
  client: SupabaseClient,
  payload: WorldCupHubPayload,
  source: "cron" | "manual" | "cli",
  errors: string[] = []
): Promise<string | null> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: "latest",
    computed_at: payload.updatedAt || now,
    payload,
    refresh_status: "idle",
    refresh_errors: errors,
    updated_at: now,
  };
  if (source === "manual") row.last_manual_refresh_at = now;
  if (source === "cron") row.last_cron_refresh_at = now;

  const { error } = await wcSnapshotDb(client).from("world_cup_hub_snapshot").upsert(row);
  return error?.message ?? null;
}

export async function setHubRefreshRunning(client: SupabaseClient): Promise<string | null> {
  const { data } = await wcSnapshotDb(client)
    .from("world_cup_hub_snapshot")
    .select("id")
    .eq("id", "latest");

  if (!data?.length) return null;

  const { error } = await wcSnapshotDb(client)
    .from("world_cup_hub_snapshot")
    .update({
      refresh_status: "running",
      refresh_errors: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", "latest");
  return error?.message ?? null;
}

export async function assertManualRefreshAllowed(
  client: SupabaseClient
): Promise<{ ok: true } | { ok: false; reason: string; retryAfterSeconds?: number }> {
  const { data } = await wcSnapshotDb(client)
    .from("world_cup_hub_snapshot")
    .select("refresh_status, last_manual_refresh_at")
    .eq("id", "latest");

  const row = data?.[0] as
    | { refresh_status?: HubRefreshStatus; last_manual_refresh_at?: string | null }
    | undefined;
  if (row?.refresh_status === "running") {
    return { ok: false, reason: "A refresh is already in progress." };
  }

  const { cooldownSecondsRemaining } = cooldownMeta(row?.last_manual_refresh_at ?? null);
  if (cooldownSecondsRemaining > 0) {
    return {
      ok: false,
      reason: `Please wait before refreshing again.`,
      retryAfterSeconds: cooldownSecondsRemaining,
    };
  }

  return { ok: true };
}

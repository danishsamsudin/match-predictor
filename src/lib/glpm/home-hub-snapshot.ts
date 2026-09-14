/**
 * Precomputed GLPM home hub packs (per competition/season/kind).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GlpmHubPayload } from "@/lib/glpm/hub-types";
import { tryCreateServiceClient } from "@/lib/supabase";

export const GLPM_HOME_HUB_STALE_MS = 6 * 60 * 60 * 1000;

export type GlpmHomeHubKind = "fixtures" | "ratings";
export type GlpmHomeHubRefreshStatus = "idle" | "running" | "failed";

export type GlpmHomeHubSnapshotRow = {
  competition_sm_id: number;
  season_sm_id: number;
  kind: GlpmHomeHubKind;
  computed_at: string;
  payload: GlpmHubPayload;
  refresh_status: GlpmHomeHubRefreshStatus;
  refresh_errors: string[] | null;
};

function snapshotDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string | number) => {
          eq: (col: string, val: string | number) => {
            eq: (
              col: string,
              val: string | number
            ) => Promise<{
              data: GlpmHomeHubSnapshotRow[] | null;
              error: { message: string } | null;
            }>;
            in: (
              col: string,
              vals: number[]
            ) => Promise<{
              data: GlpmHomeHubSnapshotRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
        in: (
          col: string,
          vals: number[]
        ) => Promise<{
          data: GlpmHomeHubSnapshotRow[] | null;
          error: { message: string } | null;
        }>;
      };
      upsert: (
        row: Record<string, unknown> | Record<string, unknown>[],
        opts?: { onConflict?: string }
      ) => Promise<{ error: { message: string } | null }>;
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string | number) => {
          eq: (col: string, val: string | number) => {
            eq: (
              col: string,
              val: string | number
            ) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

export function isGlpmHomeHubStale(
  computedAt: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!computedAt) return true;
  const t = new Date(computedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > GLPM_HOME_HUB_STALE_MS;
}

export async function loadGlpmHomeHubSnapshot(
  client: SupabaseClient,
  input: {
    competitionSmId: number;
    seasonSmId: number;
    kind: GlpmHomeHubKind;
  }
): Promise<GlpmHomeHubSnapshotRow | null> {
  const { data, error } = await snapshotDb(client)
    .from("glpm_home_hub_snapshot")
    .select(
      "competition_sm_id, season_sm_id, kind, computed_at, payload, refresh_status, refresh_errors"
    )
    .eq("competition_sm_id", input.competitionSmId)
    .eq("season_sm_id", input.seasonSmId)
    .eq("kind", input.kind);

  if (error || !data?.length) return null;
  return data[0] as GlpmHomeHubSnapshotRow;
}

export async function loadGlpmHomeHubSnapshotsForCompetitions(
  client: SupabaseClient,
  competitionSmIds: number[]
): Promise<GlpmHomeHubSnapshotRow[]> {
  const ids = [...new Set(competitionSmIds.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return [];
  const { data, error } = await snapshotDb(client)
    .from("glpm_home_hub_snapshot")
    .select(
      "competition_sm_id, season_sm_id, kind, computed_at, payload, refresh_status, refresh_errors"
    )
    .in("competition_sm_id", ids);
  if (error || !data) return [];
  return data as GlpmHomeHubSnapshotRow[];
}

export async function upsertGlpmHomeHubSnapshot(
  client: SupabaseClient,
  input: {
    competitionSmId: number;
    seasonSmId: number;
    kind: GlpmHomeHubKind;
    payload: GlpmHubPayload;
    errors?: string[];
  }
): Promise<string | null> {
  const now = new Date().toISOString();
  const { error } = await snapshotDb(client).from("glpm_home_hub_snapshot").upsert(
    {
      competition_sm_id: input.competitionSmId,
      season_sm_id: input.seasonSmId,
      kind: input.kind,
      computed_at: input.payload.updatedAt || now,
      payload: input.payload,
      refresh_status: "idle",
      refresh_errors: input.errors ?? [],
      updated_at: now,
    },
    { onConflict: "competition_sm_id,season_sm_id,kind" }
  );
  return error?.message ?? null;
}

export async function markGlpmHomeHubRefreshRunning(
  client: SupabaseClient,
  input: {
    competitionSmId: number;
    seasonSmId: number;
    kind: GlpmHomeHubKind;
  }
): Promise<void> {
  await snapshotDb(client)
    .from("glpm_home_hub_snapshot")
    .update({
      refresh_status: "running",
      refresh_errors: [],
      updated_at: new Date().toISOString(),
    })
    .eq("competition_sm_id", input.competitionSmId)
    .eq("season_sm_id", input.seasonSmId)
    .eq("kind", input.kind);
}

export function tryHomeHubClient(): SupabaseClient | null {
  return tryCreateServiceClient();
}

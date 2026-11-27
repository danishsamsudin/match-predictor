/**
 * Hydrate a full GLPM-CX UI payload from same-day prediction history when present.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { GlpmCxPredictPayload } from "@/lib/glpm-cx/run-cx-predict";

type Client = SupabaseClient<Database>;

function startOfUtcDayIso(d = new Date()): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  ).toISOString();
}

function isFullUiPayload(value: unknown): value is GlpmCxPredictPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.base != null &&
    typeof v.base === "object" &&
    v.cx != null &&
    typeof v.cx === "object" &&
    v.insights != null &&
    typeof v.insights === "object" &&
    v.satellites != null &&
    typeof v.satellites === "object"
  );
}

/** Latest same-day CX history row with a stored full UI payload for this fixture. */
export async function loadSameDayCxUiPayload(
  client: Client,
  matchSmId: number
): Promise<GlpmCxPredictPayload | null> {
  if (!Number.isFinite(matchSmId) || matchSmId <= 0) return null;

  const { data, error } = await client
    .from("glpm_cx_prediction_history")
    .select("breakdown,executed_at")
    .eq("match_sm_id", matchSmId)
    .gte("executed_at", startOfUtcDayIso())
    .order("executed_at", { ascending: false })
    .limit(8);

  if (error || !data?.length) return null;

  for (const row of data) {
    const breakdown = row.breakdown as Record<string, unknown> | null;
    const ui = breakdown?.uiPayload;
    if (isFullUiPayload(ui)) {
      return {
        ...ui,
        predictionId: ui.predictionId ?? null,
        executedAt: ui.executedAt ?? row.executed_at ?? new Date().toISOString(),
      };
    }
  }

  return null;
}

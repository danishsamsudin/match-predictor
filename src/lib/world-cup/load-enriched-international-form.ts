import { loadProcessMetricsForTeam } from "@/lib/data/match-process-metrics";
import { tryCreateServiceClient } from "@/lib/supabase";
import { enrichFormMatchesWithProcessMetrics } from "@/lib/world-cup/enrich-form-process-metrics";
import {
  loadInternationalFormMatchesForTeam,
  type InternationalFormMatch,
} from "@/lib/world-cup/load-international-form";
import { mergeInternationalFormWithWcFinals } from "@/lib/world-cup/international-form-team-side";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { wcFinalsFormSlice } from "@/lib/world-cup/wc-finals-form";
import type { WcMatchRow } from "@/lib/world-cup/standings";

type ServiceClient = NonNullable<ReturnType<typeof tryCreateServiceClient>>;

/**
 * WC qualifiers / friendlies plus aligned finals fixtures, deduped and enriched
 * with process metrics (xG, shots, StatsBomb process payload).
 */
export async function loadEnrichedFormForTeam(
  supabase: ServiceClient,
  teamId: string,
  teamName: string,
  finishedMatches: WcMatchRow[]
): Promise<InternationalFormMatch[]> {
  const [form, metrics] = await Promise.all([
    loadInternationalFormMatchesForTeam(supabase, teamId, teamName, { limit: 60 }),
    loadProcessMetricsForTeam(supabase, resolveApiTeamId(teamId, teamName), 120),
  ]);

  const finalsSlice = wcFinalsFormSlice(teamId, finishedMatches, teamName);
  const merged = mergeInternationalFormWithWcFinals(form, finalsSlice);

  return enrichFormMatchesWithProcessMetrics(merged, metrics);
}

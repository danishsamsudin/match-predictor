/**
 * Persist / load glpm_daily_sync_windows rows for the SportMonks dispatcher.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import type { MatchdayWindowPlan } from "./matchday";

type Client = SupabaseClient<Database>;
type WindowRow = Database["public"]["Tables"]["glpm_daily_sync_windows"]["Row"];
type WindowUpdate = Database["public"]["Tables"]["glpm_daily_sync_windows"]["Update"];

export async function loadDailySyncWindow(
  client: Client,
  matchDate: string
): Promise<WindowRow | null> {
  const { data, error } = await client
    .from("glpm_daily_sync_windows")
    .select("*")
    .eq("match_date", matchDate)
    .maybeSingle();
  if (error) throw new Error(`loadDailySyncWindow: ${error.message}`);
  return data;
}

export async function upsertMorningWindow(
  client: Client,
  plan: MatchdayWindowPlan,
  morningSummary: unknown
): Promise<WindowRow> {
  const existing = await loadDailySyncWindow(client, plan.matchDate);
  const row = {
    match_date: plan.matchDate,
    time_zone: plan.timeZone,
    fixture_ids: plan.fixtureIds,
    first_kickoff_at: plan.firstKickoffAt,
    last_kickoff_at: plan.lastKickoffAt,
    lineup_due_at: plan.lineupDueAt,
    results_due_at: plan.resultsDueAt,
    refresh_due_at: plan.refreshDueAt,
    empty_matchday: plan.emptyMatchday,
    lineup_done: plan.emptyMatchday ? true : (existing?.lineup_done ?? false),
    results_done: plan.emptyMatchday ? true : (existing?.results_done ?? false),
    refresh_done: plan.emptyMatchday ? true : (existing?.refresh_done ?? false),
    lineup_confirmed_count: existing?.lineup_confirmed_count ?? 0,
    morning_summary: morningSummary as Database["public"]["Tables"]["glpm_daily_sync_windows"]["Insert"]["morning_summary"],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("glpm_daily_sync_windows")
    .upsert(row, { onConflict: "match_date" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertMorningWindow: ${error.message}`);
  return data;
}

export async function patchDailySyncWindow(
  client: Client,
  matchDate: string,
  patch: WindowUpdate
): Promise<WindowRow | null> {
  const { data, error } = await client
    .from("glpm_daily_sync_windows")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("match_date", matchDate)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`patchDailySyncWindow: ${error.message}`);
  return data;
}

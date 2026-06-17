import { extractMatchProcessMetrics } from "@/lib/api/sportapi/mappers";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";
import type { SportApiEvent, SportApiStatisticsResponse } from "@/lib/types/sportapi";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NationalMatchProcessRow = {
  event_id: number;
  source: string;
  match_date: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_xg: number | null;
  away_xg: number | null;
  home_shots: number | null;
  away_shots: number | null;
  home_sot: number | null;
  away_sot: number | null;
  competition_tier: number | null;
  payload?: Record<string, unknown> | null;
};

function eventDateIso(event: SportApiEvent): string | null {
  if (event.startTime) return event.startTime.slice(0, 10);
  if (event.startTimestamp) {
    return new Date(event.startTimestamp * 1000).toISOString().slice(0, 10);
  }
  return null;
}

function competitionLabel(event: SportApiEvent): string {
  return event.tournament?.uniqueTournament?.name ?? event.tournament?.name ?? "";
}

export function buildProcessMetricsRowFromStats(
  eventId: number,
  event: SportApiEvent,
  stats: SportApiStatisticsResponse,
  source = "sofascore"
): NationalMatchProcessRow | null {
  const metrics = extractMatchProcessMetrics(stats);
  const hasData =
    metrics.homeXg != null ||
    metrics.awayXg != null ||
    metrics.homeShots != null ||
    metrics.awayShots != null ||
    metrics.homeSot != null ||
    metrics.awaySot != null;
  if (!hasData) return null;

  const competition = competitionLabel(event);
  return {
    event_id: eventId,
    source,
    match_date: eventDateIso(event),
    home_team_id: event.homeTeam.id,
    away_team_id: event.awayTeam.id,
    home_xg: metrics.homeXg,
    away_xg: metrics.awayXg,
    home_shots: metrics.homeShots,
    away_shots: metrics.awayShots,
    home_sot: metrics.homeSot,
    away_sot: metrics.awaySot,
    competition_tier: internationalMatchTierWeight(competition),
    payload: { competition },
  };
}

export async function upsertNationalMatchProcessMetrics(
  supabase: SupabaseClient,
  row: NationalMatchProcessRow
): Promise<void> {
  await supabase.from("national_match_process_metrics").upsert(
    {
      ...row,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "event_id" }
  );
}

export async function upsertProcessMetricsFromStats(
  supabase: SupabaseClient,
  eventId: number,
  event: SportApiEvent,
  stats: SportApiStatisticsResponse
): Promise<boolean> {
  const row = buildProcessMetricsRowFromStats(eventId, event, stats);
  if (!row) return false;
  await upsertNationalMatchProcessMetrics(supabase, row);
  return true;
}

export async function loadProcessMetricsForTeam(
  supabase: SupabaseClient,
  teamId: number,
  limit = 80
): Promise<NationalMatchProcessRow[]> {
  const { data: homeRows } = await supabase
    .from("national_match_process_metrics")
    .select("*")
    .eq("home_team_id", teamId)
    .order("match_date", { ascending: false })
    .limit(limit);

  const { data: awayRows } = await supabase
    .from("national_match_process_metrics")
    .select("*")
    .eq("away_team_id", teamId)
    .order("match_date", { ascending: false })
    .limit(limit);

  const merged = [...(homeRows ?? []), ...(awayRows ?? [])] as NationalMatchProcessRow[];
  const byId = new Map<number, NationalMatchProcessRow>();
  for (const row of merged) {
    const existing = byId.get(row.event_id);
    if (!existing || (row.match_date ?? "") > (existing.match_date ?? "")) {
      byId.set(row.event_id, row);
    }
  }
  return [...byId.values()].sort((a, b) =>
    (b.match_date ?? "").localeCompare(a.match_date ?? "")
  );
}

/** Stable negative event_id for FBref-only rows (avoids SofaScore id collision). */
export function fbrefSyntheticEventId(fbrefMatchId: string): number {
  let hash = 0;
  for (let i = 0; i < fbrefMatchId.length; i++) {
    hash = (hash * 31 + fbrefMatchId.charCodeAt(i)) | 0;
  }
  return -Math.abs(hash || 1);
}

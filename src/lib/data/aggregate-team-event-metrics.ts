import { gatewayGetMatchStatistics } from "@/lib/api/football-gateway";
import { getRapidApiKey } from "@/lib/config/rapidapi";
import { readMatchStatValue } from "@/lib/api/sportapi/mappers";
import { loadRecentFormEvents, loadRecentFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
import { pickPreferredFormation } from "@/lib/data/formation-lineup";
import type { Database } from "@/lib/supabase";
import type {
  SportApiEvent,
  SportApiLineupsResponse,
  SportApiStatisticsResponse,
} from "@/lib/types/sportapi";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export interface AggregatedTeamEventMetrics {
  cornersPerGame: number | null;
  foulsPerGame: number | null;
  yellowCardsPerGame: number | null;
  redCardsPerGame: number | null;
  shotsOnTargetPerGame: number | null;
  preferredFormation: string | null;
  sampleSize: number;
}

function teamSideInEvent(
  event: SportApiEvent,
  teamId: number,
  teamName?: string
): "home" | "away" | null {
  if (event.homeTeam.id === teamId) return "home";
  if (event.awayTeam.id === teamId) return "away";
  if (!teamName) return null;
  const normalized = teamName.trim().toLowerCase();
  if (event.homeTeam.name.toLowerCase() === normalized) return "home";
  if (event.awayTeam.name.toLowerCase() === normalized) return "away";
  return null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadFinishedEventsForTeam(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName: string | undefined,
  limit: number
): Promise<SportApiEvent[]> {
  let events = (
    await loadRecentFormEvents(supabase, leagueId, teamId, teamName, limit)
  ).filter((event) => event.status?.type === "finished" || event.status?.type === "ended");

  if (!events.length) {
    events = (await loadRecentFormEventsForTeam(supabase, teamId, teamName, limit)).filter(
      (event) => event.status?.type === "finished" || event.status?.type === "ended"
    );
  }

  return events.slice(0, limit);
}

async function resolveStatsByEvent(
  supabase: ServiceClient,
  events: SportApiEvent[]
): Promise<Map<number, SportApiStatisticsResponse>> {
  const statsByEvent = new Map<number, SportApiStatisticsResponse>();
  if (!events.length) return statsByEvent;

  const eventIds = events.map((event) => event.id);
  const { data: statsRows } = await supabase
    .from("synced_event_statistics")
    .select("event_id, payload")
    .in("event_id", eventIds);

  for (const row of statsRows ?? []) {
    if (row.payload) statsByEvent.set(row.event_id, row.payload as SportApiStatisticsResponse);
  }

  if (!getRapidApiKey()) return statsByEvent;

  for (const event of events) {
    if (statsByEvent.has(event.id)) continue;
    try {
      const { data } = await gatewayGetMatchStatistics(event.id);
      if (data) statsByEvent.set(event.id, data);
    } catch {
      // skip events without live stats
    }
  }

  return statsByEvent;
}

/** Per-match averages from synced event statistics and lineups for one team. */
export async function aggregateTeamMetricsFromSyncedEvents(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName?: string,
  maxMatches = 10
): Promise<AggregatedTeamEventMetrics | null> {
  const pool = await loadFinishedEventsForTeam(
    supabase,
    leagueId,
    teamId,
    teamName,
    maxMatches * 3
  );
  if (!pool.length) return null;

  const statsByEvent = await resolveStatsByEvent(supabase, pool);
  const withStats = pool.filter((event) => statsByEvent.has(event.id));
  const events = (withStats.length ? withStats : pool).slice(0, maxMatches);

  if (!events.length) return null;

  const eventIds = events.map((event) => event.id);
  const { data: lineupRows } = await supabase
    .from("synced_event_lineups")
    .select("event_id, payload")
    .in("event_id", eventIds);

  const lineupsByEvent = new Map<number, SportApiLineupsResponse>();
  for (const row of lineupRows ?? []) {
    if (row.payload) lineupsByEvent.set(row.event_id, row.payload as SportApiLineupsResponse);
  }

  const corners: number[] = [];
  const fouls: number[] = [];
  const yellowCards: number[] = [];
  const redCards: number[] = [];
  const shotsOnTarget: number[] = [];
  const formations: string[] = [];

  for (const event of events) {
    const side = teamSideInEvent(event, teamId, teamName);
    if (!side) continue;

    const stats = statsByEvent.get(event.id);
    if (stats) {
      const cornerValue = readMatchStatValue(
        stats,
        ["Corner kicks", "Corners", "Corner Kicks", "corner kicks"],
        side
      );
      const foulValue = readMatchStatValue(stats, ["Fouls", "fouls"], side);
      const yellowValue = readMatchStatValue(
        stats,
        ["Yellow cards", "Yellow card", "Yellow Cards"],
        side
      );
      const redValue = readMatchStatValue(
        stats,
        ["Red cards", "Red card", "Red Cards"],
        side
      );
      const shotsValue = readMatchStatValue(
        stats,
        ["Shots on target", "Shots on goal", "Shots On Target", "On target"],
        side
      );

      if (cornerValue !== null) corners.push(cornerValue);
      if (foulValue !== null) fouls.push(foulValue);
      if (yellowValue !== null) yellowCards.push(yellowValue);
      if (redValue !== null) redCards.push(redValue);
      if (shotsValue !== null) shotsOnTarget.push(shotsValue);
    }

    const lineups = lineupsByEvent.get(event.id);
    const formation =
      side === "home" ? lineups?.home?.formation : lineups?.away?.formation;
    if (formation?.trim()) formations.push(formation.trim());
  }

  const sampleSize = Math.max(
    corners.length,
    fouls.length,
    yellowCards.length,
    redCards.length,
    shotsOnTarget.length
  );

  if (sampleSize === 0 && !formations.length) return null;

  return {
    cornersPerGame: average(corners),
    foulsPerGame: average(fouls),
    yellowCardsPerGame: average(yellowCards),
    redCardsPerGame: average(redCards),
    shotsOnTargetPerGame: average(shotsOnTarget),
    preferredFormation: pickPreferredFormation(formations),
    sampleSize,
  };
}

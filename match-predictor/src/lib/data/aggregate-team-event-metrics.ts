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

/** Per-match averages from synced event statistics and lineups for one team. */
export async function aggregateTeamMetricsFromSyncedEvents(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName?: string,
  maxMatches = 10
): Promise<AggregatedTeamEventMetrics | null> {
  let events = (
    await loadRecentFormEvents(supabase, leagueId, teamId, teamName, maxMatches * 2)
  )
    .filter((event) => event.status?.type === "finished" || event.status?.type === "ended")
    .slice(0, maxMatches);

  if (!events.length) {
    events = (await loadRecentFormEventsForTeam(supabase, teamId, teamName, maxMatches * 2))
      .filter((event) => event.status?.type === "finished" || event.status?.type === "ended")
      .slice(0, maxMatches);
  }

  if (!events.length) return null;

  const eventIds = events.map((event) => event.id);
  const [statsRows, lineupRows] = await Promise.all([
    supabase.from("synced_event_statistics").select("event_id, payload").in("event_id", eventIds),
    supabase.from("synced_event_lineups").select("event_id, payload").in("event_id", eventIds),
  ]);

  const statsByEvent = new Map<number, SportApiStatisticsResponse>();
  for (const row of statsRows.data ?? []) {
    if (row.payload) statsByEvent.set(row.event_id, row.payload as SportApiStatisticsResponse);
  }

  const lineupsByEvent = new Map<number, SportApiLineupsResponse>();
  for (const row of lineupRows.data ?? []) {
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
      const cornerValue = readMatchStatValue(stats, ["Corner kicks", "Corners"], side);
      const foulValue = readMatchStatValue(stats, "Fouls", side);
      const yellowValue = readMatchStatValue(stats, ["Yellow cards", "Yellow card"], side);
      const redValue = readMatchStatValue(stats, ["Red cards", "Red card"], side);
      const shotsValue = readMatchStatValue(
        stats,
        ["Shots on target", "Shots on goal"],
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

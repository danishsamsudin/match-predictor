import { loadRecentFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
import { resolveFbrefTeamIdByName } from "@/lib/fbref/comparison-fallback";
import {
  listFbrefFinishedMatchesForTeam,
  listFbrefTeamsByIds,
} from "@/lib/fbref/supabase-store";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { SportApiEvent } from "@/lib/types/sportapi";

type ServiceClient = SupabaseClient<Database>;

export type InternationalFormMatch = {
  date: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  competition?: string | null;
  home_team_name?: string;
  away_team_name?: string;
};

function matchDedupeKey(m: InternationalFormMatch): string {
  return [
    m.date ?? "",
    m.home_team_id ?? "",
    m.away_team_id ?? "",
    m.home_goals ?? "",
    m.away_goals ?? "",
  ].join("|");
}

function goalsForTeamInEvent(event: SportApiEvent, teamId: number): number | null {
  const homeGoals = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const awayGoals = event.awayScore?.current ?? event.awayScore?.display ?? null;
  if (homeGoals == null || awayGoals == null) return null;
  if (event.homeTeam.id === teamId) return homeGoals;
  if (event.awayTeam.id === teamId) return awayGoals;
  return null;
}

function goalsAgainstTeamInEvent(event: SportApiEvent, teamId: number): number | null {
  const homeGoals = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const awayGoals = event.awayScore?.current ?? event.awayScore?.display ?? null;
  if (homeGoals == null || awayGoals == null) return null;
  if (event.homeTeam.id === teamId) return awayGoals;
  if (event.awayTeam.id === teamId) return homeGoals;
  return null;
}

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

function mapSyncedEventToForm(
  event: SportApiEvent,
  teamId: number
): InternationalFormMatch | null {
  const gf = goalsForTeamInEvent(event, teamId);
  const ga = goalsAgainstTeamInEvent(event, teamId);
  if (gf == null || ga == null) return null;
  const isHome = event.homeTeam.id === teamId;
  return {
    date: eventDateIso(event),
    home_team_id: String(event.homeTeam.id),
    away_team_id: String(event.awayTeam.id),
    home_goals: isHome ? gf : ga,
    away_goals: isHome ? ga : gf,
    competition: competitionLabel(event),
    home_team_name: event.homeTeam.name,
    away_team_name: event.awayTeam.name,
  };
}

async function loadFbrefInternationalForm(
  teamName: string,
  limit: number
): Promise<InternationalFormMatch[]> {
  const team = await resolveFbrefTeamIdByName(teamName);
  if (!team) return [];

  const matches = await listFbrefFinishedMatchesForTeam(team.id, limit);
  if (!matches.length) return [];

  const teamIds = new Set<string>();
  for (const m of matches) {
    if (m.home_team_id) teamIds.add(m.home_team_id);
    if (m.away_team_id) teamIds.add(m.away_team_id);
  }
  const names = new Map(
    (await listFbrefTeamsByIds([...teamIds])).map((t) => [t.id, t.name])
  );

  const rows: InternationalFormMatch[] = [];
  for (const m of matches) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const isHome = m.home_team_id === team.id;
    const isAway = m.away_team_id === team.id;
    if (!isHome && !isAway) continue;
    rows.push({
      date: m.date,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_goals: m.home_goals,
      away_goals: m.away_goals,
      competition: m.competition,
      home_team_name: m.home_team_id ? names.get(m.home_team_id) : undefined,
      away_team_name: m.away_team_id ? names.get(m.away_team_id) : undefined,
    });
  }
  return rows;
}

/**
 * WCQ / friendly / synced-event history for hub xG (not limited to finals fixtures).
 */
export async function loadInternationalFormMatchesForTeam(
  supabase: ServiceClient,
  teamId: string,
  teamName: string,
  options?: { limit?: number }
): Promise<InternationalFormMatch[]> {
  const limit = options?.limit ?? 50;
  const byKey = new Map<string, InternationalFormMatch>();

  const fbrefRows = await loadFbrefInternationalForm(teamName, limit);
  for (const row of fbrefRows) {
    byKey.set(matchDedupeKey(row), row);
  }

  const apiTeamId = resolveApiTeamId(teamId, teamName);
  if (apiTeamId > 0) {
    const events = await loadRecentFormEventsForTeam(supabase, apiTeamId, teamName, limit);
    for (const event of events) {
      const row = mapSyncedEventToForm(event, apiTeamId);
      if (row) byKey.set(matchDedupeKey(row), row);
    }
  }

  return [...byKey.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

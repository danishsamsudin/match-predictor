import { readMatchStatValue } from "@/lib/api/sportapi/mappers";
import { mapEventToFixtureResult } from "@/lib/api/sportapi/mappers";
import {
  loadFbrefRecentFormFixtures,
  resolveFbrefTeamIdByName,
} from "@/lib/fbref/comparison-fallback";
import {
  listFbrefFinishedMatchesForTeam,
  listFbrefPlayerStatsForTeam,
  listFbrefTeamsByIds,
} from "@/lib/fbref/supabase-store";
import {
  buildFifaRankingInsights,
  BETTING_INSIGHTS_WINDOW,
  computeRestDaysBefore,
  computeTeamBettingInsights,
  dedupeMatchHistory,
  type FbrefTeamAggregateInput,
} from "@/lib/data/compute-team-betting-insights";
import { ensureFifaRankingsLoaded } from "@/lib/data/fifa-rankings-store";
import { resolveFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { FixtureResult } from "@/lib/types/football";
import type { SportApiStatisticsResponse } from "@/lib/types/sportapi";
import type {
  FixtureContextInsights,
  TeamBettingInsights,
  TeamMatchHistoryRow,
} from "@/lib/types/team-betting-insights";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type ServiceClient = SupabaseClient<Database>;

function fixtureToHistoryRow(
  match: FixtureResult,
  teamId: number,
  competition: string | null = null
): TeamMatchHistoryRow | null {
  const isHome = match.teams.home.id === teamId;
  const isAway = match.teams.away.id === teamId;
  if (!isHome && !isAway) return null;

  const goalsFor = isHome ? match.goals.home : match.goals.away;
  const goalsAgainst = isHome ? match.goals.away : match.goals.home;
  if (goalsFor == null || goalsAgainst == null) return null;

  const opponent = isHome ? match.teams.away.name : match.teams.home.name;
  return {
    date: match.fixture.date.slice(0, 10),
    opponent,
    isHome,
    goalsFor,
    goalsAgainst,
    competition,
  };
}

async function loadFbrefHistoryByName(
  teamName: string,
  sofascoreTeamId: number,
  limit: number
): Promise<TeamMatchHistoryRow[]> {
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

  const rows: TeamMatchHistoryRow[] = [];
  for (const m of matches) {
    if (m.home_goals == null || m.away_goals == null || !m.date) continue;
    const isHome = m.home_team_id === team.id;
    const isAway = m.away_team_id === team.id;
    if (!isHome && !isAway) continue;

    const goalsFor = isHome ? m.home_goals : m.away_goals;
    const goalsAgainst = isHome ? m.away_goals : m.home_goals;
    const opponentId = isHome ? m.away_team_id : m.home_team_id;
    rows.push({
      date: m.date,
      opponent: opponentId ? (names.get(opponentId) ?? "Opponent") : "Opponent",
      isHome,
      goalsFor,
      goalsAgainst,
      competition: m.competition,
    });
  }

  void sofascoreTeamId;
  return rows;
}

async function loadSyncedHistory(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName: string | undefined,
  limit: number
): Promise<TeamMatchHistoryRow[]> {
  const events = await resolveFormEventsForTeam(
    supabase,
    leagueId,
    teamId,
    teamName,
    limit
  );
  const rows: TeamMatchHistoryRow[] = [];
  for (const event of events) {
    const fixture = mapEventToFixtureResult(event);
    const row = fixtureToHistoryRow(fixture, teamId, event.tournament?.name ?? null);
    if (row) rows.push(row);
  }
  return rows;
}

async function aggregateShotsConcededPerGame(
  supabase: ServiceClient,
  teamId: number,
  teamName: string | undefined,
  leagueId: number
): Promise<number | null> {
  const events = await resolveFormEventsForTeam(
    supabase,
    leagueId,
    teamId,
    teamName,
    BETTING_INSIGHTS_WINDOW
  );
  if (!events.length) return null;

  const eventIds = events.map((e) => e.id);
  const { data: statRows } = await supabase
    .from("synced_event_statistics")
    .select("event_id, payload")
    .in("event_id", eventIds);

  const statsByEvent = new Map<number, SportApiStatisticsResponse>();
  for (const row of statRows ?? []) {
    if (row.payload) statsByEvent.set(row.event_id, row.payload as SportApiStatisticsResponse);
  }

  const conceded: number[] = [];
  for (const event of events) {
    const stats = statsByEvent.get(event.id);
    if (!stats) continue;
    const isHome = event.homeTeam.id === teamId;
    const isAway = event.awayTeam.id === teamId;
    if (!isHome && !isAway) continue;
    const side = isHome ? "away" : "home";
    const totalShots = readMatchStatValue(
      stats,
      ["Total shots", "Shots", "Shots total"],
      side
    );
    if (totalShots != null) conceded.push(totalShots);
  }

  if (!conceded.length) return null;
  const avg = conceded.reduce((s, v) => s + v, 0) / conceded.length;
  return Math.round(avg * 10) / 10;
}

function fbrefAggregateFromPlayerStats(
  stats: Awaited<ReturnType<typeof listFbrefPlayerStatsForTeam>>
): FbrefTeamAggregateInput {
  const byType = (type: string) =>
    stats
      .filter((s) => s.stat_type === type)
      .map((s) => ({
        ...s.stats,
        player_name: s.stats.player_name ?? s.stats.player,
      }));

  return {
    shooting: byType("shooting"),
    keeper: byType("keeper"),
    misc: byType("misc"),
    standard: byType("standard"),
  };
}

export async function loadTeamBettingInsights(input: {
  teamId: number;
  teamName: string;
  leagueId: number;
  entityType?: "club" | "national";
  formFixtures: FixtureResult[];
}): Promise<TeamBettingInsights> {
  await ensureFifaRankingsLoaded();
  const supabase = tryCreateServiceClient();
  const limit = BETTING_INSIGHTS_WINDOW * 2;

  const fromForm: TeamMatchHistoryRow[] = [];
  for (const f of input.formFixtures) {
    const row = fixtureToHistoryRow(f, input.teamId);
    if (row) fromForm.push(row);
  }

  let syncedRows: TeamMatchHistoryRow[] = [];
  if (supabase) {
    syncedRows = await loadSyncedHistory(
      supabase,
      input.leagueId,
      input.teamId,
      input.teamName,
      limit
    );
  }

  let fbrefRows: TeamMatchHistoryRow[] = [];
  if (input.entityType === "national" || normalizeNationalTeamName(input.teamName)) {
    fbrefRows = await loadFbrefHistoryByName(input.teamName, input.teamId, limit);
    if (!fbrefRows.length) {
      const fbrefFixtures = await loadFbrefRecentFormFixtures(
        input.teamName,
        input.teamId,
        BETTING_INSIGHTS_WINDOW
      );
      for (const f of fbrefFixtures) {
        const row = fixtureToHistoryRow(f, input.teamId);
        if (row) fbrefRows.push(row);
      }
    }
  }

  const merged = dedupeMatchHistory([...fromForm, ...syncedRows, ...fbrefRows]);
  const hasSynced = syncedRows.length > 0 || fromForm.length > 0;
  const hasFbref = fbrefRows.length > 0;
  const source: TeamBettingInsights["source"] =
    !merged.length ? "none" : hasSynced && hasFbref ? "mixed" : hasFbref ? "fbref" : "synced";

  let fbrefAgg: FbrefTeamAggregateInput | null = null;
  const fbrefTeam = await resolveFbrefTeamIdByName(input.teamName);
  if (fbrefTeam) {
    const playerStats = await listFbrefPlayerStatsForTeam(fbrefTeam.id);
    if (playerStats.length) fbrefAgg = fbrefAggregateFromPlayerStats(playerStats);
  }

  let shotsConceded: number | null = null;
  if (supabase) {
    shotsConceded = await aggregateShotsConcededPerGame(
      supabase,
      input.teamId,
      input.teamName,
      input.leagueId
    );
  }

  return computeTeamBettingInsights({
    matches: merged,
    fbref: fbrefAgg,
    shotsConcededPerGame: shotsConceded,
    source,
    teamName: input.teamName,
    fifaRanking: buildFifaRankingInsights(input.teamName),
  });
}

export async function loadFixtureContextInsights(input: {
  kickoffDate: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeLeagueId: number;
  awayLeagueId: number;
  homeForm: FixtureResult[];
  awayForm: FixtureResult[];
}): Promise<FixtureContextInsights> {
  const lastDate = (form: FixtureResult[], teamId: number): string | null => {
    for (const m of form) {
      const row = fixtureToHistoryRow(m, teamId);
      if (row) return row.date;
    }
    return null;
  };

  let homeLast = lastDate(input.homeForm, input.homeTeamId);
  let awayLast = lastDate(input.awayForm, input.awayTeamId);

  const supabase = tryCreateServiceClient();
  if (supabase) {
    if (!homeLast) {
      const rows = await loadSyncedHistory(
        supabase,
        input.homeLeagueId,
        input.homeTeamId,
        input.homeTeamName,
        1
      );
      homeLast = rows[0]?.date ?? null;
    }
    if (!awayLast) {
      const rows = await loadSyncedHistory(
        supabase,
        input.awayLeagueId,
        input.awayTeamId,
        input.awayTeamName,
        1
      );
      awayLast = rows[0]?.date ?? null;
    }
  }

  if (!homeLast) {
    const rows = await loadFbrefHistoryByName(input.homeTeamName, input.homeTeamId, 1);
    homeLast = rows[0]?.date ?? null;
  }
  if (!awayLast) {
    const rows = await loadFbrefHistoryByName(input.awayTeamName, input.awayTeamId, 1);
    awayLast = rows[0]?.date ?? null;
  }

  return {
    kickoffDate: input.kickoffDate.slice(0, 10),
    homeRestDays: computeRestDaysBefore(input.kickoffDate, homeLast),
    awayRestDays: computeRestDaysBefore(input.kickoffDate, awayLast),
    homeLastMatchDate: homeLast,
    awayLastMatchDate: awayLast,
  };
}

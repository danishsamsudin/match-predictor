import { parseTeamStats } from "@/lib/api/football";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { getLeagueById } from "@/lib/data/football-reference";
import type { TeamStatistics } from "@/lib/types/football";
import type { TeamStatAverages } from "@/lib/types/prediction";
import type { SportApiEvent, SportApiStandingsResponse } from "@/lib/types/sportapi";
import type { TeamSeasonStats } from "@/lib/types/team-comparison";
import { tryCreateServiceClient } from "@/lib/supabase";

type StandingsRow = SportApiStandingsResponse["standings"][0]["rows"][0];

function formatAvg(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function formFromStandingsRow(row: StandingsRow): string {
  const chars: string[] = [];
  const cap = Math.min(5, row.wins + row.draws + row.losses);
  for (let i = 0; i < row.wins && chars.length < cap; i++) chars.push("W");
  for (let i = 0; i < row.draws && chars.length < cap; i++) chars.push("D");
  for (let i = 0; i < row.losses && chars.length < cap; i++) chars.push("L");
  return chars.join("").slice(0, 5);
}

async function loadStandingsRow(
  teamId: number,
  leagueId: number
): Promise<StandingsRow | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_standings")
    .select("payload")
    .eq("reference_league_id", leagueId)
    .eq("standing_type", "total")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = data?.payload as SportApiStandingsResponse | null;
  if (!payload?.standings?.length) return null;

  for (const group of payload.standings) {
    const row = group.rows?.find((r) => r.team.id === teamId);
    if (row) return row;
  }
  return null;
}

async function loadHomeVenueFromEvents(
  teamId: number,
  leagueId: number
): Promise<{ name: string | null; capacity: string | null; city: string | null }> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return { name: null, capacity: null, city: null };

  const { data } = await supabase
    .from("synced_events")
    .select("payload")
    .eq("reference_league_id", leagueId)
    .order("kickoff_at", { ascending: false })
    .limit(60);

  for (const row of data ?? []) {
    const event = row.payload as SportApiEvent;
    if (event.homeTeam?.id !== teamId) continue;
    const name = event.venue?.stadium?.name?.trim();
    const city = event.venue?.city?.name?.trim();
    const cap = event.venue?.stadium?.capacity;
    if (name || city) {
      return {
        name: name ?? null,
        capacity: cap != null && cap > 0 ? String(cap) : null,
        city: city ?? null,
      };
    }
  }

  return { name: null, capacity: null, city: null };
}

type StoredTeamStatisticsPayload = {
  home?: TeamStatistics;
  away?: TeamStatistics;
  source?: string;
};

function statisticsFromStoredPayload(
  payload: StoredTeamStatisticsPayload | null,
  isHomeSide: boolean
): TeamStatistics | null {
  if (!payload) return null;
  return (isHomeSide ? payload.home : payload.away) ?? null;
}

function hasFullTeamStatisticsPayload(
  payload: StoredTeamStatisticsPayload | null
): boolean {
  return Boolean(statisticsFromStoredPayload(payload, true) ?? statisticsFromStoredPayload(payload, false));
}

function seasonAveragesFromSources(input: {
  metrics: TeamStatAverages | null;
  payloadStats: TeamStatistics | null;
  isHomeSide: boolean;
}): {
  cornersPerGame: string | null;
  foulsPerGame: string | null;
  yellowCardsPerGame: string | null;
  redCardsPerGame: string | null;
  shotsOnTargetPerGame: string | null;
  preferredFormation: string | null;
} {
  const fromPayload = input.payloadStats
    ? parseTeamStats(input.payloadStats, input.isHomeSide)
    : null;
  const fromMetrics = input.metrics;

  const corners = fromPayload?.corners ?? fromMetrics?.corners;
  const fouls = fromPayload?.fouls ?? fromMetrics?.fouls;
  const yellowCards = fromPayload?.yellowCards ?? fromMetrics?.yellowCards;
  const redCards = fromPayload?.redCards ?? fromMetrics?.redCards;
  const shotsOnTarget = fromPayload?.shotsOnTarget ?? fromMetrics?.shotsOnTarget;

  return {
    cornersPerGame: corners != null ? formatAvg(corners, 1) : null,
    foulsPerGame: fouls != null ? formatAvg(fouls, 1) : null,
    yellowCardsPerGame: yellowCards != null ? formatAvg(yellowCards, 2) : null,
    redCardsPerGame: redCards != null ? formatAvg(redCards, 2) : null,
    shotsOnTargetPerGame: shotsOnTarget != null ? formatAvg(shotsOnTarget, 1) : null,
    preferredFormation: input.payloadStats
      ? pickFormationFromStatistics(input.payloadStats)
      : null,
  };
}

/** Season stats built only from fields we actually persist (standings + optional metrics). */
export async function loadSeasonStatsFromDatabase(
  teamId: number,
  leagueId: number,
  isHomeSide: boolean
): Promise<{ stats: TeamSeasonStats; hasStandings: boolean; hasMetrics: boolean }> {
  const [standingsRow, venue, storedRow] = await Promise.all([
    loadStandingsRow(teamId, leagueId),
    loadHomeVenueFromEvents(teamId, leagueId),
    loadSyncedTeamStatisticsRow(teamId, leagueId),
  ]);

  const metrics =
    (isHomeSide ? storedRow?.metricsHome : storedRow?.metricsAway) ?? null;
  const payload = storedRow?.payload ?? null;
  const payloadStats = statisticsFromStoredPayload(payload, isHomeSide);
  const derived = seasonAveragesFromSources({
    metrics,
    payloadStats,
    isHomeSide,
  });

  const matches = standingsRow?.matches ?? 0;

  let goalsForPerGame: string | null = null;
  let goalsAgainstPerGame: string | null = null;
  let form: string | null = null;

  if (standingsRow && matches > 0) {
    goalsForPerGame = formatAvg(standingsRow.scoresFor / matches);
    goalsAgainstPerGame = formatAvg(standingsRow.scoresAgainst / matches);
    const derivedForm = formFromStandingsRow(standingsRow);
    form = derivedForm || null;
  } else if (metrics) {
    goalsForPerGame = formatAvg(metrics.goalsFor);
    goalsAgainstPerGame = formatAvg(metrics.goalsAgainst);
  }

  return {
    hasStandings: Boolean(standingsRow),
    hasMetrics: Boolean(metrics) || hasFullTeamStatisticsPayload(payload),
    stats: {
      formScorePct: null,
      form,
      goalsForPerGame,
      goalsAgainstPerGame,
      ...derived,
      venueName: venue.name,
      venueCapacity: venue.capacity,
    },
  };
}

async function loadSyncedTeamStatisticsRow(
  teamId: number,
  leagueId: number
): Promise<{
  metricsHome: TeamStatAverages | null;
  metricsAway: TeamStatAverages | null;
  payload: StoredTeamStatisticsPayload | null;
} | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_team_statistics")
    .select("metrics_home, metrics_away, payload")
    .eq("team_id", teamId)
    .eq("reference_league_id", leagueId)
    .maybeSingle();

  if (!data) return null;
  return {
    metricsHome: data.metrics_home as TeamStatAverages | null,
    metricsAway: data.metrics_away as TeamStatAverages | null,
    payload: data.payload as StoredTeamStatisticsPayload | null,
  };
}

function pickFormationFromStatistics(stats: {
  lineups: Array<{ formation: string; played: number }>;
}): string | null {
  const sorted = [...stats.lineups].sort((a, b) => b.played - a.played);
  const top = sorted[0];
  if (!top?.formation || (top.formation === "4-3-3" && top.played <= 1)) return null;
  return top.formation;
}

export function isPlaceholderTeamInfo(venue: {
  name: string;
  capacity: number;
}): boolean {
  return venue.capacity === 40000 && venue.name.endsWith(" Stadium");
}

export function shouldUseDatabaseComparisonStats(): boolean {
  return isSupabaseDataStore();
}

export function leagueNameForTeam(leagueId: number): string | null {
  return getLeagueById(leagueId)?.name ?? null;
}

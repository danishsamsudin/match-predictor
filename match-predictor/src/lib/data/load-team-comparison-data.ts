import { parseTeamStats } from "@/lib/api/football";
import { isSupabaseDataStore } from "@/lib/config/data-source";
import { aggregateTeamMetricsFromSyncedEvents } from "@/lib/data/aggregate-team-event-metrics";
import { getLeagueById } from "@/lib/data/football-reference";
import { getCanonicalTeamHomeVenue } from "@/lib/data/team-home-venues";
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

function findStandingsRow(
  payload: SportApiStandingsResponse,
  teamId: number,
  teamName?: string
): StandingsRow | null {
  for (const group of payload.standings ?? []) {
    const row = group.rows?.find((candidate) => {
      if (candidate.team.id === teamId) return true;
      if (teamName && candidate.team.name.toLowerCase() === teamName.toLowerCase()) {
        return true;
      }
      return false;
    });
    if (row) return row;
  }
  return null;
}

async function loadStandingsRow(
  teamId: number,
  leagueId: number,
  teamName?: string
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

  return findStandingsRow(payload, teamId, teamName);
}

async function loadHomeVenueFromEvents(
  teamId: number,
  leagueId: number,
  teamName?: string
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
    if (event.homeTeam?.id !== teamId) {
      if (
        !teamName ||
        event.homeTeam?.name?.toLowerCase() !== teamName.trim().toLowerCase()
      ) {
        continue;
      }
    }
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

function resolveTeamVenue(
  teamId: number,
  teamName: string | undefined,
  fromEvents: { name: string | null; capacity: string | null }
): { name: string | null; capacity: string | null } {
  const canonical = getCanonicalTeamHomeVenue(teamId, teamName);
  return {
    name: fromEvents.name ?? canonical?.name ?? null,
    capacity: fromEvents.capacity ?? (canonical ? String(canonical.capacity) : null),
  };
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

function hasCardTotals(stats: TeamStatistics): boolean {
  const yellowTotal = Object.values(stats.cards.yellow).reduce(
    (sum, bucket) => sum + (bucket.total ?? 0),
    0
  );
  const redTotal = Object.values(stats.cards.red).reduce(
    (sum, bucket) => sum + (bucket.total ?? 0),
    0
  );
  return yellowTotal > 0 || redTotal > 0;
}

/** Detect legacy placeholder metrics written from standings-only sync. */
function isStandingsPlaceholderMetrics(metrics: TeamStatAverages): boolean {
  return (
    Math.abs(metrics.fouls - 10) < 0.15 &&
    Math.abs(metrics.corners - 6) < 0.15 &&
    Math.abs(metrics.shotsOnTarget - 5) < 0.15
  );
}

function seasonAveragesFromSources(input: {
  metrics: TeamStatAverages | null;
  payloadStats: TeamStatistics | null;
  isHomeSide: boolean;
  eventAggregates: Awaited<ReturnType<typeof aggregateTeamMetricsFromSyncedEvents>>;
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
  const metrics =
    input.metrics && !isStandingsPlaceholderMetrics(input.metrics) ? input.metrics : null;
  const aggregates = input.eventAggregates;

  const pick = (
    aggregateValue: number | null | undefined,
    metricsValue: number | undefined,
    payloadValue: number | undefined,
    decimals: number,
    requirePayloadCards = false
  ): string | null => {
    if (aggregateValue != null && aggregates && aggregates.sampleSize > 0) {
      return formatAvg(aggregateValue, decimals);
    }
    if (metricsValue != null) return formatAvg(metricsValue, decimals);
    if (requirePayloadCards && input.payloadStats && !hasCardTotals(input.payloadStats)) {
      return null;
    }
    if (payloadValue != null && payloadValue > 0) return formatAvg(payloadValue, decimals);
    return null;
  };

  return {
    cornersPerGame: pick(
      aggregates?.cornersPerGame,
      metrics?.corners,
      fromPayload?.corners,
      1
    ),
    foulsPerGame: pick(aggregates?.foulsPerGame, metrics?.fouls, fromPayload?.fouls, 1),
    yellowCardsPerGame: pick(
      aggregates?.yellowCardsPerGame,
      metrics?.yellowCards,
      fromPayload?.yellowCards,
      2,
      true
    ),
    redCardsPerGame: pick(
      aggregates?.redCardsPerGame,
      metrics?.redCards,
      fromPayload?.redCards,
      2,
      true
    ),
    shotsOnTargetPerGame: pick(
      aggregates?.shotsOnTargetPerGame,
      metrics?.shotsOnTarget,
      fromPayload?.shotsOnTarget,
      1
    ),
    preferredFormation:
      aggregates?.preferredFormation ??
      (input.payloadStats ? pickFormationFromStatistics(input.payloadStats) : null),
  };
}

/** Season stats built only from fields we actually persist (standings + optional metrics). */
export async function loadSeasonStatsFromDatabase(
  teamId: number,
  leagueId: number,
  isHomeSide: boolean,
  teamName?: string
): Promise<{ stats: TeamSeasonStats; hasStandings: boolean; hasMetrics: boolean }> {
  const supabase = tryCreateServiceClient();
  const [standingsRow, venueFromEvents, storedRow, eventAggregates] = await Promise.all([
    loadStandingsRow(teamId, leagueId, teamName),
    loadHomeVenueFromEvents(teamId, leagueId, teamName),
    loadSyncedTeamStatisticsRow(teamId, leagueId),
    supabase
      ? aggregateTeamMetricsFromSyncedEvents(supabase, leagueId, teamId, teamName)
      : Promise.resolve(null),
  ]);

  const venue = resolveTeamVenue(teamId, teamName, venueFromEvents);

  const metrics =
    (isHomeSide ? storedRow?.metricsHome : storedRow?.metricsAway) ?? null;
  const payload = storedRow?.payload ?? null;
  const payloadStats = statisticsFromStoredPayload(payload, isHomeSide);
  const derived = seasonAveragesFromSources({
    metrics,
    payloadStats,
    isHomeSide,
    eventAggregates,
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
  } else if (metrics && !isStandingsPlaceholderMetrics(metrics)) {
    goalsForPerGame = formatAvg(metrics.goalsFor);
    goalsAgainstPerGame = formatAvg(metrics.goalsAgainst);
  }

  return {
    hasStandings: Boolean(standingsRow),
    hasMetrics:
      Boolean(eventAggregates?.sampleSize) ||
      Boolean(metrics && !isStandingsPlaceholderMetrics(metrics)) ||
      hasFullTeamStatisticsPayload(payload),
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
  if (!top?.formation?.trim()) return null;
  return top.formation;
}

export function isPlaceholderTeamInfo(venue: {
  name: string;
  capacity: number;
}): boolean {
  const normalized = venue.name.trim().toLowerCase();
  if (normalized === "home team stadium" || normalized === "away team stadium") return true;
  if (venue.capacity === 75000) return true;
  if (venue.capacity === 40000 && venue.name.endsWith(" Stadium")) return true;
  return false;
}

export function shouldUseDatabaseComparisonStats(): boolean {
  return isSupabaseDataStore() || Boolean(tryCreateServiceClient());
}

export function leagueNameForTeam(leagueId: number): string | null {
  return getLeagueById(leagueId)?.name ?? null;
}

export function mergeSeasonStats(
  primary: TeamSeasonStats,
  fallback: TeamSeasonStats
): TeamSeasonStats {
  const pick = (key: keyof TeamSeasonStats) => primary[key] ?? fallback[key] ?? null;
  return {
    formScorePct: pick("formScorePct"),
    form: pick("form"),
    goalsForPerGame: pick("goalsForPerGame"),
    goalsAgainstPerGame: pick("goalsAgainstPerGame"),
    cornersPerGame: pick("cornersPerGame"),
    foulsPerGame: pick("foulsPerGame"),
    yellowCardsPerGame: pick("yellowCardsPerGame"),
    redCardsPerGame: pick("redCardsPerGame"),
    shotsOnTargetPerGame: pick("shotsOnTargetPerGame"),
    preferredFormation: pick("preferredFormation"),
    venueName: pick("venueName"),
    venueCapacity: pick("venueCapacity"),
  };
}

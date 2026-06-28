import { collectTeamsFromStandings } from "@/lib/api/sportapi/standings-teams";
import { assembleFootballBundleFromStore } from "@/lib/data/assemble-football-bundle";
import { teamStatisticsFromMetrics } from "@/lib/sync/team-prediction-metrics";
import type { EntityType } from "@/lib/types/football-lookup";
import { getLeagueById, getLeaguesByCountry } from "@/lib/data/football-reference";
import type { FootballBundle, TeamStatistics } from "@/lib/types/football";
import type { FixtureOption, TeamOption } from "@/lib/types/football-lookup";
import type { SportApiStandingsResponse } from "@/lib/types/sportapi";
import type { TeamStatAverages, WeatherForecast } from "@/lib/types/prediction";
import { UpstreamApiError } from "@/lib/types/prediction";
import { tryCreateServiceClient } from "@/lib/supabase";
import { utcDayBounds } from "@/lib/prediction/snapshot-types";

function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

export async function getSyncStatus(): Promise<{
  lastSuccessAt: string | null;
  nextSyncAfter: string | null;
  isDue: boolean;
}> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return { lastSuccessAt: null, nextSyncAfter: null, isDue: true };
  }

  const { data } = await supabase.from("data_sync_state").select("*").eq("id", 1).maybeSingle();

  const lastSuccessAt = data?.last_success_at ?? null;
  const nextSyncAfter = data?.next_sync_after ?? null;
  const isDue = !nextSyncAfter || new Date(nextSyncAfter) <= new Date();

  return { lastSuccessAt, nextSyncAfter, isDue };
}

export async function loadTeamsFromStore(
  leagueId: number,
  entityType?: string
): Promise<TeamOption[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  let query = supabase
    .from("synced_teams")
    .select("team_id, team_name, short_name")
    .eq("league_id", leagueId)
    .order("team_name");

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  const { data, error } = await query;

  if (error) throw new UpstreamApiError(`Failed to load teams from store: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.team_id,
    name: row.team_name,
    shortName: row.short_name?.trim() || undefined,
  }));
}

/** Full table from the latest synced standings payload when synced_teams is sparse. */
export async function loadTeamsFromStandingsStore(leagueId: number): Promise<TeamOption[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("synced_standings")
    .select("payload")
    .eq("reference_league_id", leagueId)
    .eq("standing_type", "total")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.payload) return [];

  return collectTeamsFromStandings(data.payload as SportApiStandingsResponse);
}

export async function loadTeamStatisticsFromStore(
  teamId: number,
  leagueId: number,
  isHomeSide: boolean
): Promise<import("@/lib/types/football").TeamStatistics | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("synced_team_statistics")
    .select("payload, metrics_home, metrics_away")
    .eq("team_id", teamId)
    .eq("reference_league_id", leagueId)
    .maybeSingle();

  if (error) return null;

  const payload = data?.payload as {
    home?: TeamStatistics;
    away?: TeamStatistics;
  } | null;
  const fromPayload = isHomeSide ? payload?.home : payload?.away;
  if (fromPayload) return fromPayload;

  const metrics = (isHomeSide ? data?.metrics_home : data?.metrics_away) as TeamStatAverages | null;
  if (!metrics) return null;

  const league = getLeagueById(leagueId);
  const season = league?.season ?? new Date().getFullYear();

  return teamStatisticsFromMetrics(
    metrics,
    { id: teamId, name: `Team ${teamId}` },
    leagueId,
    season,
    isHomeSide
  );
}

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function loadFixturesFromStore(leagueId: number): Promise<FixtureOption[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("synced_fixtures")
    .select("*")
    .eq("league_id", leagueId)
    .gte("kickoff_at", startOfUtcDayIso())
    .order("kickoff_at")
    .limit(50);

  if (error) throw new UpstreamApiError(`Failed to load fixtures from store: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.event_id,
    date: row.kickoff_at,
    venueCity: row.venue_city,
    league: { id: row.league_id, name: row.league_name, season: row.season },
    home: { id: row.home_team_id, name: row.home_team_name },
    away: { id: row.away_team_id, name: row.away_team_name },
  }));
}

/** Fixtures with kickoff on a UTC calendar day (for daily snapshot jobs). */
export async function loadFixturesKickingOffOnUtcDate(
  leagueId: number,
  snapshotDateYmd: string
): Promise<FixtureOption[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  const { start, end } = utcDayBounds(snapshotDateYmd);

  const { data, error } = await supabase
    .from("synced_fixtures")
    .select("*")
    .eq("league_id", leagueId)
    .gte("kickoff_at", start)
    .lte("kickoff_at", end)
    .order("kickoff_at");

  if (error) throw new UpstreamApiError(`Failed to load fixtures from store: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.event_id,
    date: row.kickoff_at,
    venueCity: row.venue_city,
    league: { id: row.league_id, name: row.league_name, season: row.season },
    home: { id: row.home_team_id, name: row.home_team_name },
    away: { id: row.away_team_id, name: row.away_team_name },
  }));
}

export async function loadSyncedBundleMatchIds(matchIds: number[]): Promise<Set<number>> {
  const supabase = tryCreateServiceClient();
  if (!supabase || matchIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("synced_match_bundles")
    .select("match_id")
    .in("match_id", matchIds);

  if (error) return new Set();
  return new Set((data ?? []).map((r) => Number(r.match_id)));
}

export async function loadFootballBundleFromStore(
  matchId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<FootballBundle> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    throw new UpstreamApiError("Supabase service role required to read match data store.");
  }

  return assembleFootballBundleFromStore(supabase, matchId, homeTeamId, awayTeamId);
}

export async function loadWeatherFromStore(
  city: string,
  matchDate: string
): Promise<WeatherForecast> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    throw new UpstreamApiError("Supabase service role required to read weather store.");
  }

  const dateOnly = matchDate.slice(0, 10);
  const { data, error } = await supabase
    .from("synced_weather")
    .select("forecast")
    .eq("city_key", cityKey(city))
    .eq("forecast_date", dateOnly)
    .maybeSingle();

  if (error) {
    throw new UpstreamApiError(`Failed to load weather from store: ${error.message}`);
  }

  if (!data?.forecast) {
    throw new UpstreamApiError(
      `No synced weather for ${city} on ${dateOnly}. Run sync after selecting this fixture.`
    );
  }

  return data.forecast as WeatherForecast;
}

export async function saveWeatherToStore(
  city: string,
  matchDate: string,
  forecast: WeatherForecast
): Promise<void> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return;

  const dateOnly = matchDate.slice(0, 10);
  const { error } = await supabase.from("synced_weather").upsert({
    city_key: cityKey(city),
    forecast_date: dateOnly,
    forecast: forecast as unknown,
  });

  if (error) {
    console.warn("Failed to persist weather to store:", error.message);
  }
}

export function loadLeaguesFromReference(country: string, entityType?: EntityType) {
  return getLeaguesByCountry(country, entityType);
}

export function getLeagueMeta(leagueId: number) {
  return getLeagueById(leagueId);
}

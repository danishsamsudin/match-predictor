import { parseTeamStats } from "@/lib/api/football";
import { mapTeamInfo } from "@/lib/api/sportapi/mappers";
import { getLeagueEntityType } from "@/lib/data/football-reference";
import { resolveTeamStatistics } from "@/lib/data/resolve-team-statistics";
import {
  buildFootballBundleFromParts,
  filterFormForTeam,
  findStandingsRow,
} from "@/lib/sync/build-football-bundle";
import type { FootballBundle } from "@/lib/types/football";
import type { TeamStatistics } from "@/lib/types/football";
import type { SportApiEvent, SportApiStandingsResponse } from "@/lib/types/sportapi";
import { isFresh, SYNC_FRESH_MS } from "@/lib/data/synced-resource-cache";
import { UpstreamApiError } from "@/lib/types/prediction";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type ServiceClient = SupabaseClient<Database>;

async function loadTeamStats(
  supabase: ServiceClient,
  teamId: number,
  leagueId: number,
  season: number,
  isHomeSide: boolean,
  teamName: string,
  entityType?: import("@/lib/types/football-lookup").EntityType
): Promise<TeamStatistics> {
  void supabase;
  return resolveTeamStatistics({
    teamId,
    leagueId,
    season,
    isHomeSide,
    teamName,
    entityType,
  });
}

function eventInvolvesTeam(
  event: SportApiEvent,
  teamId: number,
  teamName?: string
): boolean {
  if (event.homeTeam.id === teamId || event.awayTeam.id === teamId) {
    return true;
  }
  if (!teamName) return false;
  const normalized = teamName.toLowerCase();
  return (
    event.homeTeam.name.toLowerCase() === normalized ||
    event.awayTeam.name.toLowerCase() === normalized
  );
}

/** Recent finished events for a team from `synced_events` (ID or name match). */
export async function loadRecentFormEvents(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName?: string,
  limit = 20
): Promise<SportApiEvent[]> {
  const { data, error } = await supabase
    .from("synced_events")
    .select("payload, kickoff_at")
    .eq("reference_league_id", leagueId)
    .order("kickoff_at", { ascending: false })
    .limit(limit * 4);

  if (error) return [];

  const events: SportApiEvent[] = [];
  for (const row of data ?? []) {
    const event = row.payload as SportApiEvent;
    if (!event?.homeTeam?.id || !event?.awayTeam?.id) continue;
    if (eventInvolvesTeam(event, teamId, teamName)) {
      events.push(event);
    }
    if (events.length >= limit) break;
  }
  return events;
}

/** Recent finished events for a team across all synced competitions. */
export async function loadRecentFormEventsForTeam(
  supabase: ServiceClient,
  teamId: number,
  teamName?: string,
  limit = 20
): Promise<SportApiEvent[]> {
  const { data, error } = await supabase
    .from("synced_events")
    .select("payload, kickoff_at")
    .order("kickoff_at", { ascending: false })
    .limit(limit * 8);

  if (error) return [];

  const events: SportApiEvent[] = [];
  for (const row of data ?? []) {
    const event = row.payload as SportApiEvent;
    if (!event?.homeTeam?.id || !event?.awayTeam?.id) continue;
    if (eventInvolvesTeam(event, teamId, teamName)) {
      events.push(event);
    }
    if (events.length >= limit) break;
  }
  return events;
}

export async function assembleFootballBundleFromStore(
  supabase: ServiceClient,
  matchId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<FootballBundle> {
  const { data: cachedBundle } = await supabase
    .from("synced_match_bundles")
    .select("bundle, synced_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (cachedBundle?.bundle && isFresh(cachedBundle.synced_at, SYNC_FRESH_MS)) {
    return cachedBundle.bundle as FootballBundle;
  }

  const { data: fixtureRow, error: fixtureError } = await supabase
    .from("synced_fixtures")
    .select("*")
    .eq("event_id", matchId)
    .maybeSingle();

  if (fixtureError) {
    throw new UpstreamApiError(`Failed to load fixture: ${fixtureError.message}`);
  }

  const { data: eventRow } = await supabase
    .from("synced_events")
    .select("payload, reference_league_id, season_id")
    .eq("event_id", matchId)
    .maybeSingle();

  const leagueId = fixtureRow?.league_id ?? eventRow?.reference_league_id;
  const season = fixtureRow?.season;
  const homeName = fixtureRow?.home_team_name ?? "Home";
  const awayName = fixtureRow?.away_team_name ?? "Away";
  const venueCity = fixtureRow?.venue_city ?? "Unknown";

  if (!leagueId || !season) {
    throw new UpstreamApiError(
      `No synced fixture or event for match ${matchId}. Run POST /api/cron/sync.`
    );
  }

  const event =
    (eventRow?.payload as SportApiEvent | undefined) ??
    ({
      id: matchId,
      homeTeam: { id: homeTeamId, name: homeName },
      awayTeam: { id: awayTeamId, name: awayName },
      tournament: { id: 0, name: fixtureRow?.league_name ?? "" },
      season: { id: eventRow?.season_id ?? 0 },
      startTimestamp: fixtureRow?.kickoff_at
        ? Math.floor(new Date(fixtureRow.kickoff_at).getTime() / 1000)
        : undefined,
      venue: { city: { name: venueCity } },
    } as SportApiEvent);

  const leagueEntityType = getLeagueEntityType(leagueId);

  const [homeStats, awayStats, standingsRow, statsRow, lineupsRow, h2hRow, formEvents] =
    await Promise.all([
      loadTeamStats(supabase, homeTeamId, leagueId, season, true, homeName, leagueEntityType),
      loadTeamStats(supabase, awayTeamId, leagueId, season, false, awayName, leagueEntityType),
      supabase
        .from("synced_standings")
        .select("payload, synced_at")
        .eq("reference_league_id", leagueId)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("synced_event_statistics")
        .select("payload, synced_at")
        .eq("event_id", matchId)
        .maybeSingle(),
      supabase
        .from("synced_event_lineups")
        .select("payload, synced_at")
        .eq("event_id", matchId)
        .maybeSingle(),
      supabase
        .from("synced_event_h2h")
        .select("payload, synced_at")
        .eq("event_id", matchId)
        .maybeSingle(),
      loadRecentFormEvents(supabase, leagueId, homeTeamId, homeName),
    ]);

  const awayFormEvents = await loadRecentFormEvents(
    supabase,
    leagueId,
    awayTeamId,
    awayName
  );
  const standingsRes =
    standingsRow.data?.payload && isFresh(standingsRow.data.synced_at, SYNC_FRESH_MS)
      ? (standingsRow.data.payload as SportApiStandingsResponse)
      : undefined;
  const statistics =
    statsRow.data?.payload && isFresh(statsRow.data.synced_at, SYNC_FRESH_MS)
      ? (statsRow.data.payload as import("@/lib/types/sportapi").SportApiStatisticsResponse)
      : undefined;
  const lineups =
    lineupsRow.data?.payload && isFresh(lineupsRow.data.synced_at, SYNC_FRESH_MS)
      ? (lineupsRow.data.payload as import("@/lib/types/sportapi").SportApiLineupsResponse)
      : undefined;
  const h2hPayload =
    h2hRow.data?.payload && isFresh(h2hRow.data.synced_at, SYNC_FRESH_MS)
      ? (h2hRow.data.payload as { events?: SportApiEvent[] })
      : undefined;

  const bundle = buildFootballBundleFromParts({
    event,
    referenceLeagueId: leagueId,
    season,
    homeTeamId,
    awayTeamId,
    statistics,
    lineups,
    homeStandingsRow: standingsRes
      ? findStandingsRow(standingsRes, homeTeamId, homeName)
      : undefined,
    awayStandingsRow: standingsRes
      ? findStandingsRow(standingsRes, awayTeamId, awayName)
      : undefined,
    homeFormEvents: filterFormForTeam(formEvents, homeTeamId),
    awayFormEvents: filterFormForTeam(awayFormEvents, awayTeamId),
    h2hEvents: h2hPayload?.events ?? [],
    venueCity,
  });

  void parseTeamStats(bundle.homeStats, true);
  void parseTeamStats(bundle.awayStats, false);

  return {
    ...bundle,
    homeTeamInfo: mapTeamInfo(homeTeamId, homeName, venueCity, bundle.fixture.fixture.venue.name),
    awayTeamInfo: mapTeamInfo(awayTeamId, awayName, venueCity),
  };
}

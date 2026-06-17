import { parseTeamStats } from "@/lib/api/football";
import { mapEventToFixtureResult, mapTeamInfo } from "@/lib/api/sportapi/mappers";
import { isMockFixtureForm } from "@/lib/mocks/football";
import { getLeagueEntityType } from "@/lib/data/football-reference";
import { resolveTeamStatistics } from "@/lib/data/resolve-team-statistics";
import {
  FBREF_FORM_MIN_SYNCED,
  loadFbrefRecentFormFixtures,
  mergeRecentFormFixtures,
} from "@/lib/fbref/comparison-fallback";
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

function eventIsHeadToHead(
  event: SportApiEvent,
  teamAId: number,
  teamBId: number,
  teamAName?: string,
  teamBName?: string
): boolean {
  return (
    eventInvolvesTeam(event, teamAId, teamAName) &&
    eventInvolvesTeam(event, teamBId, teamBName)
  );
}

/** Head-to-head fixtures from full `synced_events` history (not just recent form). */
export async function loadH2HEventsFromSyncedEvents(
  supabase: ServiceClient,
  homeTeamId: number,
  awayTeamId: number,
  options: {
    leagueIds: number[];
    homeTeamName?: string;
    awayTeamName?: string;
    limit?: number;
    /** Fixture IDs already present in form-derived H2H (skip duplicates). */
    excludeEventIds?: number[];
    /** Max rows scanned per league (deep international pools can be large). */
    maxPoolRows?: number;
    /** When true, only include finished matches with a result. */
    finishedOnly?: boolean;
  }
): Promise<SportApiEvent[]> {
  const limit = options.limit ?? 10;
  const maxPoolRows = options.maxPoolRows ?? 2000;
  const finishedOnly = options.finishedOnly ?? true;
  const seen = new Set(options.excludeEventIds ?? []);
  const events: SportApiEvent[] = [];

  for (const leagueId of options.leagueIds) {
    const { data, error } = await supabase
      .from("synced_events")
      .select("payload, kickoff_at")
      .eq("reference_league_id", leagueId)
      .order("kickoff_at", { ascending: false })
      .limit(maxPoolRows);

    if (error) continue;

    for (const row of data ?? []) {
      const event = row.payload as SportApiEvent;
      if (!event?.homeTeam?.id || !event?.awayTeam?.id) continue;
      if (finishedOnly && event.status?.type !== "finished") continue;
      if (
        !eventIsHeadToHead(
          event,
          homeTeamId,
          awayTeamId,
          options.homeTeamName,
          options.awayTeamName
        )
      ) {
        continue;
      }
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
      if (events.length >= limit) return events;
    }
  }

  return events;
}

export async function resolveFormEventsForTeam(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName?: string,
  limit = 10
): Promise<SportApiEvent[]> {
  const crossCompetition = await loadRecentFormEventsForTeam(
    supabase,
    teamId,
    teamName,
    limit
  );
  if (crossCompetition.length >= 5) return crossCompetition;

  const leagueScoped = await loadRecentFormEvents(supabase, leagueId, teamId, teamName, limit);
  if (leagueScoped.length > crossCompetition.length) return leagueScoped;
  return crossCompetition;
}

/** Synced events first; FBref match logs fill gaps when SofaScore/sync is sparse. */
export async function resolveRecentFormFixturesForTeam(
  supabase: ServiceClient,
  leagueId: number,
  teamId: number,
  teamName?: string,
  limit = 10
) {
  const events = await resolveFormEventsForTeam(supabase, leagueId, teamId, teamName, 20);
  const synced = events.slice(0, limit).map(mapEventToFixtureResult);
  if (synced.length >= FBREF_FORM_MIN_SYNCED || !teamName?.trim()) {
    return synced;
  }
  const fbref = await loadFbrefRecentFormFixtures(teamName, teamId, limit);
  return mergeRecentFormFixtures(synced, fbref, limit);
}

async function resolveH2HEvents(
  supabase: ServiceClient,
  matchId: number,
  homeTeamId: number,
  awayTeamId: number,
  leagueId: number,
  homeTeamName: string,
  awayTeamName: string,
  h2hPayloadEvents: SportApiEvent[]
): Promise<SportApiEvent[]> {
  const seen = new Set<number>();
  const merged: SportApiEvent[] = [];

  const push = (event: SportApiEvent) => {
    if (!event?.id || seen.has(event.id)) return;
    seen.add(event.id);
    merged.push(event);
  };

  for (const event of h2hPayloadEvents) push(event);

  if (merged.length < 10) {
    const dbEvents = await loadH2HEventsFromSyncedEvents(supabase, homeTeamId, awayTeamId, {
      leagueIds: [leagueId],
      homeTeamName,
      awayTeamName,
      limit: 10,
      excludeEventIds: [...seen],
      maxPoolRows: 5000,
      finishedOnly: true,
    });
    for (const event of dbEvents) push(event);
  }

  void matchId;
  return merged.slice(0, 10);
}

function attachLiveFormAndH2H(
  bundle: FootballBundle,
  homeForm: FootballBundle["homeForm"],
  awayForm: FootballBundle["awayForm"],
  h2hEvents: SportApiEvent[]
): FootballBundle {
  return {
    ...bundle,
    homeForm,
    awayForm,
    h2h: h2hEvents.slice(0, 10).map(mapEventToFixtureResult),
  };
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
    if (event.status?.type !== "finished") continue;
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
    if (event.status?.type !== "finished") continue;
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
    const cached = cachedBundle.bundle as FootballBundle;
    const cacheHasMockForm =
      isMockFixtureForm(cached.homeForm) || isMockFixtureForm(cached.awayForm);
    const cachedLeagueId = cached.fixture.league.id;
    const cachedHomeName = cached.fixture.teams.home.name;
    const cachedAwayName = cached.fixture.teams.away.name;

    const { data: cachedH2hRow } = await supabase
      .from("synced_event_h2h")
      .select("payload, synced_at")
      .eq("event_id", matchId)
      .maybeSingle();

    const cachedH2hPayload =
      cachedH2hRow?.payload && isFresh(cachedH2hRow.synced_at, SYNC_FRESH_MS)
        ? (cachedH2hRow.payload as { events?: SportApiEvent[] })
        : undefined;

    const [homeForm, awayForm, h2hEvents] = await Promise.all([
      resolveRecentFormFixturesForTeam(
        supabase,
        cachedLeagueId,
        homeTeamId,
        cachedHomeName
      ),
      resolveRecentFormFixturesForTeam(
        supabase,
        cachedLeagueId,
        awayTeamId,
        cachedAwayName
      ),
      resolveH2HEvents(
        supabase,
        matchId,
        homeTeamId,
        awayTeamId,
        cachedLeagueId,
        cachedHomeName,
        cachedAwayName,
        cachedH2hPayload?.events ?? []
      ),
    ]);

    const hasLiveForm = homeForm.length > 0 || awayForm.length > 0;
    if (!cacheHasMockForm || hasLiveForm) {
      return attachLiveFormAndH2H(cached, homeForm, awayForm, h2hEvents);
    }
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

  const [homeStats, awayStats, standingsRow, statsRow, lineupsRow, h2hRow] =
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
    ]);

  const h2hPayload =
    h2hRow.data?.payload && isFresh(h2hRow.data.synced_at, SYNC_FRESH_MS)
      ? (h2hRow.data.payload as { events?: SportApiEvent[] })
      : undefined;

  const [homeForm, awayForm, h2hEvents] = await Promise.all([
    resolveRecentFormFixturesForTeam(supabase, leagueId, homeTeamId, homeName),
    resolveRecentFormFixturesForTeam(supabase, leagueId, awayTeamId, awayName),
    resolveH2HEvents(
      supabase,
      matchId,
      homeTeamId,
      awayTeamId,
      leagueId,
      homeName,
      awayName,
      h2hPayload?.events ?? []
    ),
  ]);
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
    homeForm,
    awayForm,
    h2hEvents,
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

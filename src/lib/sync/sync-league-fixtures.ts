import { resolveSportApiLeague } from "@/lib/config/sportapi-leagues";
import {
  gatewayGetNextMatches,
  gatewayGetSeasons,
  gatewayGetStandings,
  persistRawPayload,
} from "@/lib/api/football-gateway";
import { mapEventToFixtureOption } from "@/lib/api/sportapi/mappers";
import { getLeagueById, getLeagueEntityType } from "@/lib/data/football-reference";
import { getRemainingFootballBudget } from "@/lib/sync/football-api-budget";
import {
  isValidEventForSync,
  persistStandingsTeams,
} from "@/lib/sync/persist-football-sync";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { SportApiEvent } from "@/lib/types/sportapi";

async function resolveSeasonId(
  supabase: NonNullable<ReturnType<typeof tryCreateServiceClient>>,
  uniqueTournamentId: number,
  referenceLeagueId: number
): Promise<number | null> {
  const { data: cached } = await supabase
    .from("synced_seasons")
    .select("season_id, synced_at")
    .eq("unique_tournament_id", uniqueTournamentId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (cached?.season_id && cached.synced_at) {
    const age = Date.now() - new Date(cached.synced_at).getTime();
    if (age < weekMs) return cached.season_id;
  }

  if ((await getRemainingFootballBudget()) < 1) return cached?.season_id ?? null;

  const { data: seasonsRes, provider } = await gatewayGetSeasons(uniqueTournamentId);
  const seasonId = seasonsRes.seasons?.[0]?.id;
  if (!seasonId) return cached?.season_id ?? null;

  await persistRawPayload(supabase, {
    provider,
    endpoint: "seasons",
    entityType: "season",
    entityKey: String(uniqueTournamentId),
    payload: seasonsRes,
  });

  await supabase.from("synced_seasons").upsert({
    unique_tournament_id: uniqueTournamentId,
    season_id: seasonId,
    season_name: seasonsRes.seasons[0]?.name ?? null,
    season_year: seasonsRes.seasons[0]?.year ?? null,
    reference_league_id: referenceLeagueId,
    payload: seasonsRes,
  });

  return seasonId;
}

/** Fetch and persist upcoming fixtures (and optionally teams) for one competition. */
export async function syncLeagueFixturesToStore(
  referenceLeagueId: number,
  options?: { syncTeams?: boolean }
): Promise<{ ok: boolean; fixturesSynced: number; reason?: string }> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return { ok: false, fixturesSynced: 0, reason: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }

  const mapping = resolveSportApiLeague(referenceLeagueId);
  const league = getLeagueById(referenceLeagueId);
  if (!mapping || !league) {
    return { ok: false, fixturesSynced: 0, reason: `Unknown league ${referenceLeagueId}` };
  }

  if ((await getRemainingFootballBudget()) < 1) {
    return { ok: false, fixturesSynced: 0, reason: "Daily football API limit reached" };
  }

  const seasonId = await resolveSeasonId(supabase, mapping.uniqueTournamentId, referenceLeagueId);
  if (!seasonId) {
    return { ok: false, fixturesSynced: 0, reason: "Could not resolve season for this competition" };
  }

  const now = new Date().toISOString();
  const entityType = getLeagueEntityType(referenceLeagueId);

  if (options?.syncTeams !== false && (await getRemainingFootballBudget()) >= 1) {
    const { data: standingsRes, provider } = await gatewayGetStandings(
      mapping.uniqueTournamentId,
      seasonId
    );

    await persistRawPayload(supabase, {
      provider,
      endpoint: "standings",
      entityType: "standings",
      entityKey: `${mapping.uniqueTournamentId}:${seasonId}`,
      payload: standingsRes,
    });

    await supabase.from("synced_standings").upsert(
      {
        unique_tournament_id: mapping.uniqueTournamentId,
        season_id: seasonId,
        reference_league_id: referenceLeagueId,
        standing_type: "total",
        payload: standingsRes,
        synced_at: now,
      },
      { onConflict: "unique_tournament_id,season_id,standing_type" }
    );

    await persistStandingsTeams(supabase, {
      standings: standingsRes,
      referenceLeagueId,
      uniqueTournamentId: mapping.uniqueTournamentId,
      seasonId,
      seasonYear: league.season,
      entityType,
      syncedAt: now,
    });
  }

  if ((await getRemainingFootballBudget()) < 1) {
    return { ok: false, fixturesSynced: 0, reason: "Daily football API limit reached" };
  }

  const { data: nextRes } = await gatewayGetNextMatches(mapping.uniqueTournamentId, seasonId);
  let fixturesSynced = 0;
  const seen = new Set<number>();

  for (const event of (nextRes.events ?? []) as SportApiEvent[]) {
    if (seen.has(event.id) || !isValidEventForSync(event)) continue;
    seen.add(event.id);

    const option = mapEventToFixtureOption(event, referenceLeagueId, league.season);

    await supabase.from("synced_fixtures").upsert(
      {
        event_id: event.id,
        league_id: referenceLeagueId,
        league_name: league.name,
        season: league.season,
        kickoff_at: option.date,
        venue_city: option.venueCity,
        home_team_id: event.homeTeam.id,
        home_team_name: event.homeTeam.name,
        away_team_id: event.awayTeam.id,
        away_team_name: event.awayTeam.name,
        synced_at: now,
      },
      { onConflict: "event_id" }
    );

    await supabase.from("synced_events").upsert(
      {
        event_id: event.id,
        unique_tournament_id: mapping.uniqueTournamentId,
        season_id: seasonId,
        reference_league_id: referenceLeagueId,
        kickoff_at: option.date,
        status_type: event.status?.type ?? null,
        payload: event,
        synced_at: now,
      },
      { onConflict: "event_id" }
    );

    fixturesSynced += 1;
  }

  return { ok: true, fixturesSynced };
}

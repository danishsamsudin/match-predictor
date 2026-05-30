import { getSyncCronHourUtc, getSyncIntervalDays, getSyncLeagueIds, getSyncMaxMatchesPerLeague } from "@/lib/config/data-source";
import { getPrimaryProviderName } from "@/lib/config/football-providers";
import { resolveSportApiLeague } from "@/lib/config/sportapi-leagues";
import {
  gatewayGetLastMatches,
  gatewayGetMatchH2H,
  gatewayGetMatchLineups,
  gatewayGetMatchStatistics,
  gatewayGetMatchIncidents,
  gatewayGetNextMatches,
  gatewayGetSeasons,
  gatewayGetStandings,
  persistRawPayload,
} from "@/lib/api/football-gateway";
import { mapEventToFixtureOption } from "@/lib/api/sportapi/mappers";
import {
  isValidEventForSync,
  persistStandingsTeams,
} from "@/lib/sync/persist-football-sync";
import { getLeagueById, getLeagueEntityType } from "@/lib/data/football-reference";
import { getWeatherForecast } from "@/lib/api/weather";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { SportApiEvent, SportApiStandingsResponse } from "@/lib/types/sportapi";
import {
  getFootballCallsUsedToday,
  getRemainingFootballBudget,
} from "@/lib/sync/football-api-budget";
import {
  buildFootballBundleFromParts,
  filterFormForTeam,
  findStandingsRow,
} from "@/lib/sync/build-football-bundle";
import { markLeagueSynced, selectLeaguesForSync } from "@/lib/sync/sync-league-scheduler";

export interface SyncRunResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  footballApiCalls: number;
  weatherApiCalls: number;
  leaguesSynced: number;
  fixturesSynced: number;
  bundlesSynced: number;
  primaryProvider?: string;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

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

  const remaining = await getRemainingFootballBudget();
  if (remaining < 1) return cached?.season_id ?? null;

  const { data: seasonsRes, provider } = await gatewayGetSeasons(uniqueTournamentId);
  const seasonId = seasonsRes.seasons?.[0]?.id;
  if (!seasonId) return null;

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

export async function runFootballDataSync(options?: {
  force?: boolean;
  ignoreSchedule?: boolean;
}): Promise<SyncRunResult> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return {
      ok: false,
      reason: "Missing SUPABASE_SERVICE_ROLE_KEY",
      footballApiCalls: 0,
      weatherApiCalls: 0,
      leaguesSynced: 0,
      fixturesSynced: 0,
      bundlesSynced: 0,
    };
  }

  const now = new Date();
  const hourUtc = getSyncCronHourUtc();
  const { data: state } = await supabase.from("data_sync_state").select("*").eq("id", 1).maybeSingle();

  if (!options?.force && !options?.ignoreSchedule) {
    if (state?.last_sync_date === todayDateString()) {
      return {
        ok: true,
        skipped: true,
        reason: "Already synced today",
        footballApiCalls: await getFootballCallsUsedToday(),
        weatherApiCalls: 0,
        leaguesSynced: 0,
        fixturesSynced: 0,
        bundlesSynced: 0,
      };
    }
    if (now.getUTCHours() < hourUtc) {
      return {
        ok: true,
        skipped: true,
        reason: `Sync runs after ${hourUtc}:00 UTC`,
        footballApiCalls: await getFootballCallsUsedToday(),
        weatherApiCalls: 0,
        leaguesSynced: 0,
        fixturesSynced: 0,
        bundlesSynced: 0,
      };
    }
  }

  const { data: runRow, error: runErr } = await supabase
    .from("data_sync_runs")
    .insert({ status: "running", primary_provider: getPrimaryProviderName() })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return {
      ok: false,
      reason: runErr?.message ?? "Failed to create sync run",
      footballApiCalls: 0,
      weatherApiCalls: 0,
      leaguesSynced: 0,
      fixturesSynced: 0,
      bundlesSynced: 0,
    };
  }

  const runId = runRow.id;
  let weatherApiCalls = 0;
  let leaguesSynced = 0;
  let fixturesSynced = 0;
  let bundlesSynced = 0;

  const leagueIds = getSyncLeagueIds();
  const useTieredScheduler =
    process.env.SYNC_LEAGUE_IDS?.trim().toLowerCase() === "all" || leagueIds.length > 15;

  const syncSchedule = useTieredScheduler
    ? await selectLeaguesForSync(supabase, { force: options?.force })
    : leagueIds.map((id) => ({
        referenceLeagueId: id,
        syncTeams: true,
        syncFixtures: true,
      }));

  const maxMatches = getSyncMaxMatchesPerLeague();
  const bundlesToBuild: Array<
    ReturnType<typeof mapEventToFixtureOption> & {
      leagueId: number;
      seasonId: number;
      uniqueTournamentId: number;
      event: SportApiEvent;
    }
  > = [];
  const lastEventsByLeague = new Map<number, SportApiEvent[]>();
  const standingsByLeague = new Map<number, SportApiStandingsResponse>();

  try {
    for (const entry of syncSchedule) {
      const referenceLeagueId = entry.referenceLeagueId;
      const mapping = resolveSportApiLeague(referenceLeagueId);
      const league = getLeagueById(referenceLeagueId);
      if (!mapping || !league) continue;

      let remaining = await getRemainingFootballBudget();
      if (remaining < 2) break;

      const seasonId = await resolveSeasonId(supabase, mapping.uniqueTournamentId, referenceLeagueId);
      if (!seasonId) continue;

      const entityType = getLeagueEntityType(referenceLeagueId);

      if (entry.syncTeams) {
        const { data: standingsRes, provider } = await gatewayGetStandings(
          mapping.uniqueTournamentId,
          seasonId
        );
        standingsByLeague.set(referenceLeagueId, standingsRes);

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
            synced_at: now.toISOString(),
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
          syncedAt: now.toISOString(),
        });
      }

      remaining = await getRemainingFootballBudget();
      if (remaining < 1) break;

      const { data: lastRes } = await gatewayGetLastMatches(mapping.uniqueTournamentId, seasonId);
      lastEventsByLeague.set(referenceLeagueId, lastRes.events ?? []);

      if (entry.syncFixtures) {
        remaining = await getRemainingFootballBudget();
        if (remaining > 0) {
          const { data: nextRes } = await gatewayGetNextMatches(
            mapping.uniqueTournamentId,
            seasonId
          );
          const seenNext = new Set<number>();

          for (const event of nextRes.events ?? []) {
            if (seenNext.has(event.id) || !isValidEventForSync(event)) continue;
            seenNext.add(event.id);

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
                synced_at: now.toISOString(),
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
                synced_at: now.toISOString(),
              },
              { onConflict: "event_id" }
            );

            bundlesToBuild.push({
              ...option,
              leagueId: referenceLeagueId,
              seasonId,
              uniqueTournamentId: mapping.uniqueTournamentId,
              event,
            });

            fixturesSynced += 1;
          }
        }
      }

      const seen = new Set<number>();
      const events: SportApiEvent[] = [];
      for (const e of lastRes.events ?? []) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        events.push(e);
      }

      leaguesSynced += 1;
      await markLeagueSynced(supabase, referenceLeagueId, {
        teams: entry.syncTeams,
        fixtures: entry.syncFixtures,
      });

      for (const event of events.slice(0, maxMatches)) {
        if (!isValidEventForSync(event)) continue;
        const option = mapEventToFixtureOption(event, referenceLeagueId, league.season);

        await supabase.from("synced_events").upsert(
          {
            event_id: event.id,
            unique_tournament_id: mapping.uniqueTournamentId,
            season_id: seasonId,
            reference_league_id: referenceLeagueId,
            kickoff_at: option.date,
            status_type: event.status?.type ?? null,
            payload: event,
            synced_at: now.toISOString(),
          },
          { onConflict: "event_id" }
        );
      }
    }

    const seenBundles = new Set<number>();
    for (const f of bundlesToBuild) {
      if (seenBundles.has(f.id)) continue;
      seenBundles.add(f.id);
      let remaining = await getRemainingFootballBudget();
      if (remaining < 3) break;

      const league = getLeagueById(f.leagueId);
      if (!league) continue;

      const standingsRes = standingsByLeague.get(f.leagueId);
      const lastEvents = lastEventsByLeague.get(f.leagueId) ?? [];

      const event: SportApiEvent = f.event;

      const { data: statsRes } = await gatewayGetMatchStatistics(f.id);
      remaining = await getRemainingFootballBudget();
      if (remaining < 2) break;

      const { data: lineupsRes } = await gatewayGetMatchLineups(f.id);
      remaining = await getRemainingFootballBudget();
      if (remaining < 1) break;

      const { data: h2hRes } = await gatewayGetMatchH2H(f.id);

      await supabase.from("synced_event_statistics").upsert({
        event_id: f.id,
        payload: statsRes,
        synced_at: now.toISOString(),
      });
      await supabase.from("synced_event_lineups").upsert({
        event_id: f.id,
        payload: lineupsRes,
        confirmed: lineupsRes.confirmed ?? null,
        synced_at: now.toISOString(),
      });
      await supabase.from("synced_event_h2h").upsert({
        event_id: f.id,
        payload: h2hRes,
        synced_at: now.toISOString(),
      });

      remaining = await getRemainingFootballBudget();
      if (remaining > 0) {
        const { data: incidentsRes } = await gatewayGetMatchIncidents(f.id);
        await supabase.from("synced_event_incidents").upsert({
          event_id: f.id,
          payload: incidentsRes,
          synced_at: now.toISOString(),
        });
      }

      const bundle = buildFootballBundleFromParts({
        event,
        referenceLeagueId: f.leagueId,
        season: league.season,
        homeTeamId: f.home.id,
        awayTeamId: f.away.id,
        statistics: statsRes,
        lineups: lineupsRes,
        homeStandingsRow: standingsRes ? findStandingsRow(standingsRes, f.home.id) : undefined,
        awayStandingsRow: standingsRes ? findStandingsRow(standingsRes, f.away.id) : undefined,
        homeFormEvents: filterFormForTeam(lastEvents, f.home.id),
        awayFormEvents: filterFormForTeam(lastEvents, f.away.id),
        h2hEvents: h2hRes.events ?? [],
        venueCity: f.venueCity,
      });

      await supabase.from("synced_match_bundles").upsert(
        {
          match_id: f.id,
          league_id: f.leagueId,
          home_team_id: f.home.id,
          away_team_id: f.away.id,
          bundle: bundle as unknown,
          synced_at: now.toISOString(),
        },
        { onConflict: "match_id" }
      );

      bundlesSynced += 1;
    }

    const weatherSeen = new Set<string>();
    for (const f of bundlesToBuild.slice(0, 2)) {
      const key = `${f.venueCity.toLowerCase()}|${f.date.slice(0, 10)}`;
      if (weatherSeen.has(key)) continue;
      weatherSeen.add(key);
      try {
        weatherApiCalls += 1;
        const forecast = await getWeatherForecast(f.venueCity, f.date, { allowLive: true });
        await supabase.from("synced_weather").upsert({
          city_key: f.venueCity.trim().toLowerCase(),
          forecast_date: f.date.slice(0, 10),
          forecast: forecast as unknown,
        });
      } catch (e) {
        console.warn("Weather sync skipped:", e);
      }
    }

    const footballApiCalls = await getFootballCallsUsedToday();
    const intervalDays = getSyncIntervalDays();
    const nextSync = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    await supabase
      .from("data_sync_runs")
      .update({
        status: "success",
        finished_at: now.toISOString(),
        football_api_calls: footballApiCalls,
        weather_api_calls: weatherApiCalls,
        leagues_synced: leaguesSynced,
        fixtures_synced: fixturesSynced,
        bundles_synced: bundlesSynced,
      })
      .eq("id", runId);

    await supabase.from("data_sync_state").upsert({
      id: 1,
      last_success_at: now.toISOString(),
      next_sync_after: nextSync.toISOString(),
      last_sync_date: todayDateString(),
      sync_hour_utc: hourUtc,
      last_run_id: runId,
    });

    return {
      ok: true,
      footballApiCalls,
      weatherApiCalls,
      leaguesSynced,
      fixturesSynced,
      bundlesSynced,
      primaryProvider: getPrimaryProviderName(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    const footballApiCalls = await getFootballCallsUsedToday();

    await supabase
      .from("data_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        football_api_calls: footballApiCalls,
        weather_api_calls: weatherApiCalls,
        error_message: message,
      })
      .eq("id", runId);

    return {
      ok: false,
      reason: message,
      footballApiCalls,
      weatherApiCalls,
      leaguesSynced,
      fixturesSynced,
      bundlesSynced,
    };
  }
}

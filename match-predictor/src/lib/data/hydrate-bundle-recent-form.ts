import { mapEventToFixtureResult } from "@/lib/api/sportapi/mappers";
import { resolveFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
import { isMockFixtureForm } from "@/lib/mocks/football";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { FootballBundle } from "@/lib/types/football";

/**
 * Replace placeholder recent-form rows (mock bundle / stale cache) with finished
 * matches from `synced_events` when Supabase is available.
 */
export async function hydrateFootballBundleRecentForm(
  bundle: FootballBundle,
  options: {
    homeTeamId: number;
    awayTeamId: number;
    homeLeagueId?: number;
    awayLeagueId?: number;
    homeTeamName?: string;
    awayTeamName?: string;
  }
): Promise<FootballBundle> {
  if (!isMockFixtureForm(bundle.homeForm) && !isMockFixtureForm(bundle.awayForm)) {
    return bundle;
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) return bundle;

  const leagueId = bundle.fixture.league.id;
  const homeLeagueId = options.homeLeagueId ?? leagueId;
  const awayLeagueId = options.awayLeagueId ?? leagueId;
  const homeName =
    options.homeTeamName?.trim() ||
    bundle.fixture.teams.home.name ||
    bundle.homeTeamInfo.team.name;
  const awayName =
    options.awayTeamName?.trim() ||
    bundle.fixture.teams.away.name ||
    bundle.awayTeamInfo.team.name;

  const [homeFormEvents, awayFormEvents] = await Promise.all([
    resolveFormEventsForTeam(supabase, homeLeagueId, options.homeTeamId, homeName),
    resolveFormEventsForTeam(supabase, awayLeagueId, options.awayTeamId, awayName),
  ]);

  if (!homeFormEvents.length && !awayFormEvents.length) {
    return bundle;
  }

  return {
    ...bundle,
    homeForm: homeFormEvents.length
      ? homeFormEvents.slice(0, 5).map(mapEventToFixtureResult)
      : bundle.homeForm,
    awayForm: awayFormEvents.length
      ? awayFormEvents.slice(0, 5).map(mapEventToFixtureResult)
      : bundle.awayForm,
  };
}

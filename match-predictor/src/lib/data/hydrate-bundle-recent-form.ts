import { resolveRecentFormFixturesForTeam } from "@/lib/data/assemble-football-bundle";
import {
  needsRecentFormHydration,
} from "@/lib/fbref/comparison-fallback";
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
  const homeNeeds =
    isMockFixtureForm(bundle.homeForm) || needsRecentFormHydration(bundle.homeForm);
  const awayNeeds =
    isMockFixtureForm(bundle.awayForm) || needsRecentFormHydration(bundle.awayForm);
  if (!homeNeeds && !awayNeeds) {
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

  const [homeForm, awayForm] = await Promise.all([
    homeNeeds
      ? resolveRecentFormFixturesForTeam(
          supabase,
          homeLeagueId,
          options.homeTeamId,
          homeName
        )
      : Promise.resolve(bundle.homeForm),
    awayNeeds
      ? resolveRecentFormFixturesForTeam(
          supabase,
          awayLeagueId,
          options.awayTeamId,
          awayName
        )
      : Promise.resolve(bundle.awayForm),
  ]);

  if (!homeForm.length && !awayForm.length) {
    return bundle;
  }

  return {
    ...bundle,
    homeForm: homeForm.length ? homeForm : bundle.homeForm,
    awayForm: awayForm.length ? awayForm : bundle.awayForm,
  };
}

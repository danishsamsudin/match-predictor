import { NATIONS_LEAGUE_REFERENCE_LEAGUE_ID } from "@/lib/data/nations-league-2026-teams";
import { squadPlayersToFixtureLineup } from "@/lib/prediction/build-custom-lineup";
import { computePlayerPropsForMatch } from "@/lib/prediction/compute-player-props-for-match";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import { resolveBulinewsPredictedXi } from "@/lib/nations-league/resolve-bulinews-predicted-xi";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { FixtureLineup } from "@/lib/types/football";
import type { SquadPlayer } from "@/lib/types/team-comparison";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function rosterFromSquad(starters: SquadPlayer[], substitutes: SquadPlayer[]): SquadPlayer[] {
  return [...starters, ...substitutes];
}

/**
 * Project BuliNews (or committed) predicted XIs so hub-locked player props
 * only allocate among the most-likely starting elevens.
 */
async function resolveNlHubProjectedLineups(input: {
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeName: string;
  awayName: string;
}): Promise<FixtureLineup[] | undefined> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return undefined;

  const [homeSquad, awaySquad] = await Promise.all([
    loadTeamSquadForComparison(
      supabase,
      input.homeTeamApiId,
      input.homeName,
      NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
      "national"
    ),
    loadTeamSquadForComparison(
      supabase,
      input.awayTeamApiId,
      input.awayName,
      NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
      "national"
    ),
  ]);

  const homeRoster = rosterFromSquad(homeSquad.starters, homeSquad.substitutes);
  const awayRoster = rosterFromSquad(awaySquad.starters, awaySquad.substitutes);

  // Empty national Scoutlyst/lineups is common for pure NL sides (e.g. Georgia).
  // BuliNews still builds a full synthetic XI from the committed predicted lineups.
  const homeXi = resolveBulinewsPredictedXi({
    teamName: input.homeName,
    opponentName: input.awayName,
    sideHint: "home",
    roster: homeRoster,
  });
  const awayXi = resolveBulinewsPredictedXi({
    teamName: input.awayName,
    opponentName: input.homeName,
    sideHint: "away",
    roster: awayRoster,
  });

  if (!homeXi || !awayXi || homeXi.starters.length < 11 || awayXi.starters.length < 11) {
    return undefined;
  }

  return [
    squadPlayersToFixtureLineup(
      input.homeTeamApiId,
      input.homeName,
      homeXi.formation ?? homeSquad.preferredFormation,
      homeXi.starters,
      homeXi.roster
    ),
    squadPlayersToFixtureLineup(
      input.awayTeamApiId,
      input.awayName,
      awayXi.formation ?? awaySquad.preferredFormation,
      awayXi.starters,
      awayXi.roster
    ),
  ];
}

/**
 * Compute and attach player props into the hub prediction snapshot so
 * nl:postmatch evaluate/calibrate can train against locked pre-match lines.
 */
export async function attachNlPlayerPropsToHubPrediction(
  match: WcMatchRow,
  hubRow: HubPredictionRow
): Promise<HubPredictionRow> {
  const homeName = match.home_team_name ?? "Home";
  const awayName = match.away_team_name ?? "Away";
  if (!match.home_team_id || !match.away_team_id) return hubRow;

  const homeTeamApiId = resolveApiTeamId(match.home_team_id, homeName);
  const awayTeamApiId = resolveApiTeamId(match.away_team_id, awayName);
  if (!homeTeamApiId || !awayTeamApiId) return hubRow;

  const snap = hubRow.snapshot ?? {};
  const homeXg = Number(snap.home_xg ?? snap.lambda ?? 1.2);
  const awayXg = Number(snap.away_xg ?? snap.mu ?? 1.1);

  const customLineups = await resolveNlHubProjectedLineups({
    homeTeamApiId,
    awayTeamApiId,
    homeName,
    awayName,
  }).catch(() => undefined);

  const playerProps = await computePlayerPropsForMatch({
    homeTeamId: homeTeamApiId,
    awayTeamId: awayTeamApiId,
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeLeagueId: NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
    awayLeagueId: NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
    entityType: "national",
    homeXg,
    awayXg,
    homeTeamExpectedSot: homeXg * 4.2,
    awayTeamExpectedSot: awayXg * 4.2,
    homeDbTeamId: match.home_team_id,
    awayDbTeamId: match.away_team_id,
    modelVersion: hubRow.model_version,
    tournamentSource: "nations_league",
    customLineups,
  }).catch(() => null);

  if (!playerProps) return hubRow;

  return {
    ...hubRow,
    snapshot: {
      ...snap,
      home_team_api_id: homeTeamApiId,
      away_team_api_id: awayTeamApiId,
      player_props: playerProps as PlayerPropsPayload,
    },
  };
}

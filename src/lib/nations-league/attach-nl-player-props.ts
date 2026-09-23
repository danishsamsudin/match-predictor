import { NATIONS_LEAGUE_REFERENCE_LEAGUE_ID } from "@/lib/data/nations-league-2026-teams";
import { computePlayerPropsForMatch } from "@/lib/prediction/compute-player-props-for-match";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcMatchRow } from "@/lib/world-cup/standings";

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

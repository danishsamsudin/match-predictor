import { NATIONS_LEAGUE_REFERENCE_LEAGUE_ID } from "@/lib/data/nations-league-2026-teams";
import { getNationalTeamBaseCity } from "@/lib/data/national-team-geography";
import { runNlGrahamPredict } from "@/lib/nations-league/nl-predict";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { GroupStandingRow, WcMatchRow } from "@/lib/world-cup/standings";
import type { PredictRequest } from "@/lib/types/prediction";

export const HUB_NL_GRAHAM_PREDICT_SOURCE = "graham-nl-hub";

export function buildNlHubPredictRequestFromMatch(match: WcMatchRow): PredictRequest | null {
  const homeName = match.home_team_name ?? "Home";
  const awayName = match.away_team_name ?? "Away";
  const homeTeamId = resolveApiTeamId(match.home_team_id!, homeName);
  const awayTeamId = resolveApiTeamId(match.away_team_id!, awayName);
  if (!homeTeamId || !awayTeamId) return null;

  const date = match.date?.trim().slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const leagueId = NATIONS_LEAGUE_REFERENCE_LEAGUE_ID;
  return {
    mode: "compare",
    entityType: "national",
    homeTeamId,
    awayTeamId,
    homeLeagueId: leagueId,
    awayLeagueId: leagueId,
    homeTeamName: homeName,
    awayTeamName: awayName,
    city: normalizePredictorVenueCity(match.venue_city, {
      defaultWhenUnknown: getNationalTeamBaseCity(homeTeamId, homeName) ?? "London",
    }),
    matchDate: date,
  };
}

export async function runNlHubMainPredict(
  match: WcMatchRow,
  options?: {
    finishedMatches?: WcMatchRow[];
    standings?: GroupStandingRow[];
  }
): Promise<HubPredictionRow | null> {
  const homeName = match.home_team_name ?? "Home";
  const awayName = match.away_team_name ?? "Away";
  if (!match.home_team_id || !match.away_team_id) return null;

  return runNlGrahamPredict({
    match,
    homeName,
    awayName,
    finishedMatches: options?.finishedMatches ?? [],
    standings: options?.standings,
  });
}

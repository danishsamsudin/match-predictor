import { resolveSingleFixtureMotivation } from "@/lib/world-cup/motivation";
import { runGrahamWorldCupPredict } from "@/lib/world-cup/graham-predict";
import { PREDICTOR_PREFILL_DEFAULTS } from "@/lib/world-cup/predictor-prefill";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import type { PredictRequest } from "@/lib/types/prediction";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export const HUB_GRAHAM_PREDICT_SOURCE = "graham-wc-hub";

export type HubPredictionRow = {
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  predicted_score_home: number;
  predicted_score_away: number;
  under_2_5_pct: number;
  over_2_5_pct: number;
  model_version: string;
  snapshot: Record<string, unknown>;
};

/** @deprecated Legacy v2.1 main-predict path — WC hub uses Graham model. */
export const HUB_MAIN_PREDICT_SOURCE = HUB_GRAHAM_PREDICT_SOURCE;

/** Deep-link payload for the standalone compare predictor (legacy v2.1 UI). */
export function buildHubPredictRequestFromMatch(match: WcMatchRow): PredictRequest | null {
  const homeName = match.home_team_name ?? "Home";
  const awayName = match.away_team_name ?? "Away";
  const homeTeamId = resolveApiTeamId(match.home_team_id!, homeName);
  const awayTeamId = resolveApiTeamId(match.away_team_id!, awayName);
  if (!homeTeamId || !awayTeamId) return null;

  const date = match.date?.trim().slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const leagueId = PREDICTOR_PREFILL_DEFAULTS.nationalLeagueId;
  return {
    mode: "compare",
    entityType: "national",
    homeTeamId,
    awayTeamId,
    homeLeagueId: leagueId,
    awayLeagueId: leagueId,
    homeTeamName: homeName,
    awayTeamName: awayName,
    city: normalizePredictorVenueCity(match.venue_city, { defaultWhenUnknown: "Mexico City" }),
    matchDate: date,
  };
}

export function mapPredictionResultToHubRow(): HubPredictionRow | null {
  return null;
}

export async function runHubMainPredict(
  match: WcMatchRow,
  options?: {
    finishedMatches?: WcMatchRow[];
    standingsBeforeMd3?: Parameters<typeof resolveSingleFixtureMotivation>[2];
  }
): Promise<HubPredictionRow | null> {
  const homeName = match.home_team_name ?? "Home";
  const awayName = match.away_team_name ?? "Away";
  const homeId = match.home_team_id;
  const awayId = match.away_team_id;
  if (!homeId || !awayId) return null;

  const motivation = resolveSingleFixtureMotivation(
    homeId,
    awayId,
    options?.standingsBeforeMd3 ?? [],
    homeName,
    awayName
  );

  return runGrahamWorldCupPredict({
    match,
    homeName,
    awayName,
    finishedMatches: options?.finishedMatches ?? [],
    motivation,
    priorHomeVenueTz: null,
    priorAwayVenueTz: null,
  });
}

export async function runHubGrahamPredict(
  match: WcMatchRow,
  finishedMatches: WcMatchRow[] = []
): Promise<HubPredictionRow | null> {
  return runHubMainPredict(match, { finishedMatches });
}

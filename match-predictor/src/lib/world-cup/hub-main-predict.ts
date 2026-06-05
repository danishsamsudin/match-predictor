import { runPrediction } from "@/lib/prediction/engine";
import type { PredictRequest, PredictionResult } from "@/lib/types/prediction";
import { PREDICTOR_PREFILL_DEFAULTS } from "@/lib/world-cup/predictor-prefill";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export const HUB_MAIN_PREDICT_SOURCE = "main-predict";

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

/** Same inputs as the World Cup hub → predict page deep link (national compare, FIFA WC). */
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

/** Map main predict output to world_cup_predictions row (probabilities stored as 0–1). */
export function mapPredictionResultToHubRow(result: PredictionResult): HubPredictionRow | null {
  const analytics = result.analytics;
  const top = analytics?.topScores?.[0];
  if (!top) return null;

  const ou25 = analytics?.overUnder?.find((line) => line.line === 2.5);
  const overPct = ou25?.overPct ?? 0;
  const underPct = ou25?.underPct ?? 100 - overPct;

  const homeXg = result.expectedGoals.home;
  const awayXg = result.expectedGoals.away;
  const modelVersion = result.modelVersion ?? HUB_MAIN_PREDICT_SOURCE;

  return {
    home_win_pct: Number((result.homeWinPct / 100).toFixed(4)),
    draw_pct: Number((result.drawPct / 100).toFixed(4)),
    away_win_pct: Number((result.awayWinPct / 100).toFixed(4)),
    predicted_score_home: top.home,
    predicted_score_away: top.away,
    under_2_5_pct: Number((underPct / 100).toFixed(4)),
    over_2_5_pct: Number((overPct / 100).toFixed(4)),
    model_version: modelVersion,
    snapshot: {
      source: HUB_MAIN_PREDICT_SOURCE,
      lambda: homeXg,
      mu: awayXg,
      home_xg: homeXg,
      away_xg: awayXg,
      scenario: `main-predict (${modelVersion})`,
      btts_pct: analytics?.btts?.yesPct ?? null,
      top_score_prob_pct: top.probability,
      momentum_index: analytics?.momentumIndex ?? null,
    },
  };
}

export async function runHubMainPredict(match: WcMatchRow): Promise<HubPredictionRow | null> {
  const request = buildHubPredictRequestFromMatch(match);
  if (!request) return null;
  const result = await runPrediction(request);
  return mapPredictionResultToHubRow(result);
}

import { computePlayerPropsForMatch } from "@/lib/prediction/compute-player-props-for-match";
import { applyNlFormWeights } from "@/lib/nations-league/nl-form-weights";
import { loadNlCalibrationConfig } from "@/lib/nations-league/nl-calibration-config";
import { runNlHubMainPredict } from "@/lib/nations-league/hub-main-predict";
import type { ResolvedNlMatch } from "@/lib/nations-league/resolve-nl-match";
import type { PredictRequest, PredictionResult } from "@/lib/types/prediction";
import { buildWcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";
import {
  buildAnalyticsFromHubPrediction,
  grahamHubRowToPredictionResult,
} from "@/lib/world-cup/graham-prediction-adapter";
import { loadEnrichedFormForTeam } from "@/lib/world-cup/load-enriched-international-form";
import { enrichHubPredictionWithMarketModels } from "@/lib/world-cup/market-models/enrich-hub-prediction";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import { computeWcEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import type { SupabaseClient } from "@supabase/supabase-js";

async function loadFinishedNlMatches(supabase: SupabaseClient): Promise<WcMatchRow[]> {
  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const { data: rows } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "finished")
    .ilike("competition", "%Nations League%");

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
    group_code: row.group_code,
    status: row.status,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    home_team_name: row.home_team_id
      ? teamNames.get(String(row.home_team_id))
      : undefined,
    away_team_name: row.away_team_id
      ? teamNames.get(String(row.away_team_id))
      : undefined,
    venue_city: row.venue_city ?? row.venue,
    venue: row.venue,
    competition: row.competition,
    round: row.round,
  }));
}

export async function runNlGrahamPredictForRequest(input: {
  request: PredictRequest;
  resolved: ResolvedNlMatch;
  supabase: SupabaseClient;
}): Promise<PredictionResult | null> {
  const { request, resolved, supabase } = input;
  const match = resolved.match;
  const homeName = match.home_team_name ?? request.homeTeamName ?? "Home";
  const awayName = match.away_team_name ?? request.awayTeamName ?? "Away";

  const finishedMatches = await loadFinishedNlMatches(supabase);
  const calibration = await loadNlCalibrationConfig();
  const hubRowBase = await runNlHubMainPredict(match, { finishedMatches });
  if (!hubRowBase) return null;

  let hubRow = hubRowBase;

  const homeTeamApiId = resolveApiTeamId(match.home_team_id!, homeName);
  const awayTeamApiId = resolveApiTeamId(match.away_team_id!, awayName);

  const [homeFormRaw, awayFormRaw] = await Promise.all([
    loadEnrichedFormForTeam(supabase, match.home_team_id!, homeName, finishedMatches),
    loadEnrichedFormForTeam(supabase, match.away_team_id!, awayName, finishedMatches),
  ]);
  const homeFormMatches = applyNlFormWeights(homeFormRaw);
  const awayFormMatches = applyNlFormWeights(awayFormRaw);

  const structuralHomeXg = Number(
    hubRow.snapshot.home_xg ?? hubRow.snapshot.lambda ?? 1.2
  );
  const structuralAwayXg = Number(
    hubRow.snapshot.away_xg ?? hubRow.snapshot.mu ?? 1.2
  );

  const analyticsContext = await buildWcPredictionAnalyticsContext({
    snapshot: hubRow.snapshot,
    homeXg: structuralHomeXg,
    awayXg: structuralAwayXg,
    homeTeamApiId,
    awayTeamApiId,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeName,
    awayName,
    homeFormMatches,
    awayFormMatches,
    supabase,
  });

  const isKnockout = /quarter-?final|semi-?final|third place|final\b|knockout|promotion|relegation/i.test(
    `${match.round ?? ""} ${match.competition ?? ""}`
  );

  let enriched = enrichHubPredictionWithMarketModels({
    hubRow,
    calibration,
    homeName,
    awayName,
    analyticsContext,
    isKnockout,
  });

  const estimated = computeWcEstimatedMatchStats({
    homeTeamApiId,
    awayTeamApiId,
    homeName,
    awayName,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeXg: enriched.displayHomeXg,
    awayXg: enriched.displayAwayXg,
    finishedMatches,
    homeFormMatches,
    awayFormMatches,
    calibration,
    isKnockout,
    refereeStrictness: Number(hubRow.snapshot.referee_strictness ?? 1),
  });

  enriched = enrichHubPredictionWithMarketModels({
    hubRow: enriched.hubRow,
    calibration,
    homeName,
    awayName,
    analyticsContext,
    estimated,
    isKnockout,
  });
  hubRow = enriched.hubRow;

  const analytics = buildAnalyticsFromHubPrediction(
    hubRow,
    homeName,
    awayName,
    analyticsContext,
    calibration
  );

  const result = grahamHubRowToPredictionResult({
    pred: hubRow,
    homeName,
    awayName,
    estimated,
    analyticsContext,
    calibration,
    analytics,
    explanation: `NL Graham (${hubRow.model_version}) - ${homeName} vs ${awayName}`,
  });

  const playerProps = await computePlayerPropsForMatch({
    homeTeamId: homeTeamApiId,
    awayTeamId: awayTeamApiId,
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeLeagueId: request.homeLeagueId,
    awayLeagueId: request.awayLeagueId,
    entityType: "national",
    homeXg: enriched.displayHomeXg,
    awayXg: enriched.displayAwayXg,
    homeTeamExpectedSot: enriched.displayHomeXg * 4.2,
    awayTeamExpectedSot: enriched.displayAwayXg * 4.2,
    teamComparison: analyticsContext.teamComparison,
    customLineups: request.customLineups,
    homeFormMatches,
    awayFormMatches,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    modelVersion: result.modelVersion,
    tournamentSource: "nations_league",
  }).catch(() => null);

  if (playerProps) {
    result.playerProps = playerProps;
    if (result.analytics) {
      result.analytics.playerProps = playerProps;
    }
  }

  return result;
}

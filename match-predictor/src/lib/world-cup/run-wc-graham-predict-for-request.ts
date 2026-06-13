import { grahamHubRowToPredictionResult } from "@/lib/world-cup/graham-prediction-adapter";
import { runHubMainPredict } from "@/lib/world-cup/hub-main-predict";
import { resolveMatchPhase, shouldRefreshHubPrediction } from "@/lib/world-cup/match-kickoff";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { computeWcEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { PredictRequest, PredictionResult } from "@/lib/types/prediction";
import type { SupabaseClient } from "@supabase/supabase-js";

function wcDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
}

async function loadFinishedWcMatches(
  supabase: SupabaseClient
): Promise<WcMatchRow[]> {
  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const { data: rows } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

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

export async function runWcGrahamPredictForRequest(input: {
  request: PredictRequest;
  resolved: ResolvedWcMatch;
  supabase: SupabaseClient;
}): Promise<PredictionResult | null> {
  const { request, resolved, supabase } = input;
  const match = resolved.match;
  const homeName = match.home_team_name ?? request.homeTeamName ?? "Home";
  const awayName = match.away_team_name ?? request.awayTeamName ?? "Away";

  const finishedMatches = await loadFinishedWcMatches(supabase);
  const hubRow = await runHubMainPredict(match, { finishedMatches });
  if (!hubRow) return null;

  const phase = resolveMatchPhase({
    date: match.date,
    time: match.time,
    status: match.status,
    homeGoals: match.home_goals,
    awayGoals: match.away_goals,
  });

  if (shouldRefreshHubPrediction(phase)) {
    await wcDb(supabase).from("world_cup_predictions").upsert({
      match_id: resolved.matchId,
      ...hubRow,
      computed_at: new Date().toISOString(),
    });
  }

  const homeXg = Number(hubRow.snapshot.home_xg ?? hubRow.snapshot.lambda ?? 1.2);
  const awayXg = Number(hubRow.snapshot.away_xg ?? hubRow.snapshot.mu ?? 1.2);
  const homeTeamApiId = resolveApiTeamId(match.home_team_id!, homeName);
  const awayTeamApiId = resolveApiTeamId(match.away_team_id!, awayName);

  const estimated = computeWcEstimatedMatchStats({
    homeTeamApiId,
    awayTeamApiId,
    homeName,
    awayName,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeXg,
    awayXg,
    finishedMatches,
  });

  return grahamHubRowToPredictionResult({
    pred: hubRow,
    homeName,
    awayName,
    estimated,
  });
}

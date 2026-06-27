import { alignFinishedMatchForDisplay } from "@/lib/world-cup/align-finished-match-for-display";
import { orientHubPredictionToMatch } from "@/lib/world-cup/orient-hub-prediction-to-match";
import { ingestSourceForMatch, loadIngestSourceByMatchId } from "@/lib/world-cup/load-ingest-source-by-match";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CalibrationEvalRow = {
  matchId: string;
  snapshot: Record<string, unknown>;
  actualHome: number;
  actualAway: number;
  matchDate: string;
};

type FinishedMatchRow = {
  id: string;
  date: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number;
  away_goals: number;
  ingest_source_home?: string | null;
  ingest_source_away?: string | null;
  ingest_source_home_goals?: number | null;
  ingest_source_away_goals?: number | null;
};

export async function loadOrientedCalibrationEvalRows(
  supabase: SupabaseClient
): Promise<CalibrationEvalRow[]> {
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, date, home_goals, away_goals, home_team_id, away_team_id")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup")
    .order("date", { ascending: true });

  if (matchErr) throw new Error(matchErr.message);

  const ingestByMatch = await loadIngestSourceByMatchId(
    supabase,
    (matches ?? []).map((m) => String(m.id))
  );

  const { data: preds, error: predErr } = await supabase
    .from("world_cup_predictions")
    .select("match_id, snapshot, home_win_pct, draw_pct, away_win_pct, predicted_score_home, predicted_score_away, under_2_5_pct, over_2_5_pct, model_version");

  if (predErr) throw new Error(predErr.message);

  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));
  const teamIds = [
    ...new Set(
      (matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[])
    ),
  ];
  const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), String(t.name)]));

  const rows: CalibrationEvalRow[] = [];

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const pred = predByMatch.get(String(m.id));
    if (!pred?.snapshot) continue;

    const ingest = ingestSourceForMatch(ingestByMatch, String(m.id));
    const display = alignFinishedMatchForDisplay(
      { ...(m as FinishedMatchRow), ...ingest },
      teamNames
    );
    if (!display) continue;

    const hubPred: HubPredictionRow = orientHubPredictionToMatch(
      {
        home_win_pct: Number(pred.home_win_pct),
        draw_pct: Number(pred.draw_pct),
        away_win_pct: Number(pred.away_win_pct),
        predicted_score_home: Number(pred.predicted_score_home),
        predicted_score_away: Number(pred.predicted_score_away),
        under_2_5_pct: Number(pred.under_2_5_pct),
        over_2_5_pct: Number(pred.over_2_5_pct),
        model_version: String(pred.model_version),
        snapshot: pred.snapshot as Record<string, unknown>,
      },
      display.homeTeamId,
      display.awayTeamId,
      display.homeTeamName,
      display.awayTeamName
    );

    rows.push({
      matchId: String(m.id),
      snapshot: hubPred.snapshot,
      actualHome: display.homeGoals,
      actualAway: display.awayGoals,
      matchDate: m.date ?? "",
    });
  }

  return rows;
}

export function splitTrainHoldout(
  rows: CalibrationEvalRow[],
  holdoutN: number
): { train: CalibrationEvalRow[]; holdout: CalibrationEvalRow[] } {
  if (rows.length <= holdoutN) {
    return { train: rows, holdout: [] };
  }
  return {
    train: rows.slice(0, -holdoutN),
    holdout: rows.slice(-holdoutN),
  };
}

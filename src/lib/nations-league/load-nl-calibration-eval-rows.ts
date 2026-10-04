import { splitTrainHoldout, type CalibrationEvalRow } from "@/lib/world-cup/load-calibration-eval-rows";
import type { SupabaseClient } from "@supabase/supabase-js";

export { splitTrainHoldout };
export type { CalibrationEvalRow };

export async function loadNlCalibrationEvalRows(
  supabase: SupabaseClient
): Promise<CalibrationEvalRow[]> {
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, date, home_goals, away_goals, home_team_id, away_team_id")
    .eq("status", "finished")
    .ilike("competition", "%Nations League%")
    .order("date", { ascending: true });

  if (matchErr) throw new Error(matchErr.message);

  const { data: preds, error: predErr } = await supabase
    .from("nations_league_predictions")
    .select(
      "match_id, snapshot, home_win_pct, draw_pct, away_win_pct, predicted_score_home, predicted_score_away, under_2_5_pct, over_2_5_pct, model_version"
    );
  if (predErr) throw new Error(predErr.message);

  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));
  const rows: CalibrationEvalRow[] = [];

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const pred = predByMatch.get(String(m.id));
    if (!pred?.snapshot) continue;
    const snapshot = pred.snapshot as Record<string, unknown>;
    if (snapshot.bootstrap === true) continue;

    rows.push({
      matchId: String(m.id),
      snapshot,
      actualHome: Number(m.home_goals),
      actualAway: Number(m.away_goals),
      matchDate: m.date ?? "",
    });
  }

  return rows;
}

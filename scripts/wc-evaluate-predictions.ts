/**
 * Evaluate locked world_cup_predictions against finished match results.
 *
 * Usage: npx tsx scripts/wc-evaluate-predictions.ts
 */
import type { HubPredictionRow } from "../src/lib/world-cup/hub-main-predict";
import { evaluateHubPredictionAgainstResult } from "../src/lib/world-cup/wc-prediction-eval";
import { countFinishedGroupMatches } from "../src/lib/world-cup/motivation";
import { tagWcMatchSegments } from "../src/lib/world-cup/wc-match-segments";
import { loadWcCalibrationConfig } from "../src/lib/world-cup/wc-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const calibration = await loadWcCalibrationConfig();

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, home_goals, away_goals, home_team_id, away_team_id, date, time, group_code, round, competition, venue_city, status")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  if (matchErr) throw new Error(matchErr.message);

  const { data: preds, error: predErr } = await supabase
    .from("world_cup_predictions")
    .select("*");

  if (predErr) throw new Error(predErr.message);

  const predByMatch = new Map((preds ?? []).map((p) => [p.match_id as string, p]));
  let evaluated = 0;

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const predRow = predByMatch.get(String(m.id));
    if (!predRow) continue;

    const hubPred: HubPredictionRow = {
      home_win_pct: Number(predRow.home_win_pct),
      draw_pct: Number(predRow.draw_pct),
      away_win_pct: Number(predRow.away_win_pct),
      predicted_score_home: Number(predRow.predicted_score_home),
      predicted_score_away: Number(predRow.predicted_score_away),
      under_2_5_pct: Number(predRow.under_2_5_pct),
      over_2_5_pct: Number(predRow.over_2_5_pct),
      model_version: String(predRow.model_version),
      snapshot: (predRow.snapshot as Record<string, unknown>) ?? {},
    };

    const scores = evaluateHubPredictionAgainstResult(
      hubPred,
      m.home_goals,
      m.away_goals
    );

    const segments = tagWcMatchSegments({
      match: {
        id: String(m.id),
        date: m.date,
        time: m.time,
        group_code: m.group_code,
        status: m.status,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_goals: m.home_goals,
        away_goals: m.away_goals,
        round: m.round,
        competition: m.competition,
        venue_city: m.venue_city,
      },
      snapshot: hubPred.snapshot,
      finishedGroupMatchesForHome: m.home_team_id
        ? countFinishedGroupMatches(String(m.home_team_id), matches ?? [])
        : 0,
      finishedGroupMatchesForAway: m.away_team_id
        ? countFinishedGroupMatches(String(m.away_team_id), matches ?? [])
        : 0,
    });

    const { error } = await supabase.from("world_cup_prediction_evaluations").upsert(
      {
        match_id: String(m.id),
        model_version: hubPred.model_version,
        calibration_version: calibration.modelVersion,
        actual_score_home: m.home_goals,
        actual_score_away: m.away_goals,
        market_scores: { ...scores, segments },
        computed_at: new Date().toISOString(),
      },
      { onConflict: "match_id" }
    );

    if (error) throw new Error(error.message);
    evaluated += 1;

    console.log(
      `Match ${m.id}: ${m.home_goals}-${m.away_goals} | composite=${scores.compositeLoss.toFixed(4)} brier1x2=${scores.brier1x2.toFixed(4)}`
    );
  }

  console.log(`\nEvaluated ${evaluated} finished WC matches.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

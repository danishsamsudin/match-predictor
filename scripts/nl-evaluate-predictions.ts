/**
 * Score locked Nations League match odds against finished results.
 *
 * Usage: npx tsx scripts/nl-evaluate-predictions.ts
 */
import { loadNlCalibrationConfig } from "../src/lib/nations-league/nl-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { scoreLockedPrediction } from "../src/lib/world-cup/wc-prediction-eval";
import type { HubPredictionRow } from "../src/lib/world-cup/hub-main-predict";

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

  const calibration = await loadNlCalibrationConfig();

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, home_goals, away_goals, home_team_id, away_team_id, date, time, group_code, round, competition, status"
    )
    .eq("status", "finished")
    .ilike("competition", "%Nations League%")
    .order("date", { ascending: true });
  if (matchErr) throw new Error(matchErr.message);

  const { data: preds, error: predErr } = await supabase.from("nations_league_predictions").select("*");
  if (predErr) throw new Error(predErr.message);
  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));

  const teamIds = [
    ...new Set(
      (matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[])
    ),
  ];
  const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), String(t.name)]));

  let evaluated = 0;
  let skippedNoLock = 0;
  let skippedBootstrap = 0;

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const predRow = predByMatch.get(String(m.id));
    if (!predRow) {
      skippedNoLock += 1;
      continue;
    }
    const snapshot = (predRow.snapshot as Record<string, unknown>) ?? {};
    if (snapshot.bootstrap === true) {
      skippedBootstrap += 1;
      continue;
    }

    const hubPred: HubPredictionRow = {
      home_win_pct: Number(predRow.home_win_pct),
      draw_pct: Number(predRow.draw_pct),
      away_win_pct: Number(predRow.away_win_pct),
      predicted_score_home: Number(predRow.predicted_score_home),
      predicted_score_away: Number(predRow.predicted_score_away),
      under_2_5_pct: Number(predRow.under_2_5_pct),
      over_2_5_pct: Number(predRow.over_2_5_pct),
      model_version: String(predRow.model_version),
      snapshot,
    };

    const scores = scoreLockedPrediction(hubPred, Number(m.home_goals), Number(m.away_goals));
    const homeName = m.home_team_id ? teamNames.get(String(m.home_team_id)) ?? "Home" : "Home";
    const awayName = m.away_team_id ? teamNames.get(String(m.away_team_id)) ?? "Away" : "Away";

    const { error } = await supabase.from("nations_league_prediction_evaluations").upsert(
      {
        match_id: String(m.id),
        model_version: hubPred.model_version,
        calibration_version: calibration.modelVersion,
        actual_score_home: Number(m.home_goals),
        actual_score_away: Number(m.away_goals),
        market_scores: {
          ...scores,
          segments: {
            group_code: m.group_code ?? null,
            match_date: m.date ?? null,
            home_name: homeName,
            away_name: awayName,
          },
        },
        computed_at: new Date().toISOString(),
      },
      { onConflict: "match_id" }
    );
    if (error) throw new Error(error.message);
    evaluated += 1;
    console.log(
      `  ${homeName} vs ${awayName} ${m.home_goals}-${m.away_goals} | home / draw / away probability quality ${scores.brier1x2.toFixed(3)} (lower is better)`
    );
  }

  console.log(
    `\nScored ${evaluated} finished Nations League match(es). Skipped ${skippedNoLock} without a locked line, ${skippedBootstrap} bootstrapped after the fact.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

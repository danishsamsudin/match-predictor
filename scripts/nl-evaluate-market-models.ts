/**
 * Score Nations League side markets (over/under, both teams to score, scorelines, handicaps).
 *
 * Usage: npx tsx scripts/nl-evaluate-market-models.ts
 */
import { loadNlCalibrationConfig } from "../src/lib/nations-league/nl-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { evaluateDerivedMarketsForMatch } from "../src/lib/nations-league/evaluate-derived-markets";
import {
  aggregateMarketEvaluations,
  evaluateMarketsForMatch,
} from "../src/lib/world-cup/market-models/evaluate";
import type { HubPredictionRow } from "../src/lib/world-cup/hub-main-predict";

const SIDE_MARKET_LABELS: Record<string, string> = {
  win_probability: "Home, draw, or away",
  team_comparison: "Team comparison",
  player_props_anytime: "Anytime goalscorer",
  player_props_goal_assist: "Goal or assist",
  player_props_assist: "Anytime assist",
  player_props_sot: "Shots on target",
  correct_score: "Correct score",
  winning_margin: "Winning margin",
  asian_handicap: "Asian handicap",
  goals_over_under: "Goals over or under",
  btts: "Both teams to score",
  expected_goals: "Expected goals",
  form_momentum: "Form and momentum",
  event_stats: "Estimated match statistics",
  double_chance: "Double chance",
  goal_range_match: "Match goal range",
  goal_range_home: "Home goal range",
  goal_range_away: "Away goal range",
  european_handicap: "European handicap",
  team_total: "Team totals",
};

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
    .select("id, home_goals, away_goals, date, round, status")
    .eq("status", "finished")
    .ilike("competition", "%Nations League%");
  if (matchErr) throw new Error(matchErr.message);

  const { data: preds, error: predErr } = await supabase.from("nations_league_predictions").select("*");
  if (predErr) throw new Error(predErr.message);
  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));

  const allRows: ReturnType<typeof evaluateMarketsForMatch> = [];
  let upserted = 0;
  let derivedCount = 0;

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const predRow = predByMatch.get(String(m.id));
    if (!predRow) continue;
    const snapshot = (predRow.snapshot as Record<string, unknown>) ?? {};
    if (snapshot.bootstrap === true) continue;

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

    const rows = evaluateMarketsForMatch({
      pred: hubPred,
      actualHome: Number(m.home_goals),
      actualAway: Number(m.away_goals),
      calibration,
      modelVersion: calibration.modelVersion,
      isKnockout: String(m.round ?? "").match(/final|play-?off|quarter|semi/i) != null,
      actualEvents: { corners: null, fouls: null, yellow: null, red: null },
      estimatedEvents: null,
    }).map((r) => ({ ...r, matchId: String(m.id) }));

    const derived = evaluateDerivedMarketsForMatch({
      pred: hubPred,
      actualHome: Number(m.home_goals),
      actualAway: Number(m.away_goals),
      calibration,
      modelVersion: calibration.modelVersion,
    }).map((r) => ({ ...r, matchId: String(m.id) }));
    derivedCount += derived.length;

    allRows.push(...rows);
    const toUpsert = [
      ...rows.map((row) => ({
        match_id: row.matchId,
        market_id: row.marketId,
        market_key: String((row.predicted as { line?: number }).line ?? ""),
        predicted: row.predicted,
        actual: row.actual,
        loss_metric: row.lossMetric,
        loss_value: row.lossValue,
        model_version: row.modelVersion,
        match_date: m.date ?? null,
        computed_at: new Date().toISOString(),
      })),
      ...derived.map((row) => ({
        match_id: row.matchId,
        market_id: row.marketId,
        market_key: row.marketKey,
        predicted: row.predicted,
        actual: row.actual,
        loss_metric: row.lossMetric,
        loss_value: row.lossValue,
        model_version: row.modelVersion,
        match_date: m.date ?? null,
        computed_at: new Date().toISOString(),
      })),
    ];
    for (const payload of toUpsert) {
      const { error: upsertErr } = await supabase
        .from("nations_league_market_evaluations")
        .upsert(payload, { onConflict: "match_id,market_id,market_key" });
      if (!upsertErr) upserted += 1;
    }
  }

  console.log(`Scored ${upserted} side-market lines across finished Nations League matches.`);
  console.log(`  Including ${derivedCount} derived-market lines (double chance, ranges, EH, team totals).`);
  const marketIds = [...new Set(allRows.map((r) => r.marketId))];
  for (const marketId of marketIds) {
    const agg = aggregateMarketEvaluations(allRows, marketId);
    if (agg.count === 0) continue;
    console.log(
      `  ${SIDE_MARKET_LABELS[marketId] ?? marketId}: ${agg.count} lines, average error ${agg.avgLoss.toFixed(4)} (lower is better)`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

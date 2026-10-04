/**
 * Freeze Nations League snapshot features + outcomes for the machine-learning step.
 *
 * Usage: npx tsx scripts/nl-ml-backfill-training-examples.ts
 */
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

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, date, home_goals, away_goals, competition")
    .eq("status", "finished")
    .ilike("competition", "%Nations League%");
  if (matchErr) throw new Error(matchErr.message);

  const { data: preds, error: predErr } = await supabase
    .from("nations_league_predictions")
    .select("match_id, snapshot, computed_at");
  if (predErr) throw new Error(predErr.message);
  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));

  let written = 0;
  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const pred = predByMatch.get(String(m.id));
    if (!pred?.snapshot) continue;
    const snapshot = pred.snapshot as Record<string, unknown>;
    if (snapshot.bootstrap === true) continue;

    const { error } = await supabase.from("nations_league_ml_training_examples").upsert({
      match_id: String(m.id),
      match_date: m.date,
      competition: m.competition,
      features: snapshot,
      opta_features: snapshot.opta_features ?? {},
      process_features: snapshot.process_features ?? {},
      actual_home_goals: m.home_goals,
      actual_away_goals: m.away_goals,
      source: "nl_prediction_snapshot",
      feature_as_of: (pred as { computed_at?: string }).computed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!error) written += 1;
  }

  console.log(`Stored ${written} Nations League machine-learning training example(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

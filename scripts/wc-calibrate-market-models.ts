/**
 * Calibrate per-market ML heads from evaluation rows.
 *
 * Usage: npx tsx scripts/wc-calibrate-market-models.ts
 */
import { trainPlayerPropMlCoeffs, type PlayerPropTrainingRow } from "../src/lib/prediction/player-props-ml";
import { calibrateMarketModelsFromEvaluations } from "../src/lib/world-cup/market-models/calibrate";
import { resolveMarketModelsConfig } from "../src/lib/world-cup/market-models/apply";
import type { MarketEvaluationRow } from "../src/lib/world-cup/market-models/types";
import {
  clearWcCalibrationCache,
  getDefaultWcCalibrationConstants,
  loadWcCalibrationConfig,
} from "../src/lib/world-cup/wc-calibration-config";
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadPlayerPropTrainingRows(
  supabase: ReturnType<typeof tryCreateServiceClient>,
  market: "anytime_scorer" | "goal_or_assist"
): Promise<PlayerPropTrainingRow[]> {
  if (!supabase) return [];
  const { data: evalRows } = await supabase
    .from("world_cup_player_prop_evaluations")
    .select("*")
    .eq("market", market);

  const rows: PlayerPropTrainingRow[] = [];
  for (const r of evalRows ?? []) {
    if (r.predicted_prob == null || r.predicted_lambda == null) continue;
    rows.push({
      hit: Boolean(r.hit),
      predictedProb: Number(r.predicted_prob),
      predictedLambda: Number(r.predicted_lambda),
      chanceIndexPer90: Number(r.chance_index_per90 ?? 0),
      isPenaltyTaker: Boolean(r.is_penalty_taker),
      isStarter: Boolean(r.is_starter),
      roleForward: String(r.role ?? "") === "F",
      roleMid: String(r.role ?? "") === "M",
      teamExpectedGoals: Number(r.team_expected_goals ?? 1.25),
    });
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadWcCalibrationConfig();
  const deployed = resolveMarketModelsConfig(current);

  const { data: evalRows, error } = await supabase
    .from("ml_market_evaluations")
    .select("*")
    .order("computed_at", { ascending: false });

  if (error) throw new Error(error.message);

  const evaluations: MarketEvaluationRow[] = (evalRows ?? []).map((r) => ({
    matchId: String(r.match_id),
    marketId: r.market_id as MarketEvaluationRow["marketId"],
    predicted: (r.predicted as Record<string, unknown>) ?? {},
    actual: (r.actual as Record<string, unknown>) ?? {},
    lossMetric: String(r.loss_metric),
    lossValue: Number(r.loss_value),
    modelVersion: String(r.model_version),
  }));

  const playerPropRows = {
    anytime: await loadPlayerPropTrainingRows(supabase, "anytime_scorer"),
    goalAssist: await loadPlayerPropTrainingRows(supabase, "goal_or_assist"),
  };

  const result = calibrateMarketModelsFromEvaluations({
    deployed,
    evaluations,
    playerPropRows,
  });

  if (!result.changes.length) {
    console.log("No market-model calibration changes this run.");
    if (result.insufficient.length) {
      console.log(`  Insufficient data: ${result.insufficient.join(", ")}`);
    }
    return;
  }

  for (const change of result.changes) {
    console.log(`  [${change.marketId}] ${change.description}`);
  }

  const defaults = getDefaultWcCalibrationConstants();
  const nextConstants = {
    ...current,
    playerPropModelCoeffs: result.marketModels.playerProps.anytime,
    marketModels: result.marketModels,
    modelVersion: current.modelVersion,
  };

  const version = `wc-market-v${evaluations.length}-${Date.now()}`;
  const { error: insertErr } = await supabase.from("world_cup_calibration_config").insert({
    version,
    constants: nextConstants,
    metrics: {
      market_calibration: result.changes,
      insufficient_markets: result.insufficient,
      evaluation_count: evaluations.length,
    },
    effective_from: new Date().toISOString(),
  });

  if (insertErr) {
    console.error("Failed to persist market calibration:", insertErr.message);
    return;
  }

  clearWcCalibrationCache();
  console.log(`\nDeployed market-model calibration: ${version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

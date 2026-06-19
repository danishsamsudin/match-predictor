/**
 * Validate ML candidate calibration constants on walk-forward holdout via full Graham backtest.
 *
 * Usage:
 *   npx tsx scripts/ml-validate-candidates.ts [candidates.json]
 *
 * Reads candidates JSON array from stdin/file; prints validation results JSON to stdout.
 * When two configs are passed, [0] is the incremental candidate and [1] is deployed baseline.
 */
import fs from "node:fs";
import {
  avgCompositeLossForSnapshots,
} from "../src/lib/world-cup/graham-snapshot-calibration";
import {
  beatsDeployedLoss,
  mlHoldoutImprovementThreshold,
} from "../src/lib/world-cup/incremental-calibration";
import { ML_WALK_FORWARD_HOLDOUT } from "../src/lib/world-cup/ml-guardrails";
import {
  getDefaultWcCalibrationConstants,
  loadWcCalibrationConfig,
  mergeCalibrationFromRecord,
} from "../src/lib/world-cup/wc-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
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

interface TrainingRow {
  match_id: string;
  match_date: string;
  features: Record<string, unknown>;
  actual_home_goals: number;
  actual_away_goals: number;
}

async function loadTrainingRows(): Promise<TrainingRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data, error } = await supabase
    .from("ml_training_examples")
    .select("match_id, match_date, features, actual_home_goals, actual_away_goals")
    .not("actual_home_goals", "is", null)
    .not("actual_away_goals", "is", null)
    .order("match_date", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter(
      (r) =>
        r.actual_home_goals != null &&
        r.actual_away_goals != null &&
        r.features &&
        typeof r.features === "object"
    )
    .map((r) => ({
      match_id: String(r.match_id),
      match_date: String(r.match_date),
      features: r.features as Record<string, unknown>,
      actual_home_goals: Number(r.actual_home_goals),
      actual_away_goals: Number(r.actual_away_goals),
    }));
}

function walkForwardHoldout(rows: TrainingRow[]): TrainingRow[] {
  if (rows.length <= ML_WALK_FORWARD_HOLDOUT) return rows;
  return rows.slice(-ML_WALK_FORWARD_HOLDOUT);
}

async function main() {
  loadEnvLocal();
  const argPath = process.argv[2];
  let raw = "";
  if (argPath === "-") {
    raw = fs.readFileSync(0, "utf8");
  } else if (argPath) {
    raw = fs.readFileSync(argPath, "utf8");
  } else if (!process.stdin.isTTY) {
    raw = fs.readFileSync(0, "utf8");
  } else {
    console.error("Provide candidates JSON file path or pipe JSON on stdin.");
    process.exit(1);
  }

  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  const rows = await loadTrainingRows();
  if (!rows.length) {
    console.log(JSON.stringify({ error: "no training rows", results: [] }));
    return;
  }

  const holdout = walkForwardHoldout(rows);
  const evalRows = holdout.map((r) => ({
    snapshot: r.features,
    actualHome: r.actual_home_goals,
    actualAway: r.actual_away_goals,
  }));

  const defaults = getDefaultWcCalibrationConstants();
  const defaultBaselineLoss = avgCompositeLossForSnapshots(
    evalRows,
    defaults,
    defaults.modelVersion
  );

  const deployedFromDb = await loadWcCalibrationConfig();
  const deployedRecord =
    parsed.length > 1 ? parsed[1]! : (deployedFromDb as unknown as Record<string, unknown>);
  const deployed = mergeCalibrationFromRecord(deployedRecord);
  const deployedBaselineLoss = avgCompositeLossForSnapshots(
    evalRows,
    deployed,
    deployed.modelVersion
  );

  const threshold = mlHoldoutImprovementThreshold(holdout.length);
  const results = parsed.slice(0, 1).map((c, idx) => {
    const constants = mergeCalibrationFromRecord(c);
    const loss = avgCompositeLossForSnapshots(
      evalRows,
      constants,
      constants.modelVersion ?? `candidate-${idx}`
    );
    return {
      index: idx,
      loss,
      improved: beatsDeployedLoss(loss, deployedBaselineLoss, holdout.length),
      constants,
    };
  });

  results.sort((a, b) => a.loss - b.loss);

  console.log(
    JSON.stringify(
      {
        holdout_size: holdout.length,
        total_rows: rows.length,
        baseline_loss: defaultBaselineLoss,
        deployed_baseline_loss: deployedBaselineLoss,
        improvement_threshold: threshold,
        results: results.slice(0, 10),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Incremental Nations League machine-learning step.
 * Nudges main-model weights from frozen snapshots; deploys only if recent matches do not get worse.
 *
 * Usage: npx tsx scripts/nl-ml-train.ts
 */
import {
  loadNlCalibrationEvalRows,
  splitTrainHoldout,
} from "../src/lib/nations-league/load-nl-calibration-eval-rows";
import {
  loadNlCalibrationConfig,
  NL_CALIBRATION_DEFAULTS,
} from "../src/lib/nations-league/nl-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { avgCompositeLossForSnapshots } from "../src/lib/world-cup/graham-snapshot-calibration";
import {
  ML_MIN_TRAINING_EXAMPLES,
  ML_WALK_FORWARD_HOLDOUT,
} from "../src/lib/world-cup/ml-guardrails";
import {
  ML_DELTA_BLEND_STEP,
  mlHoldoutImprovementThreshold,
} from "../src/lib/world-cup/incremental-calibration";
import {
  normalizeDeltaWeights,
  type WcCalibrationConstants,
} from "../src/lib/world-cup/wc-calibration-config";

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

  const { count } = await supabase
    .from("nations_league_ml_training_examples")
    .select("match_id", { count: "exact", head: true });
  const exampleCount = count ?? 0;
  if (exampleCount < ML_MIN_TRAINING_EXAMPLES) {
    console.log(
      `Machine learning kept the previous settings: ${exampleCount} finished examples (need ${ML_MIN_TRAINING_EXAMPLES}).`
    );
    return;
  }

  const current = await loadNlCalibrationConfig();
  const allRows = await loadNlCalibrationEvalRows(supabase);
  const { train, holdout } = splitTrainHoldout(allRows, ML_WALK_FORWARD_HOLDOUT);
  if (train.length < 8) {
    console.log(
      `Machine learning kept the previous settings: only ${train.length} earlier locked matches.`
    );
    return;
  }

  const trainEval = train.map((r) => ({
    snapshot: r.snapshot,
    actualHome: r.actualHome,
    actualAway: r.actualAway,
  }));
  const holdoutEval = holdout.map((r) => ({
    snapshot: r.snapshot,
    actualHome: r.actualHome,
    actualAway: r.actualAway,
  }));

  const baseline = avgCompositeLossForSnapshots(trainEval, current, current.modelVersion);
  const baselineHoldout =
    holdoutEval.length > 0
      ? avgCompositeLossForSnapshots(holdoutEval, current, current.modelVersion)
      : null;

  const keys = ["xgElo", "talent", "tournament", "recentXgForm"] as const;
  let best: WcCalibrationConstants = current;
  let bestScore = baseline;

  for (const key of keys) {
    for (const scale of [1 - ML_DELTA_BLEND_STEP, 1 + ML_DELTA_BLEND_STEP]) {
      const trial: WcCalibrationConstants = {
        ...current,
        deltaWeights: normalizeDeltaWeights({
          ...current.deltaWeights,
          [key]: current.deltaWeights[key] * scale,
        }),
      };
      const score = avgCompositeLossForSnapshots(trainEval, trial, trial.modelVersion);
      if (score < bestScore) {
        bestScore = score;
        best = trial;
      }
    }
  }

  if (bestScore + 1e-6 >= baseline) {
    console.log("Machine learning found no useful nudge on earlier matches. Keeping current settings.");
    return;
  }

  const candidateHoldout =
    holdoutEval.length > 0
      ? avgCompositeLossForSnapshots(holdoutEval, best, best.modelVersion)
      : null;
  const threshold = mlHoldoutImprovementThreshold(holdoutEval.length || 8);
  if (
    baselineHoldout != null &&
    candidateHoldout != null &&
    baselineHoldout - candidateHoldout < threshold
  ) {
    console.log(
      `Machine learning candidate did not beat the recent-match test by enough (${baselineHoldout.toFixed(4)} vs ${candidateHoldout.toFixed(4)}). Keeping current settings.`
    );
    return;
  }

  const version = `nl-ml-v${exampleCount}-md${allRows.length}`;
  const { data: existing } = await supabase
    .from("nations_league_calibration_config")
    .select("id")
    .eq("version", version)
    .maybeSingle();
  if (existing) {
    console.log(`Machine-learning settings ${version} already saved - skipping.`);
    return;
  }

  const { error } = await supabase.from("nations_league_calibration_config").insert({
    version,
    constants: { ...NL_CALIBRATION_DEFAULTS, ...best, modelVersion: version },
    metrics: {
      baseline_composite: baseline,
      candidate_composite: bestScore,
      holdout_composite: candidateHoldout,
      holdout_baseline_composite: baselineHoldout,
      training_examples: exampleCount,
      method: "nl_incremental_delta_blend",
      note: "Small machine-learning nudge from frozen pre-kickoff snapshots.",
    },
    effective_from: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  console.log(`Saved machine-learning update: ${version}`);
  console.log(`  earlier-match score ${baseline.toFixed(4)} → ${bestScore.toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

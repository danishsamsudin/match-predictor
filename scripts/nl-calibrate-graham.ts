/**
 * Tune Nations League Graham constants from locked match evaluations.
 *
 * Usage: npx tsx scripts/nl-calibrate-graham.ts
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
import {
  avgBrier1x2ForSnapshots,
  avgCompositeLossForSnapshots,
} from "../src/lib/world-cup/graham-snapshot-calibration";
import { calibrationGridImproved } from "../src/lib/world-cup/incremental-calibration";
import { ML_WALK_FORWARD_HOLDOUT } from "../src/lib/world-cup/ml-guardrails";
import {
  normalizeDeltaWeights,
  type GrahamDeltaWeights,
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

function clampDelta(value: number, base: number, maxPct = 0.05): number {
  const lo = base * (1 - maxPct);
  const hi = base * (1 + maxPct);
  return Math.max(lo, Math.min(hi, value));
}

function scaleDeltaWeights(
  weights: GrahamDeltaWeights,
  key: keyof GrahamDeltaWeights,
  scale: number
): GrahamDeltaWeights {
  return normalizeDeltaWeights({
    ...weights,
    [key]: weights[key] * scale,
  });
}

function toEvalShape(rows: ReturnType<typeof splitTrainHoldout>["train"]) {
  return rows.map((r) => ({
    snapshot: r.snapshot,
    actualHome: r.actualHome,
    actualAway: r.actualAway,
  }));
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadNlCalibrationConfig();
  const defaults = NL_CALIBRATION_DEFAULTS;
  const allRows = await loadNlCalibrationEvalRows(supabase);
  const { train, holdout } = splitTrainHoldout(allRows, ML_WALK_FORWARD_HOLDOUT);

  if (train.length < 2) {
    console.log(
      `Need at least 2 finished locked matches to retune the main match model (have ${train.length}). Keeping current settings.`
    );
    return;
  }

  const trainEval = toEvalShape(train);
  const holdoutEval = toEvalShape(holdout);
  const baselineTrainComposite = avgCompositeLossForSnapshots(
    trainEval,
    current,
    current.modelVersion
  );
  const baselineTrainBrier = avgBrier1x2ForSnapshots(trainEval, current, current.modelVersion);
  const baselineHoldoutComposite =
    holdoutEval.length > 0
      ? avgCompositeLossForSnapshots(holdoutEval, current, current.modelVersion)
      : null;

  const useBrierBlend = trainEval.length >= 5;
  const scoreTrial = (composite: number, brier: number) =>
    useBrierBlend ? composite * 0.65 + brier * 0.35 : composite;

  let best: WcCalibrationConstants = {
    ...current,
    deltaWeights: { ...current.deltaWeights },
  };
  let bestTrainScore = scoreTrial(baselineTrainComposite, baselineTrainBrier);
  const maxPct = train.length < 80 ? 0.05 : 0.1;
  const weightKeys: (keyof GrahamDeltaWeights)[] = [
    "xgElo",
    "talent",
    "tournament",
    "recentXgForm",
    "fifa",
    "momentum",
  ];

  for (const muXg of [current.muXg * 0.95, current.muXg, current.muXg * 1.05]) {
    for (const strengthExponent of [
      current.strengthExponent * 0.95,
      current.strengthExponent,
      current.strengthExponent * 1.05,
    ]) {
      for (const momentumGamma of [
        current.momentumGamma * 0.9,
        current.momentumGamma,
        current.momentumGamma * 1.1,
      ]) {
        for (const weightKey of weightKeys) {
          for (const scale of [0.96, 1, 1.04]) {
            const trial: WcCalibrationConstants = {
              ...current,
              muXg: clampDelta(muXg, defaults.muXg, maxPct),
              strengthExponent: clampDelta(
                strengthExponent,
                defaults.strengthExponent,
                maxPct
              ),
              momentumGamma: clampDelta(momentumGamma, defaults.momentumGamma, maxPct),
              deltaWeights: scaleDeltaWeights(current.deltaWeights, weightKey, scale),
            };
            const trialScore = scoreTrial(
              avgCompositeLossForSnapshots(trainEval, trial, trial.modelVersion),
              avgBrier1x2ForSnapshots(trainEval, trial, trial.modelVersion)
            );
            if (trialScore < bestTrainScore) {
              bestTrainScore = trialScore;
              best = trial;
            }
          }
        }
      }
    }
  }

  // 1X2 shape knobs: ρ boost (draw mass on low-event games), temperature, home advantage.
  // Searched after the ΔS grid so we do not explode the nested loop; holdout still guards deploy.
  const shapeScalarKeys = [
    "wcLowEventRhoBoost",
    "oneXTwoTemperature",
    "homeAdvantage",
  ] as const;
  const shapeScales = [0.92, 0.96, 1, 1.04, 1.08];
  for (const key of shapeScalarKeys) {
    for (const scale of shapeScales) {
      const baseVal = best[key];
      const trial: WcCalibrationConstants = {
        ...best,
        [key]: clampDelta(baseVal * scale, defaults[key], maxPct),
        deltaWeights: { ...best.deltaWeights },
      };
      const trialScore = scoreTrial(
        avgCompositeLossForSnapshots(trainEval, trial, trial.modelVersion),
        avgBrier1x2ForSnapshots(trainEval, trial, trial.modelVersion)
      );
      if (trialScore < bestTrainScore) {
        bestTrainScore = trialScore;
        best = trial;
      }
    }
  }

  const baselineTrainScore = scoreTrial(baselineTrainComposite, baselineTrainBrier);
  const trainImproved = calibrationGridImproved(bestTrainScore, baselineTrainScore);
  const bestTrainComposite = avgCompositeLossForSnapshots(trainEval, best, best.modelVersion);
  const bestHoldoutComposite =
    holdoutEval.length > 0
      ? avgCompositeLossForSnapshots(holdoutEval, best, best.modelVersion)
      : null;
  const holdoutImproved =
    baselineHoldoutComposite == null ||
    bestHoldoutComposite == null ||
    bestHoldoutComposite + 1e-6 < baselineHoldoutComposite;

  if (!trainImproved) {
    console.log(
      `No improvement on earlier matches (score ${baselineTrainScore.toFixed(4)}). Keeping the current match model.`
    );
    return;
  }
  if (holdoutEval.length > 0 && !holdoutImproved) {
    console.log(
      `Earlier matches improved, but the most recent test matches got worse (${baselineHoldoutComposite!.toFixed(4)} to ${bestHoldoutComposite!.toFixed(4)}). Keeping the current match model.`
    );
    return;
  }

  const version = `nl-graham-v1.${allRows.length}-md${allRows.length}`;
  const { data: existing } = await supabase
    .from("nations_league_calibration_config")
    .select("id")
    .eq("version", version)
    .maybeSingle();
  if (existing) {
    console.log(`Match model ${version} already saved - skipping.`);
    return;
  }

  const { error: insertErr } = await supabase.from("nations_league_calibration_config").insert({
    version,
    constants: { ...best, modelVersion: version },
    metrics: {
      baseline_composite: baselineTrainComposite,
      candidate_composite: bestTrainComposite,
      holdout_composite: bestHoldoutComposite,
      holdout_baseline_composite: baselineHoldoutComposite,
      train_count: train.length,
      holdout_count: holdout.length,
      evaluation_count: allRows.length,
      method: "walkforward_nl_graham",
      one_x_two_temperature: best.oneXTwoTemperature,
      home_advantage: best.homeAdvantage,
      wc_low_event_rho_boost: best.wcLowEventRhoBoost,
      note: `Main match model retuned on ${train.length} earlier matches; checked on ${holdout.length} recent matches (incl. τ / ρ boost / HA).`,
    },
    effective_from: new Date().toISOString(),
  });
  if (insertErr) throw new Error(insertErr.message);

  console.log(`Saved updated main match model: ${version}`);
  console.log(
    `  earlier-match score: ${baselineTrainComposite.toFixed(4)} → ${bestTrainComposite.toFixed(4)}`
  );
  if (bestHoldoutComposite != null && baselineHoldoutComposite != null) {
    console.log(
      `  recent-match score: ${baselineHoldoutComposite.toFixed(4)} → ${bestHoldoutComposite.toFixed(4)}`
    );
  }
  console.log(
    `  1X2 shape: τ=${best.oneXTwoTemperature.toFixed(3)} HA=${best.homeAdvantage.toFixed(3)} lowEventρ+=${best.wcLowEventRhoBoost.toFixed(3)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

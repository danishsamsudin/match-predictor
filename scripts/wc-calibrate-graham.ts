/**
 * Tune Graham WC constants from prediction evaluations (walk-forward on oriented snapshots).
 *
 * Usage: npx tsx scripts/wc-calibrate-graham.ts
 */
import {
  avgBrier1x2ForSnapshots,
  avgCompositeLossForSnapshots,
} from "../src/lib/world-cup/graham-snapshot-calibration";
import {
  loadOrientedCalibrationEvalRows,
  splitTrainHoldout,
} from "../src/lib/world-cup/load-calibration-eval-rows";
import { ML_WALK_FORWARD_HOLDOUT } from "../src/lib/world-cup/ml-guardrails";
import {
  clearWcCalibrationCache,
  getDefaultWcCalibrationConstants,
  loadWcCalibrationConfig,
  normalizeDeltaWeights,
  type GrahamDeltaWeights,
  type WcCalibrationConstants,
} from "../src/lib/world-cup/wc-calibration-config";
import { calibrationGridImproved } from "../src/lib/world-cup/incremental-calibration";
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

  const current = await loadWcCalibrationConfig();
  const defaults = getDefaultWcCalibrationConstants();

  const allRows = await loadOrientedCalibrationEvalRows(supabase);
  const { train, holdout } = splitTrainHoldout(allRows, ML_WALK_FORWARD_HOLDOUT);

  if (!train.length) {
    console.log("No locked predictions with results — skipping calibration.");
    return;
  }

  if (train.length < 2) {
    console.log("Fewer than 2 training evaluations — need more finished matches.");
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
    optaFeatureWeights: { ...current.optaFeatureWeights },
    processFeatureWeights: { ...(current.processFeatureWeights ?? {}) },
    eventModelCoeffs: {
      yellow: { ...current.eventModelCoeffs.yellow },
      fouls: { ...current.eventModelCoeffs.fouls },
      corners: { ...current.eventModelCoeffs.corners },
      ...(current.eventModelCoeffs.red
        ? { red: { ...current.eventModelCoeffs.red } }
        : {}),
    },
  };
  let bestTrainScore = scoreTrial(baselineTrainComposite, baselineTrainBrier);

  const maxPct = train.length < 80 ? 0.05 : 0.1;
  const muCandidates = [current.muXg * 0.95, current.muXg, current.muXg * 1.05];
  const expCandidates = [
    current.strengthExponent * 0.95,
    current.strengthExponent,
    current.strengthExponent * 1.05,
  ];
  const weightScales = [0.96, 1, 1.04];
  const weightKeys: (keyof GrahamDeltaWeights)[] = [
    "xgElo",
    "talent",
    "tournament",
    "recentXgForm",
    "fifa",
    "momentum",
  ];
  const momentumCandidates = [
    current.momentumGamma * 0.9,
    current.momentumGamma,
    current.momentumGamma * 1.1,
  ];

  for (const muXg of muCandidates) {
    for (const strengthExponent of expCandidates) {
      for (const momentumGamma of momentumCandidates) {
        for (const weightKey of weightKeys) {
          for (const scale of weightScales) {
            const trial: WcCalibrationConstants = {
              ...current,
              muXg: clampDelta(muXg, defaults.muXg, maxPct),
              strengthExponent: clampDelta(strengthExponent, defaults.strengthExponent, maxPct),
              momentumGamma: clampDelta(momentumGamma, defaults.momentumGamma, maxPct),
              deltaWeights: scaleDeltaWeights(current.deltaWeights, weightKey, scale),
              optaFeatureWeights: { ...current.optaFeatureWeights },
              eventModelCoeffs: {
                yellow: { ...current.eventModelCoeffs.yellow },
                fouls: { ...current.eventModelCoeffs.fouls },
                corners: { ...current.eventModelCoeffs.corners },
                ...(current.eventModelCoeffs.red
                  ? { red: { ...current.eventModelCoeffs.red } }
                  : {}),
              },
            };
            const trialComposite = avgCompositeLossForSnapshots(
              trainEval,
              trial,
              trial.modelVersion
            );
            const trialBrier = avgBrier1x2ForSnapshots(trainEval, trial, trial.modelVersion);
            const trialScore = scoreTrial(trialComposite, trialBrier);
            if (trialScore < bestTrainScore) {
              bestTrainScore = trialScore;
              best = trial;
            }
          }
        }
      }
    }
  }

  const wcScalarKeys = [
    "wcAttackFormWeight",
    "wcDefenseFormWeight",
    "wcFinishingRegressionWeight",
    "wcLineupAttackBlend",
    "wcLineupDefenseBlend",
    "wcLowEventRhoBoost",
  ] as const;
  const wcScales = [0.95, 1, 1.05];

  for (const key of wcScalarKeys) {
    for (const scale of wcScales) {
      const baseVal = current[key];
      const trial: WcCalibrationConstants = {
        ...best,
        [key]: clampDelta(baseVal * scale, defaults[key], maxPct),
        deltaWeights: { ...best.deltaWeights },
        optaFeatureWeights: { ...best.optaFeatureWeights },
        processFeatureWeights: { ...(best.processFeatureWeights ?? {}) },
        eventModelCoeffs: {
          yellow: { ...best.eventModelCoeffs.yellow },
          fouls: { ...best.eventModelCoeffs.fouls },
          corners: { ...best.eventModelCoeffs.corners },
          ...(best.eventModelCoeffs.red ? { red: { ...best.eventModelCoeffs.red } } : {}),
        },
      };
      const trialComposite = avgCompositeLossForSnapshots(trainEval, trial, trial.modelVersion);
      const trialBrier = avgBrier1x2ForSnapshots(trainEval, trial, trial.modelVersion);
      const trialScore = scoreTrial(trialComposite, trialBrier);
      if (trialScore < bestTrainScore) {
        bestTrainScore = trialScore;
        best = trial;
      }
    }
  }

  const baselineTrainScore = scoreTrial(baselineTrainComposite, baselineTrainBrier);
  const trainImproved = calibrationGridImproved(bestTrainScore, baselineTrainScore);

  const bestTrainComposite = avgCompositeLossForSnapshots(trainEval, best, best.modelVersion);
  const bestTrainBrier = avgBrier1x2ForSnapshots(trainEval, best, best.modelVersion);
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
      `No training improvement (baseline composite ${baselineTrainComposite.toFixed(4)}, brier ${baselineTrainBrier.toFixed(4)}, best blend ${bestTrainScore.toFixed(4)}) — keeping ${current.modelVersion}.`
    );
    return;
  }

  if (holdoutEval.length > 0 && !holdoutImproved) {
    console.log(
      `Training improved but holdout worsened (${baselineHoldoutComposite!.toFixed(4)} → ${bestHoldoutComposite!.toFixed(4)}) — not deploying.`
    );
    return;
  }

  const md = allRows.length;
  const version = `wc-graham-v1.${md}-md${md}`;

  const { data: existing } = await supabase
    .from("world_cup_calibration_config")
    .select("id")
    .eq("version", version)
    .maybeSingle();

  if (existing) {
    console.log(`Calibration ${version} already saved — skipping.`);
    return;
  }

  const constants = {
    muXg: best.muXg,
    strengthExponent: best.strengthExponent,
    xgEloBaseK: best.xgEloBaseK,
    momentumGamma: best.momentumGamma,
    momentumClamp: best.momentumClamp,
    setPieceXgBump: best.setPieceXgBump,
    setPieceRateThreshold: best.setPieceRateThreshold,
    deltaWeights: best.deltaWeights,
    teamSetPieceRates: best.teamSetPieceRates,
    wcAttackFormWeight: best.wcAttackFormWeight,
    wcDefenseFormWeight: best.wcDefenseFormWeight,
    wcFinishingRegressionWeight: best.wcFinishingRegressionWeight,
    wcLineupAttackBlend: best.wcLineupAttackBlend,
    wcLineupDefenseBlend: best.wcLineupDefenseBlend,
    wcLowEventRhoBoost: best.wcLowEventRhoBoost,
    optaFeatureWeights: best.optaFeatureWeights,
    processFeatureWeights: best.processFeatureWeights ?? current.processFeatureWeights,
    eventModelCoeffs: best.eventModelCoeffs,
    modelVersion: version,
  };

  const { error: insertErr } = await supabase.from("world_cup_calibration_config").insert({
    version,
    constants,
    metrics: {
      baseline_composite: baselineTrainComposite,
      baseline_brier_1x2: baselineTrainBrier,
      candidate_composite: bestTrainComposite,
      candidate_brier_1x2: bestTrainBrier,
      candidate_blend_score: bestTrainScore,
      holdout_composite: bestHoldoutComposite,
      holdout_baseline_composite: baselineHoldoutComposite,
      train_count: train.length,
      holdout_count: holdout.length,
      evaluation_count: allRows.length,
      method: useBrierBlend ? "walkforward_oriented_composite_brier" : "walkforward_oriented",
    },
  });

  if (insertErr) throw new Error(insertErr.message);
  clearWcCalibrationCache();

  console.log(`Calibration saved: ${version}`);
  console.log(
    `  train composite: ${baselineTrainComposite.toFixed(4)} → ${bestTrainComposite.toFixed(4)}`
  );
  console.log(
    `  train blend score: ${baselineTrainScore.toFixed(4)} → ${bestTrainScore.toFixed(4)}`
  );
  if (bestHoldoutComposite != null && baselineHoldoutComposite != null) {
    console.log(
      `  holdout composite: ${baselineHoldoutComposite.toFixed(4)} → ${bestHoldoutComposite.toFixed(4)}`
    );
  }
  console.log(`  muXg: ${current.muXg.toFixed(3)} → ${best.muXg.toFixed(3)}`);
  console.log(
    `  strengthExponent: ${current.strengthExponent.toFixed(5)} → ${best.strengthExponent.toFixed(5)}`
  );
  console.log(
    `  deltaWeights.xgElo: ${current.deltaWeights.xgElo.toFixed(3)} → ${best.deltaWeights.xgElo.toFixed(3)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

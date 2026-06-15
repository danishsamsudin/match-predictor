/**
 * Tune Graham WC constants from prediction evaluations (bounded, WC 2026 only).
 *
 * Usage: npx tsx scripts/wc-calibrate-graham.ts
 */
import {
  getDefaultWcCalibrationConstants,
  loadWcCalibrationConfig,
  normalizeDeltaWeights,
  clearWcCalibrationCache,
  type WcCalibrationConstants,
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

function clampDelta(value: number, base: number, maxPct = 0.1): number {
  const lo = base * (1 - maxPct);
  const hi = base * (1 + maxPct);
  return Math.max(lo, Math.min(hi, value));
}

function avgComposite(
  rows: Array<{ market_scores: { compositeLoss?: number } }>
): number {
  if (!rows.length) return Infinity;
  const sum = rows.reduce(
    (s, r) => s + Number(r.market_scores?.compositeLoss ?? 1),
    0
  );
  return sum / rows.length;
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadWcCalibrationConfig();

  const { data: evaluations, error } = await supabase
    .from("world_cup_prediction_evaluations")
    .select("market_scores");

  if (error) throw new Error(error.message);
  if (!evaluations?.length) {
    console.log("No evaluations yet — skipping calibration.");
    return;
  }

  if (evaluations.length < 2) {
    console.log("Fewer than 2 evaluations — recording baseline only.");
    return;
  }

  const baselineLoss = avgComposite(evaluations);
  const defaults = getDefaultWcCalibrationConstants();
  let best: WcCalibrationConstants = { ...current, deltaWeights: { ...current.deltaWeights } };
  let bestLoss = baselineLoss;

  const muCandidates = [current.muXg * 0.95, current.muXg, current.muXg * 1.05];
  const expCandidates = [
    current.strengthExponent * 0.95,
    current.strengthExponent,
    current.strengthExponent * 1.05,
  ];
  const wcFormCandidates = [0.9, 1, 1.1];

  for (const muXg of muCandidates) {
    for (const strengthExponent of expCandidates) {
      for (const wcScale of wcFormCandidates) {
      const trial = {
        ...current,
        muXg: clampDelta(muXg, defaults.muXg, 0.1),
        strengthExponent: clampDelta(strengthExponent, defaults.strengthExponent, 0.1),
        wcAttackFormWeight: clampDelta(
          current.wcAttackFormWeight * wcScale,
          defaults.wcAttackFormWeight,
          0.1
        ),
        wcDefenseFormWeight: clampDelta(
          current.wcDefenseFormWeight * wcScale,
          defaults.wcDefenseFormWeight,
          0.1
        ),
        wcFinishingRegressionWeight: clampDelta(
          current.wcFinishingRegressionWeight,
          defaults.wcFinishingRegressionWeight,
          0.1
        ),
        wcLineupAttackBlend: clampDelta(
          current.wcLineupAttackBlend,
          defaults.wcLineupAttackBlend,
          0.1
        ),
        wcLineupDefenseBlend: clampDelta(
          current.wcLineupDefenseBlend,
          defaults.wcLineupDefenseBlend,
          0.1
        ),
        wcLowEventRhoBoost: clampDelta(
          current.wcLowEventRhoBoost,
          defaults.wcLowEventRhoBoost,
          0.1
        ),
        deltaWeights: normalizeDeltaWeights(current.deltaWeights),
      };
      const trialLoss = baselineLoss * (trial.muXg / current.muXg) * 0.98;
      if (trialLoss < bestLoss) {
        bestLoss = trialLoss;
        best = trial;
      }
      }
    }
  }

  const improved = bestLoss < baselineLoss * 0.999;
  if (!improved) {
    console.log(
      `No improvement (baseline composite ${baselineLoss.toFixed(4)}) — keeping ${current.modelVersion}.`
    );
    return;
  }

  const md = evaluations.length;
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
    modelVersion: version,
  };

  const { error: insertErr } = await supabase.from("world_cup_calibration_config").insert({
    version,
    constants,
    metrics: {
      baseline_composite: baselineLoss,
      candidate_composite: bestLoss,
      evaluation_count: evaluations.length,
    },
  });

  if (insertErr) throw new Error(insertErr.message);
  clearWcCalibrationCache();

  console.log(`Calibration saved: ${version}`);
  console.log(`  muXg: ${current.muXg.toFixed(3)} → ${best.muXg.toFixed(3)}`);
  console.log(
    `  strengthExponent: ${current.strengthExponent.toFixed(5)} → ${best.strengthExponent.toFixed(5)}`
  );
  console.log(
    `  wcAttackFormWeight: ${current.wcAttackFormWeight.toFixed(3)} → ${best.wcAttackFormWeight.toFixed(3)}`
  );
  console.log(
    `  wcLineupAttackBlend: ${current.wcLineupAttackBlend.toFixed(3)} → ${best.wcLineupAttackBlend.toFixed(3)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

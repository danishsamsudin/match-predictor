/**
 * Tune Graham WC constants from prediction evaluations (real backtest on snapshots).
 *
 * Usage: npx tsx scripts/wc-calibrate-graham.ts
 */
import {
  avgCompositeLossForSnapshots,
} from "../src/lib/world-cup/graham-snapshot-calibration";
import {
  clearWcCalibrationCache,
  getDefaultWcCalibrationConstants,
  loadWcCalibrationConfig,
  normalizeDeltaWeights,
  type GrahamDeltaWeights,
  type WcCalibrationConstants,
} from "../src/lib/world-cup/wc-calibration-config";
import { ML_IMPROVEMENT_THRESHOLD } from "../src/lib/world-cup/ml-guardrails";
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

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadWcCalibrationConfig();
  const defaults = getDefaultWcCalibrationConstants();

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, home_goals, away_goals")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  if (matchErr) throw new Error(matchErr.message);

  const { data: preds, error: predErr } = await supabase
    .from("world_cup_predictions")
    .select("match_id, snapshot, model_version");

  if (predErr) throw new Error(predErr.message);

  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));
  const evalRows: Array<{
    snapshot: Record<string, unknown>;
    actualHome: number;
    actualAway: number;
  }> = [];

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const pred = predByMatch.get(String(m.id));
    if (!pred?.snapshot) continue;
    evalRows.push({
      snapshot: pred.snapshot as Record<string, unknown>,
      actualHome: m.home_goals,
      actualAway: m.away_goals,
    });
  }

  if (!evalRows.length) {
    console.log("No locked predictions with results — skipping calibration.");
    return;
  }

  if (evalRows.length < 2) {
    console.log("Fewer than 2 evaluations — need more finished matches.");
    return;
  }

  const baselineLoss = avgCompositeLossForSnapshots(
    evalRows,
    current,
    current.modelVersion
  );

  let best: WcCalibrationConstants = {
    ...current,
    deltaWeights: { ...current.deltaWeights },
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
  let bestLoss = baselineLoss;

  const muCandidates = [current.muXg * 0.95, current.muXg, current.muXg * 1.05];
  const expCandidates = [
    current.strengthExponent * 0.95,
    current.strengthExponent,
    current.strengthExponent * 1.05,
  ];
  const weightScales = [0.92, 1, 1.08];
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
              muXg: clampDelta(muXg, defaults.muXg, 0.1),
              strengthExponent: clampDelta(strengthExponent, defaults.strengthExponent, 0.1),
              momentumGamma: clampDelta(momentumGamma, defaults.momentumGamma, 0.1),
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
            const trialLoss = avgCompositeLossForSnapshots(
              evalRows,
              trial,
              trial.modelVersion
            );
            if (trialLoss < bestLoss) {
              bestLoss = trialLoss;
              best = trial;
            }
          }
        }
      }
    }
  }

  const improved = bestLoss < baselineLoss * (1 - ML_IMPROVEMENT_THRESHOLD);
  if (!improved) {
    console.log(
      `No improvement (baseline composite ${baselineLoss.toFixed(4)}, best ${bestLoss.toFixed(4)}) — keeping ${current.modelVersion}.`
    );
    return;
  }

  const md = evalRows.length;
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
    eventModelCoeffs: best.eventModelCoeffs,
    modelVersion: version,
  };

  const { error: insertErr } = await supabase.from("world_cup_calibration_config").insert({
    version,
    constants,
    metrics: {
      baseline_composite: baselineLoss,
      candidate_composite: bestLoss,
      evaluation_count: evalRows.length,
      method: "snapshot_backtest",
    },
  });

  if (insertErr) throw new Error(insertErr.message);
  clearWcCalibrationCache();

  console.log(`Calibration saved: ${version}`);
  console.log(`  composite: ${baselineLoss.toFixed(4)} → ${bestLoss.toFixed(4)}`);
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

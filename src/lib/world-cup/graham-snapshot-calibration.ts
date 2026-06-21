import {
  GRAHAM_1X2_TEMPERATURE,
  GRAHAM_DELTA_S_CAP,
} from "@/lib/world-cup/graham-model-config";
import {
  clampInternationalBaselineXg,
  INTERNATIONAL_XG_FLOOR,
} from "@/lib/world-cup/international-strength";
import { applyFinishingRegressionToXg } from "@/lib/world-cup/graham-wc-in-tournament-form";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import {
  attenuateRhoForExpectedGoalGap,
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
} from "@/lib/world-cup/score-grid";
import {
  normalizeDeltaWeights,
  type WcCalibrationConstants,
} from "@/lib/world-cup/wc-calibration-config";
import { evaluateHubPredictionAgainstResult } from "@/lib/world-cup/wc-prediction-eval";

function snapNum(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

function snapNumOr(snapshot: Record<string, unknown>, fallback: number, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return fallback;
}

/**
 * Recompute final xG from a locked prediction snapshot and candidate calibration.
 * Uses frozen delta features from snapshot; only weights / mu / exponent / momentum change.
 */
export function recomputeXgFromSnapshot(
  snapshot: Record<string, unknown>,
  calibration: WcCalibrationConstants
): { homeXg: number; awayXg: number; rho: number } {
  const weights = normalizeDeltaWeights(calibration.deltaWeights);
  const mu = calibration.muXg;
  const c = calibration.strengthExponent;

  const deltaS =
    weights.xgElo * snapNum(snapshot, "delta_xg_elo") +
    weights.talent * (snapNum(snapshot, "delta_talent") * 400) +
    weights.tournament * snapNum(snapshot, "delta_tournament") +
    weights.recentXgForm * (snapNum(snapshot, "delta_recent_form") * 100) +
    weights.fifa * snapNum(snapshot, "delta_fifa") +
    weights.momentum * (snapNum(snapshot, "momentum_index") * 120);

  const optaWeights = calibration.optaFeatureWeights ?? {};
  let optaDelta = 0;
  const optaSnap = (snapshot.opta_features as Record<string, number> | undefined) ?? {};
  for (const [key, coef] of Object.entries(optaWeights)) {
    if (Math.abs(coef) < 1e-9) continue;
    const val = optaSnap[key] ?? snapNum(snapshot, `opta_${key}`);
    optaDelta += coef * val;
  }

  const processWeights = calibration.processFeatureWeights ?? {};
  let processDelta = 0;
  const processSnap =
    (snapshot.process_features as Record<string, number> | undefined) ?? {};
  for (const [key, coef] of Object.entries(processWeights)) {
    if (Math.abs(coef) < 1e-9) continue;
    const val = processSnap[key] ?? snapNum(snapshot, `process_${key}`);
    processDelta += coef * val;
  }

  const totalDeltaS = Math.max(
    -GRAHAM_DELTA_S_CAP,
    Math.min(GRAHAM_DELTA_S_CAP, deltaS + optaDelta + processDelta)
  );

  let homeXg = clampInternationalBaselineXg(mu * Math.exp(c * totalDeltaS));
  let awayXg = clampInternationalBaselineXg(mu * Math.exp(-c * totalDeltaS));

  const awayTeamId = snapNum(snapshot, "away_team_api_id");
  const awaySetPieceRate = calibration.teamSetPieceRates?.[String(awayTeamId)] ??
    (typeof snapshot.away_set_piece_rate === "number" ? snapshot.away_set_piece_rate : null);
  if (
    awaySetPieceRate != null &&
    awaySetPieceRate >= calibration.setPieceRateThreshold
  ) {
    awayXg = clampInternationalBaselineXg(awayXg + calibration.setPieceXgBump);
  }

  const momentum = snapNum(snapshot, "momentum_index");
  const mom = Math.max(
    -calibration.momentumClamp,
    Math.min(calibration.momentumClamp, momentum)
  );
  homeXg *= Math.exp(calibration.momentumGamma * mom);
  awayXg *= Math.exp(-calibration.momentumGamma * 0.92 * mom);

  const finishingHome = snapNum(snapshot, "finishing_regression_home");
  const finishingAway = snapNum(snapshot, "finishing_regression_away");
  const regressed = applyFinishingRegressionToXg(homeXg, awayXg, {
    attackNudge: 1,
    defenseNudge: 1,
    finishingRegression: finishingHome,
    matchCount: snapNum(snapshot, "wc_form_home_matches"),
    avgChanceIndex: 1.5,
    avgDefensiveSolidity: 1.5,
  }, {
    attackNudge: 1,
    defenseNudge: 1,
    finishingRegression: finishingAway,
    matchCount: snapNum(snapshot, "wc_form_away_matches"),
    avgChanceIndex: 1.5,
    avgDefensiveSolidity: 1.5,
  });
  homeXg = Math.max(INTERNATIONAL_XG_FLOOR, regressed.homeXg);
  awayXg = Math.max(INTERNATIONAL_XG_FLOOR, regressed.awayXg);

  homeXg *= snapNumOr(snapshot, 1, "gamma_home");
  homeXg *= snapNumOr(snapshot, 1, "delta_final_home");
  homeXg *= snapNumOr(snapshot, 1, "sigma_home");
  homeXg *= snapNumOr(snapshot, 1, "host_nation_boost");

  awayXg *= snapNumOr(snapshot, 1, "gamma_away");
  awayXg *= snapNumOr(snapshot, 1, "delta_final_away");
  awayXg *= snapNumOr(snapshot, 1, "sigma_away");

  homeXg = Math.round(homeXg * 100) / 100;
  awayXg = Math.round(awayXg * 100) / 100;

  let rho = snapNumOr(snapshot, 0, "rho");
  if (typeof snapshot.rho_base === "number") {
    const rhoBase = snapshot.rho_base as number;
    const lowBoost = typeof snapshot.rho_low_event_boost === "number"
      ? (snapshot.rho_low_event_boost as number)
      : 0;
    rho = attenuateRhoForExpectedGoalGap(rhoBase + lowBoost, homeXg, awayXg);
  }

  return { homeXg, awayXg, rho };
}

export function recomputeHubPredictionFromSnapshot(
  snapshot: Record<string, unknown>,
  calibration: WcCalibrationConstants,
  modelVersion: string
): HubPredictionRow {
  const { homeXg, awayXg, rho } = recomputeXgFromSnapshot(snapshot, calibration);
  const mutualDraw = String(snapshot.scenario ?? "").includes("mutual_draw");
  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw);
  const temperedH = Math.pow(outcomes.homeWin, GRAHAM_1X2_TEMPERATURE);
  const temperedD = Math.pow(outcomes.draw, GRAHAM_1X2_TEMPERATURE);
  const temperedA = Math.pow(outcomes.awayWin, GRAHAM_1X2_TEMPERATURE);
  const temperedSum = temperedH + temperedD + temperedA || 1;
  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);

  return {
    home_win_pct: Number((temperedH / temperedSum).toFixed(4)),
    draw_pct: Number((temperedD / temperedSum).toFixed(4)),
    away_win_pct: Number((temperedA / temperedSum).toFixed(4)),
    predicted_score_home: outcomes.predictedHome,
    predicted_score_away: outcomes.predictedAway,
    under_2_5_pct: Number(outcomes.under25.toFixed(4)),
    over_2_5_pct: Number(outcomes.over25.toFixed(4)),
    model_version: modelVersion,
    snapshot: {
      ...snapshot,
      home_xg: homeXg,
      away_xg: awayXg,
      lambda: homeXg,
      mu: awayXg,
      rho,
      top_scorelines: outcomes.topScorelines,
      ml_recomputed: true,
      calibration_version: calibration.modelVersion,
    },
  };
}

export function evaluateSnapshotWithCalibration(
  snapshot: Record<string, unknown>,
  calibration: WcCalibrationConstants,
  actualHome: number,
  actualAway: number,
  modelVersion: string
) {
  const pred = recomputeHubPredictionFromSnapshot(snapshot, calibration, modelVersion);
  return evaluateHubPredictionAgainstResult(pred, actualHome, actualAway);
}

export function avgCompositeLossForSnapshots(
  rows: Array<{
    snapshot: Record<string, unknown>;
    actualHome: number;
    actualAway: number;
  }>,
  calibration: WcCalibrationConstants,
  modelVersion: string
): number {
  if (!rows.length) return Infinity;
  let sum = 0;
  for (const row of rows) {
    const scores = evaluateSnapshotWithCalibration(
      row.snapshot,
      calibration,
      row.actualHome,
      row.actualAway,
      modelVersion
    );
    sum += scores.compositeLoss;
  }
  return sum / rows.length;
}

export function avgBrier1x2ForSnapshots(
  rows: Array<{
    snapshot: Record<string, unknown>;
    actualHome: number;
    actualAway: number;
  }>,
  calibration: WcCalibrationConstants,
  modelVersion: string
): number {
  if (!rows.length) return Infinity;
  let sum = 0;
  for (const row of rows) {
    const scores = evaluateSnapshotWithCalibration(
      row.snapshot,
      calibration,
      row.actualHome,
      row.actualAway,
      modelVersion
    );
    sum += scores.brier1x2;
  }
  return sum / rows.length;
}

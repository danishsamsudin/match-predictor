import {
  GRAHAM_1X2_TEMPERATURE,
  GRAHAM_DELTA_S_CAP,
} from "@/lib/world-cup/graham-model-config";
import { applySetPieceXgAdjustment } from "@/lib/world-cup/graham-set-piece-adjustment";
import { applyTalentWeightDecay } from "@/lib/world-cup/graham-talent-decay";
import { applyFinishingRegressionToXg } from "@/lib/world-cup/graham-wc-in-tournament-form";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import {
  clampInternationalBaselineXg,
  INTERNATIONAL_XG_FLOOR,
} from "@/lib/world-cup/international-strength";
import {
  attenuateRhoForExpectedGoalGap,
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
  resolveEffectiveOverdispersionK,
  type ScoreGridOptions,
} from "@/lib/world-cup/score-grid";
import {
  normalizeDeltaWeights,
  type WcCalibrationConstants,
} from "@/lib/world-cup/wc-calibration-config";
import { scoreLockedPrediction } from "@/lib/world-cup/wc-prediction-eval";

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

function snapshotGridOptions(
  snapshot: Record<string, unknown>,
  calibration: WcCalibrationConstants,
  homeXg: number,
  awayXg: number
): ScoreGridOptions {
  return {
    goalOverdispersionK: resolveEffectiveOverdispersionK(
      homeXg,
      awayXg,
      calibration.goalOverdispersionK,
      snapNumOr(snapshot, 1.5, "home_avg_chance_index"),
      snapNumOr(snapshot, 1.5, "away_avg_chance_index")
    ),
    redCardMatchBaseProb: calibration.redCardMatchBaseProb,
    homeDisciplineLoad: snapNumOr(snapshot, 0, "home_discipline_load"),
    awayDisciplineLoad: snapNumOr(snapshot, 0, "away_discipline_load"),
    redCardAttackPenalty: calibration.redCardAttackPenalty,
    redCardOpponentBoost: calibration.redCardOpponentBoost,
  };
}

/**
 * Recompute final xG from a locked prediction snapshot and candidate calibration.
 * Uses frozen delta features from snapshot; only weights / mu / exponent / momentum change.
 */
export function recomputeXgFromSnapshot(
  snapshot: Record<string, unknown>,
  calibration: WcCalibrationConstants
): { homeXg: number; awayXg: number; rho: number } {
  const baseWeights = normalizeDeltaWeights(calibration.deltaWeights);
  const homeWcMatches = snapNum(snapshot, "wc_form_home_matches");
  const awayWcMatches = snapNum(snapshot, "wc_form_away_matches");
  const { weights } = applyTalentWeightDecay(
    baseWeights,
    homeWcMatches,
    awayWcMatches,
    calibration
  );
  const mu = calibration.muXg;
  const c = calibration.strengthExponent;
  const xgSoftness = calibration.xgCapSoftness ?? 0;

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

  let homeXg = clampInternationalBaselineXg(
    mu * Math.exp(c * totalDeltaS),
    xgSoftness
  );
  let awayXg = clampInternationalBaselineXg(
    mu * Math.exp(-c * totalDeltaS),
    xgSoftness
  );

  const homeTeamId = snapNum(snapshot, "home_team_api_id");
  const awayTeamId = snapNum(snapshot, "away_team_api_id");
  const homeSetShare =
    typeof snapshot.home_set_piece_share === "number"
      ? snapshot.home_set_piece_share
      : 0;
  const awaySetShare =
    typeof snapshot.away_set_piece_share === "number"
      ? snapshot.away_set_piece_share
      : 0;

  const setPieceAdj = applySetPieceXgAdjustment({
    homeXg,
    awayXg,
    home: {
      teamId: homeTeamId,
      processSetPieceShare: homeSetShare,
      optaSetPieceRate: calibration.teamSetPieceRates?.[String(homeTeamId)] ?? null,
      opponentDefensiveSolidity: snapNumOr(snapshot, 1.5, "away_avg_defensive_solidity"),
      opponentSetPieceShare: awaySetShare,
    },
    away: {
      teamId: awayTeamId,
      processSetPieceShare: awaySetShare,
      optaSetPieceRate: calibration.teamSetPieceRates?.[String(awayTeamId)] ?? null,
      opponentDefensiveSolidity: snapNumOr(snapshot, 1.5, "home_avg_defensive_solidity"),
      opponentSetPieceShare: homeSetShare,
    },
    calibration,
  });
  homeXg = setPieceAdj.homeXg;
  awayXg = setPieceAdj.awayXg;

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
    attackNudge: snapNumOr(snapshot, 1, "wc_attack_nudge_home"),
    defenseNudge: 1,
    finishingRegression: finishingHome,
    matchCount: homeWcMatches,
    avgChanceIndex: snapNumOr(snapshot, 1.5, "home_avg_chance_index"),
    avgDefensiveSolidity: snapNumOr(snapshot, 1.5, "home_avg_defensive_solidity"),
    avgDisciplineLoad: snapNumOr(snapshot, 0, "home_discipline_load"),
  }, {
    attackNudge: snapNumOr(snapshot, 1, "wc_attack_nudge_away"),
    defenseNudge: 1,
    finishingRegression: finishingAway,
    matchCount: awayWcMatches,
    avgChanceIndex: snapNumOr(snapshot, 1.5, "away_avg_chance_index"),
    avgDefensiveSolidity: snapNumOr(snapshot, 1.5, "away_avg_defensive_solidity"),
    avgDisciplineLoad: snapNumOr(snapshot, 0, "away_discipline_load"),
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

  homeXg *= snapNumOr(snapshot, 1, "lineup_home_xg_mult");
  awayXg *= snapNumOr(snapshot, 1, "lineup_away_xg_mult");
  awayXg *= snapNumOr(snapshot, 1, "lineup_home_defense_mult");
  homeXg *= snapNumOr(snapshot, 1, "lineup_away_defense_mult");

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
  const gridOptions = snapshotGridOptions(snapshot, calibration, homeXg, awayXg);
  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw, gridOptions);
  const temperedH = Math.pow(outcomes.homeWin, GRAHAM_1X2_TEMPERATURE);
  const temperedD = Math.pow(outcomes.draw, GRAHAM_1X2_TEMPERATURE);
  const temperedA = Math.pow(outcomes.awayWin, GRAHAM_1X2_TEMPERATURE);
  const temperedSum = temperedH + temperedD + temperedA || 1;
  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw, gridOptions);

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
      goal_overdispersion_k: gridOptions.goalOverdispersionK,
      red_card_match_prob: outcomes.pRedMatch,
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
  return scoreLockedPrediction(pred, actualHome, actualAway, { usePublished1x2: true });
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

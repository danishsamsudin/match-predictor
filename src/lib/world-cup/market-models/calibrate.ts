import { trainPlayerPropMlCoeffs, type PlayerPropTrainingRow } from "@/lib/prediction/player-props-ml";
import { mergeMarketModelsConfig } from "@/lib/world-cup/market-models/defaults";
import { brierScore } from "@/lib/world-cup/market-models/stacking";
import type {
  LogisticStackCoeffs,
  MarketEvaluationRow,
  MarketModelId,
  MarketModelsConfig,
} from "@/lib/world-cup/market-models/types";

const MIN_SAMPLES = 8;
const BLEND_STEP = 0.06;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function blendScalar(deployed: number, target: number, step = BLEND_STEP): number {
  return deployed + step * (target - deployed);
}

function tuneLogisticStack(
  deployed: LogisticStackCoeffs,
  rows: MarketEvaluationRow[]
): LogisticStackCoeffs {
  if (rows.length < MIN_SAMPLES) return deployed;

  let totalBrier = 0;
  let overCount = 0;
  for (const row of rows) {
    const pred = row.predicted as { yesPct?: number; overPct?: number };
    const prob = (pred.yesPct ?? pred.overPct ?? 50) / 100;
    const actual = row.actual as { yes?: boolean; over?: boolean };
    const hit = Boolean(actual.yes ?? actual.over);
    totalBrier += brierScore(prob, hit);
    if (hit) overCount += 1;
  }
  const avgBrier = totalBrier / rows.length;
  const hitRate = overCount / rows.length;
  const avgPred =
    rows.reduce((s, r) => {
      const pred = r.predicted as { yesPct?: number; overPct?: number };
      return s + (pred.yesPct ?? pred.overPct ?? 50) / 100;
    }, 0) / rows.length;
  const bias = hitRate - avgPred;

  return {
    ...deployed,
    intercept: blendScalar(deployed.intercept, deployed.intercept + bias * 0.8),
    priorWeight: blendScalar(deployed.priorWeight, deployed.priorWeight + (0.5 - avgBrier) * 0.1),
    mlBlend: clamp(blendScalar(deployed.mlBlend, deployed.mlBlend + Math.abs(bias) * 0.3), 0.2, 0.75),
  };
}

export interface MarketCalibrationResult {
  marketModels: MarketModelsConfig;
  changes: Array<{ marketId: MarketModelId; description: string }>;
  insufficient: MarketModelId[];
}

export function calibrateMarketModelsFromEvaluations(input: {
  deployed: MarketModelsConfig;
  evaluations: MarketEvaluationRow[];
  playerPropRows?: {
    anytime: PlayerPropTrainingRow[];
    goalAssist: PlayerPropTrainingRow[];
  };
}): MarketCalibrationResult {
  const { deployed, evaluations, playerPropRows } = input;
  const next = mergeMarketModelsConfig(deployed);
  const changes: Array<{ marketId: MarketModelId; description: string }> = [];
  const insufficient: MarketModelId[] = [];

  const bttsRows = evaluations.filter((r) => r.marketId === "btts");
  if (bttsRows.length >= MIN_SAMPLES) {
    const tuned = tuneLogisticStack(next.btts, bttsRows);
    if (tuned.intercept !== deployed.btts.intercept || tuned.mlBlend !== deployed.btts.mlBlend) {
      changes.push({
        marketId: "btts",
        description: `BTTS calibration adjusted (intercept ${deployed.btts.intercept.toFixed(3)} → ${tuned.intercept.toFixed(3)}, mlBlend ${deployed.btts.mlBlend.toFixed(2)} → ${tuned.mlBlend.toFixed(2)}).`,
      });
    }
    next.btts = tuned;
  } else {
    insufficient.push("btts");
  }

  for (const line of ["0.5", "1.5", "2.5", "3.5"]) {
    const ouRows = evaluations.filter(
      (r) =>
        r.marketId === "goals_over_under" &&
        (r.predicted as { line?: number }).line === Number(line)
    );
    if (ouRows.length < MIN_SAMPLES) {
      insufficient.push("goals_over_under");
      continue;
    }
    const tuned = tuneLogisticStack(next.overUnder[line]!, ouRows);
    next.overUnder[line] = tuned;
    changes.push({
      marketId: "goals_over_under",
      description: `O/U ${line} line calibration nudged (mlBlend → ${tuned.mlBlend.toFixed(2)}).`,
    });
  }

  const csRows = evaluations.filter((r) => r.marketId === "correct_score");
  if (csRows.length >= MIN_SAMPLES) {
    const hitRate = csRows.filter((r) => r.lossValue === 0).length / csRows.length;
    const rhoAdj = blendScalar(
      next.correctScore.rhoAdjust,
      next.correctScore.rhoAdjust + (hitRate < 0.4 ? -0.01 : hitRate > 0.55 ? 0.01 : 0)
    );
    next.correctScore = {
      ...next.correctScore,
      rhoAdjust: clamp(rhoAdj, -0.06, 0.06),
      top2RerankWeight: clamp(
        blendScalar(next.correctScore.top2RerankWeight, next.correctScore.top2RerankWeight + 0.02),
        0.05,
        0.35
      ),
    };
    changes.push({
      marketId: "correct_score",
      description: `Correct-score top-2 hit rate ${(hitRate * 100).toFixed(0)}% — ρ adjust ${next.correctScore.rhoAdjust.toFixed(3)}.`,
    });
  } else {
    insufficient.push("correct_score");
  }

  const xgRows = evaluations.filter((r) => r.marketId === "expected_goals");
  if (xgRows.length >= MIN_SAMPLES) {
    const avgMae = xgRows.reduce((s, r) => s + r.lossValue, 0) / xgRows.length;
    const blendTarget = avgMae > 0.75 ? deployed.xgHome.mlBlend + 0.04 : deployed.xgHome.mlBlend - 0.02;
    next.xgHome = { ...next.xgHome, mlBlend: clamp(blendScalar(deployed.xgHome.mlBlend, blendTarget), 0.08, 0.4) };
    next.xgAway = { ...next.xgAway, mlBlend: next.xgHome.mlBlend };
    changes.push({
      marketId: "expected_goals",
      description: `xG blend weight → ${next.xgHome.mlBlend.toFixed(2)} (holdout MAE ${avgMae.toFixed(2)}).`,
    });
  } else {
    insufficient.push("expected_goals");
  }

  if (playerPropRows?.anytime && playerPropRows.anytime.length >= MIN_SAMPLES) {
    const trained = trainPlayerPropMlCoeffs(playerPropRows.anytime, deployed.playerProps.anytime);
    next.playerProps.anytime = trained.coeffs;
    changes.push({
      marketId: "player_props_anytime",
      description: `Anytime-scorer Brier ${trained.brier.toFixed(3)} on ${trained.sampleSize} rows.`,
    });
  } else {
    insufficient.push("player_props_anytime");
  }

  if (playerPropRows?.goalAssist && playerPropRows.goalAssist.length >= MIN_SAMPLES) {
    const trained = trainPlayerPropMlCoeffs(
      playerPropRows.goalAssist,
      deployed.playerProps.goalAssist
    );
    next.playerProps.goalAssist = trained.coeffs;
    changes.push({
      marketId: "player_props_goal_assist",
      description: `Goal-or-assist Brier ${trained.brier.toFixed(3)} on ${trained.sampleSize} rows.`,
    });
  } else {
    insufficient.push("player_props_goal_assist");
  }

  const eventRows = evaluations.filter((r) => r.marketId === "event_stats");
  if (eventRows.length >= MIN_SAMPLES) {
    const avgMae = eventRows.reduce((s, r) => s + r.lossValue, 0) / eventRows.length;
    for (const kind of ["corners", "fouls", "yellow", "red"] as const) {
      const c = next.eventStats[kind];
      next.eventStats[kind] = {
        ...c,
        homeTeamRateSlope: blendScalar(c.homeTeamRateSlope, c.homeTeamRateSlope + 0.02),
        awayTeamRateSlope: blendScalar(c.awayTeamRateSlope, c.awayTeamRateSlope + 0.02),
      };
    }
    changes.push({
      marketId: "event_stats",
      description: `Event-stats team-rate slopes increased (avg MAE ${avgMae.toFixed(2)}).`,
    });
  } else {
    insufficient.push("event_stats");
  }

  return { marketModels: next, changes, insufficient: [...new Set(insufficient)] };
}

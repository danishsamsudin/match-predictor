import { computeHandicapMarkets } from "@/lib/prediction/handicap-probabilities";
import { computeMarketAnalytics } from "@/lib/prediction/market-probabilities";
import type { OverUnderLine, PredictionAnalytics } from "@/lib/types/prediction";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";
import { mergeMarketModelsConfig } from "@/lib/world-cup/market-models/defaults";
import { buildMarketStackFeatures } from "@/lib/world-cup/market-models/features";
import { probabilityToEuropeanOdds } from "@/lib/world-cup/market-models/odds";
import { applyLogisticStack } from "@/lib/world-cup/market-models/stacking";
import type { MarketModelsConfig, XgBlendCoeffs } from "@/lib/world-cup/market-models/types";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

function snapNum(snapshot: Record<string, unknown>, key: string, fallback = 0): number {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function blendXg(
  grahamXg: number,
  coeffs: XgBlendCoeffs,
  features: { chanceIndex: number; formScore: number; momentum: number; lineupImpact: number }
): number {
  const mlAdj =
    coeffs.intercept +
    coeffs.chanceIndexSlope * features.chanceIndex +
    coeffs.formScoreSlope * features.formScore +
    coeffs.momentumSlope * features.momentum +
    coeffs.lineupImpactSlope * features.lineupImpact;
  const mlXg = grahamXg * Math.exp(mlAdj);
  const blend = Math.min(0.45, Math.max(0, coeffs.mlBlend));
  return grahamXg * (1 - blend) + mlXg * blend;
}

function gridBttsYes(matrix: Array<{ home: number; away: number; probability: number }>): number {
  let yes = 0;
  for (const cell of matrix) {
    if (cell.home > 0 && cell.away > 0) yes += cell.probability;
  }
  return yes;
}

function gridOverProb(
  matrix: Array<{ home: number; away: number; probability: number }>,
  line: number
): number {
  let over = 0;
  for (const cell of matrix) {
    if (cell.home + cell.away > line) over += cell.probability;
  }
  return over;
}

export function resolveMarketModelsConfig(
  calibration: WcCalibrationConstants
): MarketModelsConfig {
  const raw = (calibration as WcCalibrationConstants & { marketModels?: Partial<MarketModelsConfig> })
    .marketModels;
  return mergeMarketModelsConfig(raw);
}

export function applyMarketModelCalibration(
  analytics: PredictionAnalytics,
  pred: HubPredictionRow,
  calibration: WcCalibrationConstants,
  opts?: { isKnockout?: boolean; homeFormScore?: number; awayFormScore?: number }
): PredictionAnalytics {
  const marketModels = resolveMarketModelsConfig(calibration);
  const snap = pred.snapshot;
  const features = buildMarketStackFeatures({ pred, isKnockout: opts?.isKnockout });
  const homeXg = snapNum(snap, "home_xg", snapNum(snap, "lambda", 1.25));
  const awayXg = snapNum(snap, "away_xg", snapNum(snap, "mu", 1.25));
  const rho = snapNum(snap, "rho", 0);
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");
  const rhoAdj = marketModels.correctScore.rhoAdjust;
  const grid = buildGuardedScoreMatrix(
    homeXg,
    awayXg,
    rho + rhoAdj,
    mutualDraw,
    {
      goalOverdispersionK: Math.max(
        0,
        snapNum(snap, "goal_overdispersion_k", 0) +
          marketModels.correctScore.overdispersionKAdjust
      ),
    }
  );
  const matrix = grid.cells;

  const priorBtts = gridBttsYes(matrix);
  const bttsYes = applyLogisticStack(priorBtts, features, marketModels.btts);

  const overUnder: OverUnderLine[] = analytics.overUnder.map((line) => {
    const key = String(line.line);
    const coeffs = marketModels.overUnder[key];
    const priorOver = gridOverProb(matrix, line.line) || line.overPct / 100;
    const over =
      coeffs != null
        ? applyLogisticStack(priorOver, features, coeffs)
        : priorOver;
    const overPct = Math.round(over * 1000) / 10;
    const underPct = Math.round((1 - over) * 1000) / 10;
    return {
      line: line.line,
      overPct,
      underPct,
      overOdds: probabilityToEuropeanOdds(over),
      underOdds: probabilityToEuropeanOdds(1 - over),
    };
  });

  const formHome = opts?.homeFormScore ?? analytics.formScores.homePct / 100;
  const formAway = opts?.awayFormScore ?? analytics.formScores.awayPct / 100;
  const momentum = analytics.momentumIndex;
  const lineupDiff = snapNum(snap, "lineup_impact_diff", 0);
  const chanceHome = snapNum(snap, "home_chance_index", 1);
  const chanceAway = snapNum(snap, "away_chance_index", 1);

  const adjustedHomeXg = blendXg(homeXg, marketModels.xgHome, {
    chanceIndex: chanceHome,
    formScore: formHome,
    momentum,
    lineupImpact: lineupDiff,
  });
  const adjustedAwayXg = blendXg(awayXg, marketModels.xgAway, {
    chanceIndex: chanceAway,
    formScore: formAway,
    momentum: -momentum * 0.5,
    lineupImpact: -lineupDiff,
  });

  const statComparison = analytics.statComparison.map((row) =>
    row.metric === "Expected goals"
      ? {
          ...row,
          home: Math.round(adjustedHomeXg * 100) / 100,
          away: Math.round(adjustedAwayXg * 100) / 100,
        }
      : row
  );

  const handicapMarkets = computeHandicapMarkets(matrix);
  const ahLines = handicapMarkets.asianHandicap.map((line) => {
    const key = String(line.line);
    const coeffs = marketModels.asianHandicap[key];
    if (!coeffs) return line;
    const priorHome = line.homeCoverPct / 100;
    const homeCover = applyLogisticStack(priorHome, features, coeffs);
    return {
      ...line,
      homeCoverPct: Math.round(homeCover * 1000) / 10,
      awayCoverPct: Math.round((1 - homeCover) * 1000) / 10,
    };
  });

  const calibratedGridAnalytics = computeMarketAnalytics(homeXg, awayXg, {
    h2hHomeWinRate: analytics.h2h.homeWinPct / 100,
    h2hDrawRate: analytics.h2h.drawPct / 100,
    h2hAwayWinRate: analytics.h2h.awayWinPct / 100,
    h2hHasData: analytics.h2h.hasData,
    homeFormScore: formHome,
    awayFormScore: formAway,
    momentumIndex: momentum,
    modelImpact: analytics.modelImpact,
    statComparison: analytics.statComparison,
    correlation: rho + rhoAdj,
    heatmapMaxGoals: grid.maxGoals,
  });

  return {
    ...analytics,
    topScores: calibratedGridAnalytics.topScores,
    scoreHeatmap: calibratedGridAnalytics.scoreHeatmap,
    totalGoalsDistribution: calibratedGridAnalytics.totalGoalsDistribution,
    overUnder,
    btts: {
      yesPct: Math.round(bttsYes * 1000) / 10,
      noPct: Math.round((1 - bttsYes) * 1000) / 10,
      yesOdds: probabilityToEuropeanOdds(bttsYes),
      noOdds: probabilityToEuropeanOdds(1 - bttsYes),
    },
    statComparison,
    handicapMarkets: {
      winningMargins: handicapMarkets.winningMargins,
      asianHandicap: ahLines,
    },
  };
}

export function applyXgMarketBlend(
  homeXg: number,
  awayXg: number,
  snapshot: Record<string, unknown>,
  marketModels: MarketModelsConfig,
  formHome: number,
  formAway: number,
  momentum: number
): { homeXg: number; awayXg: number } {
  const lineupDiff = snapNum(snapshot, "lineup_impact_diff", 0);
  return {
    homeXg: blendXg(homeXg, marketModels.xgHome, {
      chanceIndex: snapNum(snapshot, "home_chance_index", 1),
      formScore: formHome,
      momentum,
      lineupImpact: lineupDiff,
    }),
    awayXg: blendXg(awayXg, marketModels.xgAway, {
      chanceIndex: snapNum(snapshot, "away_chance_index", 1),
      formScore: formAway,
      momentum: -momentum * 0.5,
      lineupImpact: -lineupDiff,
    }),
  };
}

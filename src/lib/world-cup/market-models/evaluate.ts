import { computeHandicapMarkets } from "@/lib/prediction/handicap-probabilities";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";
import { scoreLockedPrediction } from "@/lib/world-cup/wc-prediction-eval";
import { buildMarketStackFeatures } from "@/lib/world-cup/market-models/features";
import { brierScore, logLoss } from "@/lib/world-cup/market-models/stacking";
import type { MarketEvaluationRow, MarketModelId } from "@/lib/world-cup/market-models/types";
import { applyMarketModelCalibration } from "@/lib/world-cup/market-models/apply";
import { buildAnalyticsFromHubPrediction } from "@/lib/world-cup/graham-prediction-adapter";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

function snapNum(snapshot: Record<string, unknown>, key: string, fallback = 0): number {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function evaluateMarketsForMatch(input: {
  pred: HubPredictionRow;
  actualHome: number;
  actualAway: number;
  calibration: WcCalibrationConstants;
  modelVersion: string;
  isKnockout?: boolean;
  actualEvents?: {
    corners?: number | null;
    fouls?: number | null;
    yellow?: number | null;
    red?: number | null;
  };
  estimatedEvents?: {
    corners: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
  } | null;
}): MarketEvaluationRow[] {
  const { pred, actualHome, actualAway, calibration, modelVersion } = input;
  const snap = pred.snapshot;
  const homeXg = snapNum(snap, "home_xg", snapNum(snap, "lambda", 1.25));
  const awayXg = snapNum(snap, "away_xg", snapNum(snap, "mu", 1.25));
  const rho = snapNum(snap, "rho", 0);
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");
  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);
  const matrix = grid.cells;

  const baseAnalytics = buildAnalyticsFromHubPrediction(pred, "", "");
  const analytics = applyMarketModelCalibration(baseAnalytics, pred, calibration, {
    isKnockout: input.isKnockout,
  });
  const composite = scoreLockedPrediction(pred, actualHome, actualAway);

  const rows: MarketEvaluationRow[] = [];
  const actualBtts = actualHome > 0 && actualAway > 0;
  const actualTotal = actualHome + actualAway;

  rows.push({
    matchId: "",
    marketId: "win_probability",
    predicted: {
      home: pred.home_win_pct,
      draw: pred.draw_pct,
      away: pred.away_win_pct,
    },
    actual: {
      outcome:
        actualHome > actualAway ? "home" : actualHome === actualAway ? "draw" : "away",
    },
    lossMetric: "brier_1x2",
    lossValue: composite.brier1x2,
    modelVersion,
  });

  rows.push({
    matchId: "",
    marketId: "btts",
    predicted: { yesPct: analytics.btts.yesPct },
    actual: { yes: actualBtts },
    lossMetric: "brier",
    lossValue: brierScore(analytics.btts.yesPct / 100, actualBtts),
    modelVersion,
  });

  for (const line of analytics.overUnder) {
    const overHit = actualTotal > line.line;
    rows.push({
      matchId: "",
      marketId: "goals_over_under",
      predicted: { line: line.line, overPct: line.overPct },
      actual: { over: overHit, totalGoals: actualTotal },
      lossMetric: "brier",
      lossValue: brierScore(line.overPct / 100, overHit),
      modelVersion,
    });
  }

  const sorted = [...matrix].sort((a, b) => b.probability - a.probability);
  const top1 = sorted[0];
  const top2 = sorted[1];
  const top1Hit = top1?.home === actualHome && top1?.away === actualAway;
  const top2Hit =
    top1Hit || (top2?.home === actualHome && top2?.away === actualAway);

  rows.push({
    matchId: "",
    marketId: "correct_score",
    predicted: {
      top1: top1 ? `${top1.home}-${top1.away}` : null,
      top2: top2 ? `${top2.home}-${top2.away}` : null,
      logLoss: composite.logLossScoreline,
    },
    actual: { score: `${actualHome}-${actualAway}` },
    lossMetric: "top2_hit",
    lossValue: top2Hit ? 0 : 1,
    modelVersion,
  });

  const margin = actualHome - actualAway;
  const handicap = computeHandicapMarkets(matrix);
  const marginLine = handicap.winningMargins.find(
    (m) =>
      (m.side === "home" && margin > 0 && m.margin === Math.min(3, margin)) ||
      (m.side === "away" && margin < 0 && m.margin === Math.min(3, -margin))
  );
  rows.push({
    matchId: "",
    marketId: "winning_margin",
    predicted: { margins: handicap.winningMargins },
    actual: { margin },
    lossMetric: "margin_log_loss",
    lossValue: marginLine
      ? logLoss(marginLine.probabilityPct / 100, true)
      : composite.handicapLogLoss,
    modelVersion,
  });

  rows.push({
    matchId: "",
    marketId: "asian_handicap",
    predicted: { lines: handicap.asianHandicap.slice(0, 5) },
    actual: { margin },
    lossMetric: "handicap_log_loss",
    lossValue: composite.handicapLogLoss,
    modelVersion,
  });

  const actualHomeXg = snapNum(snap, "actual_home_xg", NaN);
  const actualAwayXg = snapNum(snap, "actual_away_xg", NaN);
  if (Number.isFinite(actualHomeXg) && Number.isFinite(actualAwayXg)) {
    rows.push({
      matchId: "",
      marketId: "expected_goals",
      predicted: { home: homeXg, away: awayXg },
      actual: { home: actualHomeXg, away: actualAwayXg },
      lossMetric: "mae",
      lossValue:
        (Math.abs(homeXg - actualHomeXg) + Math.abs(awayXg - actualAwayXg)) / 2,
      modelVersion,
    });
  } else {
    rows.push({
      matchId: "",
      marketId: "expected_goals",
      predicted: { home: homeXg, away: awayXg },
      actual: { home: actualHome, away: actualAway },
      lossMetric: "mae_goals",
      lossValue:
        (Math.abs(homeXg - actualHome) + Math.abs(awayXg - actualAway)) / 2,
      modelVersion,
    });
  }

  rows.push({
    matchId: "",
    marketId: "form_momentum",
    predicted: {
      momentum: snapNum(snap, "momentum_index", 0),
      homeForm: snapNum(snap, "home_form_score", 0.5),
      awayForm: snapNum(snap, "away_form_score", 0.5),
    },
    actual: {
      goalDiff: actualHome - actualAway,
      totalGoals: actualTotal,
    },
    lossMetric: "goal_diff_corr_proxy",
    lossValue: Math.abs(
      snapNum(snap, "momentum_index", 0) - (actualHome - actualAway) / 3
    ),
    modelVersion,
  });

  if (input.estimatedEvents && input.actualEvents) {
    const est = input.estimatedEvents;
    const act = input.actualEvents;
    const eventPairs: Array<{
      key: "corners" | "fouls" | "yellow" | "red";
      est: number;
      act: number | null | undefined;
    }> = [
      { key: "corners", est: est.corners, act: act.corners },
      { key: "fouls", est: est.fouls, act: act.fouls },
      { key: "yellow", est: est.yellowCards, act: act.yellow },
      { key: "red", est: est.redCards, act: act.red },
    ];
    let deviance = 0;
    let count = 0;
    for (const pair of eventPairs) {
      if (pair.act == null) continue;
      const err = Math.abs(pair.est - pair.act);
      deviance += err;
      count += 1;
    }
    if (count > 0) {
      rows.push({
        matchId: "",
        marketId: "event_stats",
        predicted: est,
        actual: act,
        lossMetric: "poisson_mae",
        lossValue: deviance / count,
        modelVersion,
      });
    }
  }

  const features = buildMarketStackFeatures({ pred, isKnockout: input.isKnockout });
  rows.push({
    matchId: "",
    marketId: "team_comparison",
    predicted: {
      homeAttack: features.homeAttack,
      awayAttack: features.awayAttack,
      coverage: snapNum(snap, "home_form_match_count", 0) > 0 ? 1 : 0.5,
    },
    actual: { homeGoals: actualHome, awayGoals: actualAway },
    lossMetric: "feature_coverage",
    lossValue: snapNum(snap, "home_form_match_count", 0) > 0 ? 1 : 0.5,
    modelVersion,
  });

  return rows;
}

export function aggregateMarketEvaluations(
  rows: MarketEvaluationRow[],
  marketId: MarketModelId
): { count: number; avgLoss: number; hits?: number } {
  const filtered = rows.filter((r) => r.marketId === marketId);
  if (!filtered.length) return { count: 0, avgLoss: 0 };
  const avgLoss =
    filtered.reduce((s, r) => s + r.lossValue, 0) / filtered.length;
  const hits =
    marketId === "correct_score"
      ? filtered.filter((r) => r.lossValue === 0).length
      : undefined;
  return { count: filtered.length, avgLoss, hits };
}

import { computeHandicapMarkets } from "@/lib/prediction/handicap-probabilities";
import { GRAHAM_1X2_TEMPERATURE } from "@/lib/world-cup/graham-model-config";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";

export interface WcMarketScores {
  brier1x2: number;
  rps1x2: number;
  logLossScoreline: number;
  brierOver25: number;
  brierBtts: number;
  handicapLogLoss: number;
  compositeLoss: number;
  predicted1x2: { home: number; draw: number; away: number };
  predictedOver25: number;
  predictedBttsYes: number;
}

export interface ScoreLockedPredictionOptions {
  /** Score 1X2 Brier/RPS on hub-published tempered probabilities (default true). */
  usePublished1x2?: boolean;
}

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

function probFraction(n: number): number {
  return n > 1 ? n / 100 : n;
}

function rankedProbabilityScore(probs: [number, number, number], outcomeIdx: number): number {
  const sorted = [...probs].sort((a, b) => b - a);
  let cum = 0;
  for (let i = 0; i <= outcomeIdx; i += 1) {
    cum += sorted[i] ?? 0;
  }
  return (cum - probs[outcomeIdx]) ** 2;
}

function temper1x2(home: number, draw: number, away: number): { home: number; draw: number; away: number } {
  const h = Math.pow(home, GRAHAM_1X2_TEMPERATURE);
  const d = Math.pow(draw, GRAHAM_1X2_TEMPERATURE);
  const a = Math.pow(away, GRAHAM_1X2_TEMPERATURE);
  const sum = h + d + a || 1;
  return { home: h / sum, draw: d / sum, away: a / sum };
}

/**
 * Unified scorer for locked hub predictions vs actual results.
 * Uses published tempered 1X2 when available; grid-derived probs for side markets.
 */
export function scoreLockedPrediction(
  pred: HubPredictionRow,
  actualHome: number,
  actualAway: number,
  options: ScoreLockedPredictionOptions = {}
): WcMarketScores {
  const usePublished1x2 = options.usePublished1x2 !== false;
  const snap = pred.snapshot;
  const homeXg = snapshotNumber(snap, "home_xg", "lambda");
  const awayXg = snapshotNumber(snap, "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");

  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);
  const matrix = grid.cells;

  let gridHome = 0;
  let gridDraw = 0;
  let gridAway = 0;
  let pOver25 = 0;
  let pBttsYes = 0;
  let pActualScore = 0;

  for (const cell of matrix) {
    if (cell.home > cell.away) gridHome += cell.probability;
    else if (cell.home === cell.away) gridDraw += cell.probability;
    else gridAway += cell.probability;

    if (cell.home + cell.away > 2.5) pOver25 += cell.probability;
    if (cell.home > 0 && cell.away > 0) pBttsYes += cell.probability;
    if (cell.home === actualHome && cell.away === actualAway) {
      pActualScore += cell.probability;
    }
  }

  const gridTotal = gridHome + gridDraw + gridAway || 1;
  gridHome /= gridTotal;
  gridDraw /= gridTotal;
  gridAway /= gridTotal;

  let pHome: number;
  let pDraw: number;
  let pAway: number;

  if (usePublished1x2) {
    pHome = probFraction(Number(pred.home_win_pct));
    pDraw = probFraction(Number(pred.draw_pct));
    pAway = probFraction(Number(pred.away_win_pct));
    const sum = pHome + pDraw + pAway || 1;
    pHome /= sum;
    pDraw /= sum;
    pAway /= sum;
  } else {
    ({ home: pHome, draw: pDraw, away: pAway } = temper1x2(gridHome, gridDraw, gridAway));
  }

  const actualOutcome =
    actualHome > actualAway ? "home" : actualHome === actualAway ? "draw" : "away";
  const target = {
    home: actualOutcome === "home" ? 1 : 0,
    draw: actualOutcome === "draw" ? 1 : 0,
    away: actualOutcome === "away" ? 1 : 0,
  };

  const brier1x2 =
    (pHome - target.home) ** 2 + (pDraw - target.draw) ** 2 + (pAway - target.away) ** 2;

  const outcomeIdx = actualOutcome === "home" ? 0 : actualOutcome === "draw" ? 1 : 2;
  const rps1x2 = rankedProbabilityScore([pHome, pDraw, pAway], outcomeIdx);

  const logLossScoreline = -Math.log(Math.max(pActualScore, 1e-9));

  const actualOver = actualHome + actualAway > 2.5 ? 1 : 0;
  const brierOver25 = (pOver25 - actualOver) ** 2;

  const actualBtts = actualHome > 0 && actualAway > 0 ? 1 : 0;
  const brierBtts = (pBttsYes - actualBtts) ** 2;

  const handicap = computeHandicapMarkets(
    matrix.map((c) => ({ home: c.home, away: c.away, probability: c.probability }))
  );
  const margin = actualHome - actualAway;
  let handicapLogLoss = 0;
  let handicapCount = 0;
  for (const line of handicap.winningMargins) {
    const hit =
      line.side === "home" ? margin === line.margin : margin === -line.margin;
    const p = line.probabilityPct / 100;
    handicapLogLoss += -Math.log(hit ? Math.max(p, 1e-9) : Math.max(1 - p, 1e-9));
    handicapCount += 1;
  }
  handicapLogLoss = handicapCount > 0 ? handicapLogLoss / handicapCount : 0;

  const compositeLoss =
    0.35 * brier1x2 +
    0.1 * rps1x2 +
    0.25 * Math.min(logLossScoreline, 8) / 8 +
    0.15 * brierOver25 +
    0.1 * brierBtts +
    0.05 * Math.min(handicapLogLoss, 6) / 6;

  return {
    brier1x2,
    rps1x2,
    logLossScoreline,
    brierOver25,
    brierBtts,
    handicapLogLoss,
    compositeLoss,
    predicted1x2: { home: pHome, draw: pDraw, away: pAway },
    predictedOver25: pOver25,
    predictedBttsYes: pBttsYes,
  };
}

/** @deprecated Use scoreLockedPrediction */
export function evaluateHubPredictionAgainstResult(
  pred: HubPredictionRow,
  actualHome: number,
  actualAway: number
): WcMarketScores {
  return scoreLockedPrediction(pred, actualHome, actualAway);
}

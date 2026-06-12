import { computeHandicapMarkets } from "@/lib/prediction/handicap-probabilities";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";

export interface WcMarketScores {
  brier1x2: number;
  logLossScoreline: number;
  brierOver25: number;
  brierBtts: number;
  handicapLogLoss: number;
  compositeLoss: number;
  predicted1x2: { home: number; draw: number; away: number };
  predictedOver25: number;
  predictedBttsYes: number;
}

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

export function evaluateHubPredictionAgainstResult(
  pred: HubPredictionRow,
  actualHome: number,
  actualAway: number
): WcMarketScores {
  const snap = pred.snapshot;
  const homeXg = snapshotNumber(snap, "home_xg", "lambda");
  const awayXg = snapshotNumber(snap, "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");

  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);
  const matrix = grid.cells;

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pOver25 = 0;
  let pBttsYes = 0;
  let pActualScore = 0;

  for (const cell of matrix) {
    if (cell.home > cell.away) pHome += cell.probability;
    else if (cell.home === cell.away) pDraw += cell.probability;
    else pAway += cell.probability;

    if (cell.home + cell.away > 2.5) pOver25 += cell.probability;
    if (cell.home > 0 && cell.away > 0) pBttsYes += cell.probability;
    if (cell.home === actualHome && cell.away === actualAway) {
      pActualScore += cell.probability;
    }
  }

  const total = pHome + pDraw + pAway || 1;
  pHome /= total;
  pDraw /= total;
  pAway /= total;

  const actualOutcome =
    actualHome > actualAway ? "home" : actualHome === actualAway ? "draw" : "away";
  const target = {
    home: actualOutcome === "home" ? 1 : 0,
    draw: actualOutcome === "draw" ? 1 : 0,
    away: actualOutcome === "away" ? 1 : 0,
  };
  const brier1x2 =
    (pHome - target.home) ** 2 + (pDraw - target.draw) ** 2 + (pAway - target.away) ** 2;

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
      line.side === "home"
        ? margin === line.margin
        : margin === -line.margin;
    const p = line.probabilityPct / 100;
    handicapLogLoss += -Math.log(hit ? Math.max(p, 1e-9) : Math.max(1 - p, 1e-9));
    handicapCount += 1;
  }
  handicapLogLoss = handicapCount > 0 ? handicapLogLoss / handicapCount : 0;

  const compositeLoss =
    0.3 * brier1x2 +
    0.2 * Math.min(logLossScoreline, 8) / 8 +
    0.2 * brierOver25 +
    0.15 * brierBtts +
    0.15 * Math.min(handicapLogLoss, 6) / 6;

  return {
    brier1x2,
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

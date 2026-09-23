/**
 * Club-style derived markets (EH, goal ranges, team totals, double chance)
 * from a Graham score grid - same presentation math as GLPM-CX.
 */

import {
  deriveMarketsFromScoreMatrix,
  type DerivedMarkets,
} from "@/lib/glpm-cx/derived-markets";
import type { PredictionAnalytics } from "@/lib/types/prediction";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";

function cellsToScoreMatrix(
  cells: Array<{ home: number; away: number; probability: number }>,
  maxGoals: number
): number[][] {
  const matrix: number[][] = Array.from({ length: maxGoals + 1 }, () =>
    Array.from({ length: maxGoals + 1 }, () => 0)
  );
  for (const cell of cells) {
    if (cell.home > maxGoals || cell.away > maxGoals) continue;
    matrix[cell.home]![cell.away] = cell.probability;
  }
  return matrix;
}

export function deriveClubMarketsFromGraham(input: {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  homeXg: number;
  awayXg: number;
  rho: number;
  mutualDraw?: boolean;
  analytics: PredictionAnalytics;
}): DerivedMarkets {
  const grid = buildGuardedScoreMatrix(
    input.homeXg,
    input.awayXg,
    input.rho,
    input.mutualDraw ?? false
  );
  const scoreMatrix = cellsToScoreMatrix(grid.cells, grid.maxGoals);

  const overUnder: Record<string, { over: number; under: number }> = {};
  for (const line of input.analytics.overUnder) {
    overUnder[String(line.line)] = {
      over: line.overPct / 100,
      under: line.underPct / 100,
    };
  }

  return deriveMarketsFromScoreMatrix({
    scoreMatrix,
    homeWin: input.homeWinPct / 100,
    draw: input.drawPct / 100,
    awayWin: input.awayWinPct / 100,
    bttsYes: input.analytics.btts.yesPct / 100,
    bttsNo: input.analytics.btts.noPct / 100,
    overUnder,
  });
}

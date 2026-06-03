import { describe, expect, it } from "vitest";
import {
  buildScoreMatrix,
  computeFirstTeamToScoreFromMatrix,
  computeOutcomeProbabilities,
  resolveScoreMatrixCorrelation,
  resolveScoreMatrixMaxGoals,
} from "@/lib/prediction/market-probabilities";

describe("resolveScoreMatrixMaxGoals", () => {
  it("uses at least 5 goals and scales with xG", () => {
    expect(resolveScoreMatrixMaxGoals(1, 1)).toBe(5);
    expect(resolveScoreMatrixMaxGoals(0.8, 2.5)).toBe(6);
    expect(resolveScoreMatrixMaxGoals(2.4, 2.8)).toBeGreaterThanOrEqual(5);
  });
});

describe("score matrix consistency", () => {
  it("uses the same maxGoals for heatmap and 1X2 so draws are not inflated by truncation", () => {
    const homeXg = 1;
    const awayXg = 2.8;
    const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
    const rho = resolveScoreMatrixCorrelation(homeXg, awayXg, false);

    const outcomes = computeOutcomeProbabilities(homeXg, awayXg, maxGoals, {
      correlation: rho,
    });
    const matrix = buildScoreMatrix(homeXg, awayXg, maxGoals, { correlation: rho });

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    for (const cell of matrix) {
      if (cell.home > cell.away) homeWin += cell.probability;
      else if (cell.home === cell.away) draw += cell.probability;
      else awayWin += cell.probability;
    }

    expect(draw).toBeCloseTo(outcomes.draw, 3);
    expect(homeWin).toBeCloseTo(outcomes.homeWin, 3);
    expect(awayWin).toBeCloseTo(outcomes.awayWin, 3);
  });

  it("ranks away-win scorelines above draws when away xG dominates", () => {
    const homeXg = 0.85;
    const awayXg = 2.3;
    const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
    const rho = resolveScoreMatrixCorrelation(homeXg, awayXg, false);
    const top = buildScoreMatrix(homeXg, awayXg, maxGoals, { correlation: rho })
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

    const drawInTop3 = top.filter((c) => c.home === c.away).length;
    expect(drawInTop3).toBeLessThanOrEqual(1);
    expect(top[0].away).toBeGreaterThan(top[0].home);
  });
});

describe("computeFirstTeamToScoreFromMatrix", () => {
  it("varies no-goal share with xG instead of a flat 10%", () => {
    const low = computeFirstTeamToScoreFromMatrix(0.35, 0.4, 8);
    const high = computeFirstTeamToScoreFromMatrix(2.2, 2.4, 8);
    expect(low.none).toBeGreaterThan(high.none);
    expect(low.home + low.away + low.none).toBeGreaterThanOrEqual(98);
    expect(low.none).not.toBe(10);
  });
});

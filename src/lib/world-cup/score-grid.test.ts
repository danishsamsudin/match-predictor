import { describe, expect, it } from "vitest";
import {
  buildGuardedScoreMatrix,
  goalMarginalPmf,
  outcomesFromGuardedGrid,
  probabilityTotalGoalsAtLeast,
} from "@/lib/world-cup/score-grid";

describe("score-grid overdispersion", () => {
  it("NB marginal matches Poisson when k is zero", () => {
    expect(goalMarginalPmf(2, 1.4, 0)).toBeCloseTo(
      Math.exp(-1.4) * Math.pow(1.4, 2) / 2,
      5
    );
  });

  it("NB marginal has higher variance than Poisson for the same mean", () => {
    const lambda = 1.35;
    const kDisp = 1.0;
    let meanP = 0;
    let meanN = 0;
    for (let goals = 0; goals <= 12; goals += 1) {
      meanP += goals * goalMarginalPmf(goals, lambda, 0);
      meanN += goals * goalMarginalPmf(goals, lambda, kDisp);
    }
    let varP = 0;
    let varN = 0;
    for (let goals = 0; goals <= 12; goals += 1) {
      const pP = goalMarginalPmf(goals, lambda, 0);
      const pN = goalMarginalPmf(goals, lambda, kDisp);
      varP += pP * (goals - meanP) ** 2;
      varN += pN * (goals - meanN) ** 2;
    }
    expect(varN).toBeGreaterThan(varP);
  });

  it("red-card mixture fattens tails when base prob is positive", () => {
    const homeXg = 1.5;
    const awayXg = 1.2;
    const base = outcomesFromGuardedGrid(homeXg, awayXg, -0.08, false, {
      goalOverdispersionK: 0,
      redCardMatchBaseProb: 0,
    });
    const withRed = outcomesFromGuardedGrid(homeXg, awayXg, -0.08, false, {
      goalOverdispersionK: 0,
      redCardMatchBaseProb: 0.08,
      homeDisciplineLoad: 1,
      awayDisciplineLoad: 1,
    });
    expect(withRed.over25).toBeGreaterThanOrEqual(base.over25 - 0.01);
    expect(withRed.pRedMatch).toBeGreaterThan(0);
  });
});

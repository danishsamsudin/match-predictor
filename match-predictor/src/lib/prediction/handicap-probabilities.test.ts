import { describe, expect, it } from "vitest";
import {
  asianHomeCoverEffective,
  buildMarginHistogram,
  computeAsianHandicapLines,
  computeHandicapMarkets,
  computeWinningMargins,
} from "@/lib/prediction/handicap-probabilities";
import {
  buildScoreMatrix,
  computeOutcomeProbabilities,
  resolveScoreMatrixCorrelation,
  resolveScoreMatrixMaxGoals,
} from "@/lib/prediction/market-probabilities";

function matrixFor(homeXg: number, awayXg: number) {
  const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
  const rho = resolveScoreMatrixCorrelation(homeXg, awayXg, false);
  return buildScoreMatrix(homeXg, awayXg, maxGoals, { correlation: rho });
}

describe("computeHandicapMarkets", () => {
  it("exports 6 winning margins and 12 Asian Handicap lines", () => {
    const markets = computeHandicapMarkets(matrixFor(1.4, 1.1));
    expect(markets.winningMargins).toHaveLength(6);
    expect(markets.asianHandicap).toHaveLength(12);
  });

  it("keeps margin probabilities within 1X2 win shares", () => {
    const homeXg = 1.5;
    const awayXg = 1.0;
    const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
    const rho = resolveScoreMatrixCorrelation(homeXg, awayXg, false);
    const outcomes = computeOutcomeProbabilities(homeXg, awayXg, maxGoals, {
      correlation: rho,
    });
    const markets = computeHandicapMarkets(matrixFor(homeXg, awayXg));

    const homeMarginSum = markets.winningMargins
      .filter((m) => m.side === "home")
      .reduce((s, m) => s + m.probabilityPct, 0);
    const awayMarginSum = markets.winningMargins
      .filter((m) => m.side === "away")
      .reduce((s, m) => s + m.probabilityPct, 0);

    expect(homeMarginSum).toBeLessThanOrEqual(outcomes.homeWin * 100 + 0.2);
    expect(awayMarginSum).toBeLessThanOrEqual(outcomes.awayWin * 100 + 0.2);
  });

  it("matches home -0.5 cover to home win probability", () => {
    const homeXg = 1.6;
    const awayXg = 1.0;
    const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
    const rho = resolveScoreMatrixCorrelation(homeXg, awayXg, false);
    const outcomes = computeOutcomeProbabilities(homeXg, awayXg, maxGoals, {
      correlation: rho,
    });
    const markets = computeHandicapMarkets(matrixFor(homeXg, awayXg));
    const minusHalf = markets.asianHandicap.find((l) => l.line === -0.5)!;

    expect(minusHalf.homeCoverPct).toBeCloseTo(outcomes.homeWin * 100, 0);
  });

  it("matches home +0.5 cover to home win plus draw", () => {
    const homeXg = 1.2;
    const awayXg = 1.3;
    const maxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
    const rho = resolveScoreMatrixCorrelation(homeXg, awayXg, false);
    const outcomes = computeOutcomeProbabilities(homeXg, awayXg, maxGoals, {
      correlation: rho,
    });
    const markets = computeHandicapMarkets(matrixFor(homeXg, awayXg));
    const plusHalf = markets.asianHandicap.find((l) => l.line === 0.5)!;

    expect(plusHalf.homeCoverPct).toBeCloseTo(
      (outcomes.homeWin + outcomes.draw) * 100,
      0
    );
  });

  it("matches -1.5 cover to home win by 2+ goals", () => {
    const matrix = matrixFor(1.8, 0.9);
    const histogram = buildMarginHistogram(matrix);
    const markets = computeHandicapMarkets(matrix);
    const minusOneHalf = markets.asianHandicap.find((l) => l.line === -1.5)!;

    let winByTwoPlus = 0;
    for (const [margin, prob] of histogram) {
      if (margin >= 2) winByTwoPlus += prob;
    }

    expect(minusOneHalf.homeCoverPct).toBeCloseTo(winByTwoPlus * 100, 0);
  });

  it("averages quarter line -0.25 between 0 and -0.5", () => {
    const matrix = matrixFor(1.3, 1.1);
    const histogram = buildMarginHistogram(matrix);
    const cover025 = asianHomeCoverEffective(histogram, -0.25);
    const cover0 = asianHomeCoverEffective(histogram, 0);
    const coverMinus05 = asianHomeCoverEffective(histogram, -0.5);

    expect(cover025).toBeCloseTo(0.5 * cover0 + 0.5 * coverMinus05, 6);
  });

  it("returns probabilities in [0, 100]", () => {
    const markets = computeHandicapMarkets(matrixFor(1.1, 1.1));
    for (const m of markets.winningMargins) {
      expect(m.probabilityPct).toBeGreaterThanOrEqual(0);
      expect(m.probabilityPct).toBeLessThanOrEqual(100);
    }
    for (const l of markets.asianHandicap) {
      expect(l.homeCoverPct).toBeGreaterThanOrEqual(0);
      expect(l.homeCoverPct).toBeLessThanOrEqual(100);
      expect(l.awayCoverPct).toBeGreaterThanOrEqual(0);
      expect(l.awayCoverPct).toBeLessThanOrEqual(100);
    }
  });

  it("includes push probability for whole-number Asian lines", () => {
    const lines = computeAsianHandicapLines(buildMarginHistogram(matrixFor(1.4, 1.0)));
    const minusOne = lines.find((l) => l.line === -1)!;
    expect(minusOne.pushPct).toBeGreaterThan(0);
  });
});

describe("computeWinningMargins", () => {
  it("orders home then away for each margin level", () => {
    const margins = computeWinningMargins(buildMarginHistogram(matrixFor(1.2, 1.2)));
    expect(margins.map((m) => `${m.side}-${m.margin}`)).toEqual([
      "home-1",
      "away-1",
      "home-2",
      "away-2",
      "home-3",
      "away-3",
    ]);
  });
});

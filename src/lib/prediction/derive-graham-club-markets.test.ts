import { describe, expect, it } from "vitest";
import { deriveClubMarketsFromGraham } from "@/lib/prediction/derive-graham-club-markets";
import { computeMarketAnalytics } from "@/lib/prediction/market-probabilities";

describe("deriveClubMarketsFromGraham", () => {
  it("builds EH, goal ranges, team totals, and double chance", () => {
    const analytics = computeMarketAnalytics(1.6, 1.1, {
      h2hHomeWinRate: 0.45,
      h2hDrawRate: 0.25,
      h2hAwayWinRate: 0.3,
      h2hHasData: false,
      homeFormScore: 0.6,
      awayFormScore: 0.5,
      momentumIndex: 0,
      modelImpact: [],
      statComparison: [],
    });

    const derived = deriveClubMarketsFromGraham({
      homeWinPct: 48,
      drawPct: 26,
      awayWinPct: 26,
      homeXg: 1.6,
      awayXg: 1.1,
      rho: -0.05,
      analytics,
    });

    expect(derived.europeanHandicap.length).toBeGreaterThan(0);
    expect(derived.goalRanges.match.length).toBe(4);
    expect(derived.teamTotals.length).toBe(3);
    expect(derived.doubleChance.homeOrDraw).toBeCloseTo(0.74, 2);
    expect(derived.asianHandicap.some((l) => l.line === -0.5)).toBe(true);
  });
});

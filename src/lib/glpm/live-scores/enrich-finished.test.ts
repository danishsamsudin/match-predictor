import { describe, expect, it } from "vitest";
import { isCollapsedCardPrediction, matchPossessionShare } from "./enrich-finished";

describe("isCollapsedCardPrediction", () => {
  it("flags near-equal early-season snapshots", () => {
    expect(
      isCollapsedCardPrediction({
        homeWin: 0.37885,
        draw: 0.243027,
        awayWin: 0.378123,
        homeXg: 1.7935,
        awayXg: 1.7917,
        over25: 0.6946,
        bttsYes: 0.7063,
      })
    ).toBe(true);
  });

  it("keeps differentiated markets", () => {
    expect(
      isCollapsedCardPrediction({
        homeWin: 0.34,
        draw: 0.27,
        awayWin: 0.39,
        homeXg: 1.45,
        awayXg: 1.55,
        over25: 0.63,
        bttsYes: 0.66,
      })
    ).toBe(false);
  });
});

describe("matchPossessionShare", () => {
  it("rescales independent season averages so they sum to 100", () => {
    expect(matchPossessionShare(52, 64)).toEqual({ home: 45, away: 55 });
  });

  it("keeps a pair that already sums to 100", () => {
    expect(matchPossessionShare(53, 47)).toEqual({ home: 53, away: 47 });
  });

  it("splits even rates 50-50", () => {
    expect(matchPossessionShare(58, 58)).toEqual({ home: 50, away: 50 });
  });

  it("returns nulls when either side is missing", () => {
    expect(matchPossessionShare(52, null)).toEqual({ home: null, away: null });
    expect(matchPossessionShare(undefined, 64)).toEqual({ home: null, away: null });
  });
});

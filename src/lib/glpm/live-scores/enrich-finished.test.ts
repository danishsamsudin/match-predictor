import { describe, expect, it } from "vitest";
import { isCollapsedCardPrediction } from "./enrich-finished";

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

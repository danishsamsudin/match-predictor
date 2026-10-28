import { describe, expect, it } from "vitest";
import {
  fairProbFromDecimalOdds,
  mapGlpmMarketId,
  temper1x2Probs,
} from "@/lib/glpm/market-models";

describe("handicap market helpers", () => {
  it("maps EH and DC market ids", () => {
    expect(mapGlpmMarketId("european_handicap")).toBe("european_handicap");
    expect(mapGlpmMarketId("double_chance")).toBe("double_chance");
    expect(mapGlpmMarketId("asian_handicap")).toBe("asian_handicap");
  });

  it("tempers 1X2 probabilities with tau > 1", () => {
    const raw = { homeWin: 0.55, draw: 0.25, awayWin: 0.2 };
    const tempered = temper1x2Probs(raw.homeWin, raw.draw, raw.awayWin, 1.15);
    const sum = tempered.homeWin + tempered.draw + tempered.awayWin;
    expect(sum).toBeCloseTo(1, 5);
    expect(tempered.homeWin).toBeGreaterThan(0);
  });

  it("derives fair prob from decimal odds", () => {
    expect(fairProbFromDecimalOdds(2)).toBeCloseTo(0.5, 5);
    expect(fairProbFromDecimalOdds(null)).toBeNull();
    expect(fairProbFromDecimalOdds(1)).toBeNull();
  });
});

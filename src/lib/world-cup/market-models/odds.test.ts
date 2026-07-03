import { describe, expect, it } from "vitest";
import {
  europeanOddsToImpliedPct,
  impliedPctToEuropeanOdds,
  probabilityToEuropeanOdds,
} from "@/lib/world-cup/market-models/odds";

describe("probabilityToEuropeanOdds", () => {
  it("converts 50% to 2.00", () => {
    expect(probabilityToEuropeanOdds(0.5)).toBe(2);
  });

  it("converts low probability to high odds", () => {
    expect(probabilityToEuropeanOdds(0.1)).toBe(10);
  });

  it("round-trips with implied pct", () => {
    const odds = impliedPctToEuropeanOdds(42);
    expect(europeanOddsToImpliedPct(odds)).toBe(42);
  });
});

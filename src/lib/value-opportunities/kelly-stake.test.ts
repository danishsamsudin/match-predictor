import { describe, expect, it } from "vitest";
import type { ConfidenceLookup } from "@/lib/value-opportunities/confidence-layer";
import {
  fullKellyFraction,
  KELLY_MAX_STAKE_FRACTION,
  shrunkProbability,
  suggestKellyStake,
} from "@/lib/value-opportunities/kelly-stake";

function lookup(partial: Partial<ConfidenceLookup> = {}): ConfidenceLookup {
  return {
    marketKey: "btts:yes",
    tier: "strong",
    historicalHitRate: 0.72,
    n: 40,
    avgPred: 0.74,
    wilsonLow: 0.66,
    binLabel: "70-80",
    ...partial,
  };
}

describe("fullKellyFraction", () => {
  it("matches the binary Kelly formula", () => {
    const p = 0.55;
    const odds = 2.1;
    const b = odds - 1;
    expect(fullKellyFraction(p, odds)).toBeCloseTo((b * p - (1 - p)) / b, 8);
  });

  it("is zero or negative when there is no edge", () => {
    expect(fullKellyFraction(0.4, 2.0)).toBeLessThanOrEqual(0);
  });
});

describe("shrunkProbability", () => {
  it("caps Strong/Moderate p at the Wilson lower bound", () => {
    const p = shrunkProbability(0.78, lookup({ wilsonLow: 0.66, historicalHitRate: 0.8, n: 40 }));
    expect(p).toBeLessThanOrEqual(0.66);
  });

  it("blends toward the model when n is small", () => {
    const p = shrunkProbability(
      0.7,
      lookup({ tier: "weak", n: 8, historicalHitRate: 0.5, wilsonLow: 0.2 })
    );
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.7);
  });
});

describe("suggestKellyStake", () => {
  it("returns no stake for None", () => {
    const result = suggestKellyStake({
      modelProb: 0.75,
      decimalOdds: 1.5,
      confidence: lookup({ tier: "none", n: 0 }),
    });
    expect(result.fraction).toBe(0);
    expect(result.units).toBe(0);
  });

  it("sizes a Strong BTTS row below the 2.5% cap", () => {
    const result = suggestKellyStake({
      modelProb: 0.74,
      decimalOdds: 1.7,
      confidence: lookup(),
      bankroll: 100,
    });
    expect(result.fraction).toBeGreaterThan(0);
    expect(result.fraction).toBeLessThanOrEqual(KELLY_MAX_STAKE_FRACTION);
    expect(result.units).toBeCloseTo(result.fraction * 100, 8);
  });

  it("returns 0 when shrunk p has under 1pp of edge", () => {
    const result = suggestKellyStake({
      modelProb: 0.52,
      decimalOdds: 1.95,
      confidence: lookup({
        tier: "moderate",
        historicalHitRate: 0.51,
        wilsonLow: 0.48,
        n: 20,
        avgPred: 0.52,
      }),
    });
    expect(result.fraction).toBe(0);
    expect(result.minBookOdds).toBeGreaterThan(1.95);
  });

  it("sizes when book odds clear the historical breakeven", () => {
    const result = suggestKellyStake({
      modelProb: 0.66,
      decimalOdds: 3.1,
      confidence: lookup({
        tier: "weak",
        historicalHitRate: 0.4,
        wilsonLow: 0.28,
        n: 50,
        avgPred: 0.65,
      }),
      bankroll: 100,
    });
    expect(result.fraction).toBeGreaterThan(0);
    expect(result.pUsed).toBeLessThan(0.5);
  });
});

import { describe, expect, it } from "vitest";
import type { ConfidenceLookup } from "@/lib/nations-league/confidence-layer";
import type { KellyStakeResult } from "@/lib/nations-league/kelly-stake";
import { suggestValueAction } from "@/lib/nations-league/value-action";

function lookup(partial: Partial<ConfidenceLookup> = {}): ConfidenceLookup {
  return {
    marketKey: "btts:yes",
    tier: "moderate",
    historicalHitRate: 0.55,
    n: 40,
    avgPred: 0.6,
    wilsonLow: 0.48,
    binLabel: "55-65",
    ...partial,
  };
}

function kelly(partial: Partial<KellyStakeResult> = {}): KellyStakeResult {
  return {
    fullKelly: 0.1,
    fraction: 0.01,
    units: 1,
    pUsed: 0.5,
    edge: 0.05,
    minBookOdds: 2.05,
    reason: "test",
    ...partial,
  };
}

describe("suggestValueAction", () => {
  it("passes when book odds are missing", () => {
    const result = suggestValueAction({
      bookOdds: null,
      confidence: lookup(),
      modelEdgePct: null,
      histEdgePct: null,
    });
    expect(result.action).toBe("pass");
  });

  it("passes when confidence is none", () => {
    const result = suggestValueAction({
      bookOdds: 2.2,
      confidence: lookup({ tier: "none", n: 3, historicalHitRate: 0.3 }),
      kelly: kelly({ fraction: 0, units: 0 }),
      modelEdgePct: 5,
      histEdgePct: null,
    });
    expect(result.action).toBe("pass");
  });

  it("bets when moderate/strong history clears Kelly", () => {
    const result = suggestValueAction({
      bookOdds: 2.4,
      confidence: lookup({ tier: "strong" }),
      kelly: kelly({ fraction: 0.015, units: 1.5 }),
      modelEdgePct: 8,
      histEdgePct: 6,
    });
    expect(result.action).toBe("bet");
  });

  it("watches when weak history clears a small Kelly stake", () => {
    const result = suggestValueAction({
      bookOdds: 2.8,
      confidence: lookup({ tier: "weak", historicalHitRate: 0.4, n: 60 }),
      kelly: kelly({ fraction: 0.004, units: 0.4 }),
      modelEdgePct: 10,
      histEdgePct: 5,
    });
    expect(result.action).toBe("watch");
  });

  it("watches when model likes a price history rejects", () => {
    const result = suggestValueAction({
      bookOdds: 2.0,
      confidence: lookup({ tier: "weak" }),
      kelly: kelly({ fraction: 0, units: 0, edge: -0.05 }),
      modelEdgePct: 8,
      histEdgePct: -4,
    });
    expect(result.action).toBe("watch");
  });

  it("passes when neither history nor model supports the price", () => {
    const result = suggestValueAction({
      bookOdds: 1.7,
      confidence: lookup({ tier: "weak" }),
      kelly: kelly({ fraction: 0, units: 0, minBookOdds: 2.6 }),
      modelEdgePct: -5,
      histEdgePct: -12,
    });
    expect(result.action).toBe("pass");
    expect(result.reason).toMatch(/2\.60/);
  });
});

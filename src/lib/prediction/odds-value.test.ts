import { describe, expect, it } from "vitest";
import { computeFairImplied, computeValueEdges } from "./odds-value";

describe("odds-value", () => {
  it("MPTO removes overround on typical prices", () => {
    const fair = computeFairImplied({ home: 2.1, draw: 3.4, away: 3.6 });
    expect(fair.method).toBe("mpto");
    expect(fair.homePct + fair.drawPct + fair.awayPct).toBeCloseTo(100, 1);
    expect(fair.totalRawImpliedPct).toBeGreaterThan(100);
  });

  it("falls back when implied total <= 100 (arbitrage)", () => {
    const fair = computeFairImplied({ home: 3, draw: 3, away: 3 });
    expect(fair.method).toBe("raw");
    expect(fair.warning).toBeTruthy();
  });

  it("handles invalid zero odds without throwing", () => {
    const fair = computeFairImplied({ home: 0, draw: 3.4, away: 3.6 });
    expect(fair.method).toBe("invalid");
  });

  it("computes value edge vs model", () => {
    const edges = computeValueEdges(
      { homeWinPct: 55, drawPct: 25, awayWinPct: 20 },
      { home: 2, draw: 3.5, away: 4 }
    );
    expect(Number.isFinite(edges.homeEdgePct)).toBe(true);
    expect(Number.isFinite(edges.fair.homePct)).toBe(true);
  });
});

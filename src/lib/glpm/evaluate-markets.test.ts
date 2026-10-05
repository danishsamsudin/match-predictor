import { describe, expect, it } from "vitest";
import {
  asianHomeCovered,
  evaluateGlpmMarketsForMatch,
  shotMarketsFromBreakdown,
} from "@/lib/glpm/evaluate-markets";
import { extractMarketConfidenceRows } from "@/lib/value-opportunities/extract-confidence-eval-rows";

function tinyMatrix(): number[][] {
  // P(1-0)=0.4, P(0-0)=0.2, P(0-1)=0.2, P(1-1)=0.2
  const m = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));
  m[1][0] = 0.4;
  m[0][0] = 0.2;
  m[0][1] = 0.2;
  m[1][1] = 0.2;
  return m;
}

describe("asianHomeCovered", () => {
  it("treats AH -0.5 as home win", () => {
    expect(asianHomeCovered(2, 1, -0.5)).toBe(true);
    expect(asianHomeCovered(1, 1, -0.5)).toBe(false);
    expect(asianHomeCovered(0, 1, -0.5)).toBe(false);
  });
});

describe("evaluateGlpmMarketsForMatch", () => {
  it("emits extract-compatible rows including AH and shots", () => {
    const rows = evaluateGlpmMarketsForMatch({
      matchSmId: 1,
      leagueSmId: 8,
      matchDate: "2026-10-01",
      modelVersion: "glpm_cx_v1",
      homeWin: 0.45,
      draw: 0.25,
      awayWin: 0.3,
      bttsYes: 0.55,
      bttsNo: 0.45,
      overUnder: { "2.5": { over: 0.48, under: 0.52 } },
      scoreMatrix: tinyMatrix(),
      actualHome: 2,
      actualAway: 1,
      actualTotalShots: 24,
      actualTotalSot: 9,
      shotMarkets: {
        totalShots: 23,
        totalSot: 8.5,
        shotsOverUnder: [
          { line: 22.5, over: 0.55, under: 0.45 },
          { line: 24.5, over: 0.4, under: 0.6 },
        ],
        sotOver: [{ line: 8.5, over: 0.51 }],
      },
    });

    expect(rows.some((r) => r.marketId === "win_probability")).toBe(true);
    expect(rows.some((r) => r.marketId === "asian_handicap" && r.marketKey === "home_-0.5")).toBe(
      true
    );
    expect(rows.some((r) => r.marketId === "shots_ou" && r.marketKey === "over_22.5")).toBe(true);
    expect(rows.some((r) => r.marketId === "sot_over" && r.marketKey === "8.5")).toBe(true);
    expect(rows.some((r) => r.marketId === "double_chance")).toBe(true);
    expect(rows.some((r) => r.marketId === "team_total")).toBe(true);

    const confidence = extractMarketConfidenceRows(
      rows.map((r) => ({
        market_id: r.marketId,
        market_key: r.marketKey,
        predicted: r.predicted,
        actual: r.actual,
        match_date: r.matchDate,
      }))
    );
    expect(confidence.some((c) => c.marketKey === "win_probability:home")).toBe(true);
    expect(confidence.some((c) => c.marketKey === "asian_handicap:home_-0.5")).toBe(true);
    expect(confidence.some((c) => c.marketKey === "shots_ou:over_22.5")).toBe(true);
    expect(confidence.some((c) => c.marketKey === "sot_over:8.5")).toBe(true);
  });
});

describe("shotMarketsFromBreakdown", () => {
  it("reads locked shotMarkets from breakdown jsonb", () => {
    const locked = shotMarketsFromBreakdown({
      shotMarkets: {
        totalShots: 22,
        totalSot: 8,
        shotsOverUnder: [{ line: 20.5, over: 0.6, under: 0.4 }],
        sotOver: [{ line: 8.5, over: 0.5 }],
      },
    });
    expect(locked?.shotsOverUnder[0]?.line).toBe(20.5);
  });
});

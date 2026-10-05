import { describe, expect, it } from "vitest";
import {
  extractMarketConfidenceRows,
  extractPlayerPropConfidenceRows,
} from "@/lib/nations-league/extract-confidence-eval-rows";

describe("extractMarketConfidenceRows", () => {
  it("expands 1X2, BTTS, and O/U into binary keys", () => {
    const rows = extractMarketConfidenceRows([
      {
        market_id: "win_probability",
        predicted: { home: 0.5, draw: 0.25, away: 0.25 },
        actual: { outcome: "home" },
        match_date: "2026-09-24",
      },
      {
        market_id: "btts",
        predicted: { yesPct: 62 },
        actual: { yes: true },
      },
      {
        market_id: "goals_over_under",
        market_key: "2.5",
        predicted: { line: 2.5, overPct: 48 },
        actual: { over: false },
      },
      {
        market_id: "double_chance",
        market_key: "1x",
        predicted: { prob: 0.72 },
        actual: { hit: true },
      },
    ]);
    expect(rows.find((r) => r.marketKey === "win_probability:home")?.hit).toBe(true);
    expect(rows.find((r) => r.marketKey === "btts:yes")?.predictedProb).toBeCloseTo(0.62);
    expect(rows.find((r) => r.marketKey === "goals_over_under:under_2.5")?.hit).toBe(true);
    expect(rows.find((r) => r.marketKey === "double_chance:1x")?.hit).toBe(true);
  });
});

describe("extractPlayerPropConfidenceRows", () => {
  it("prefixes player prop markets", () => {
    const rows = extractPlayerPropConfidenceRows([
      { market: "anytime_scorer", predicted_prob: 0.18, hit: false, match_date: "2026-09-24" },
    ]);
    expect(rows[0]?.marketKey).toBe("player_prop:anytime_scorer");
    expect(rows[0]?.hit).toBe(false);
  });
});

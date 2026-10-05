import { describe, expect, it } from "vitest";
import {
  evaluateDerivedMarketsForMatch,
  settleDerivedMarketHits,
} from "@/lib/nations-league/evaluate-derived-markets";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";

describe("settleDerivedMarketHits", () => {
  it("settles a 2-1 home win across DC, ranges, EH, and team totals", () => {
    const s = settleDerivedMarketHits(2, 1);
    expect(s.doubleChance["1x"]).toBe(true);
    expect(s.doubleChance["12"]).toBe(true);
    expect(s.doubleChance.x2).toBe(false);
    expect(s.matchRange.find((b) => b.label === "2-3")?.hit).toBe(true);
    expect(s.matchRange.find((b) => b.label === "0-1")?.hit).toBe(false);
    expect(s.homeRange.find((b) => b.label === "1-2")?.hit).toBe(true);
    expect(s.europeanHandicap.find((e) => e.line === -1)?.side).toBe("draw");
    expect(s.europeanHandicap.find((e) => e.line === 1)?.side).toBe("home");
    expect(s.teamTotals.find((t) => t.line === 1.5)?.homeOver).toBe(true);
    expect(s.teamTotals.find((t) => t.line === 1.5)?.awayUnder).toBe(true);
  });
});

describe("evaluateDerivedMarketsForMatch", () => {
  it("emits binary rows with probabilities from the locked snapshot grid", () => {
    const pred: HubPredictionRow = {
      home_win_pct: 0.48,
      draw_pct: 0.26,
      away_win_pct: 0.26,
      predicted_score_home: 1,
      predicted_score_away: 1,
      under_2_5_pct: 0.52,
      over_2_5_pct: 0.48,
      model_version: "test",
      snapshot: { home_xg: 1.4, away_xg: 1.1, rho: -0.08 },
    };
    const rows = evaluateDerivedMarketsForMatch({
      pred,
      actualHome: 2,
      actualAway: 1,
      modelVersion: "test",
    });
    const dc1x = rows.find((r) => r.marketId === "double_chance" && r.marketKey === "1x");
    expect(dc1x?.actual.hit).toBe(true);
    expect(dc1x?.predicted.prob).toBeGreaterThan(0.4);
    expect(rows.some((r) => r.marketId === "goal_range_match" && r.marketKey === "2-3")).toBe(
      true
    );
    expect(rows.some((r) => r.marketId === "european_handicap")).toBe(true);
    expect(rows.some((r) => r.marketId === "team_total" && r.marketKey === "home_over_1.5")).toBe(
      true
    );
  });
});

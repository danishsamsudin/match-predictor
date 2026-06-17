import { describe, expect, it } from "vitest";
import { swapHubCardPrediction, type HubCardPrediction } from "@/lib/world-cup/hub-prediction";

const sample: HubCardPrediction = {
  home_win_pct: 0.34,
  draw_pct: 0.29,
  away_win_pct: 0.37,
  fair_odds_home: 2.94,
  fair_odds_draw: 3.45,
  fair_odds_away: 2.7,
  under_2_5_pct: 0.42,
  over_2_5_pct: 0.58,
  predicted_score_home: 1,
  predicted_score_away: 2,
  snapshot: { lambda: 1.1, mu: 1.8, home_xg: 1.1, away_xg: 1.8 },
  computed_at: "2026-06-01T00:00:00Z",
  locked: false,
};

describe("swapHubCardPrediction", () => {
  it("mirrors home/away outcome and score fields", () => {
    const swapped = swapHubCardPrediction(sample);
    expect(swapped.home_win_pct).toBe(0.37);
    expect(swapped.away_win_pct).toBe(0.34);
    expect(swapped.draw_pct).toBe(0.29);
    expect(swapped.predicted_score_home).toBe(2);
    expect(swapped.predicted_score_away).toBe(1);
    expect(swapped.fair_odds_home).toBe(2.7);
    expect(swapped.fair_odds_away).toBe(2.94);
  });

  it("mirrors xG fields in snapshot", () => {
    const swapped = swapHubCardPrediction(sample);
    expect(swapped.snapshot.lambda).toBe(1.8);
    expect(swapped.snapshot.mu).toBe(1.1);
    expect(swapped.snapshot.home_xg).toBe(1.8);
    expect(swapped.snapshot.away_xg).toBe(1.1);
  });
});

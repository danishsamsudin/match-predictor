import { describe, expect, it } from "vitest";
import { grahamHubRowToPredictionResult } from "@/lib/world-cup/graham-prediction-adapter";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";

const samplePred: HubPredictionRow = {
  home_win_pct: 0.816,
  draw_pct: 0.128,
  away_win_pct: 0.056,
  predicted_score_home: 0,
  predicted_score_away: 2,
  under_2_5_pct: 0.174,
  over_2_5_pct: 0.826,
  model_version: "wc-graham-v1.0",
  snapshot: {
    home_xg: 2.65,
    away_xg: 0.55,
    rho: -0.12,
    scenario: "standard",
  },
};

describe("grahamHubRowToPredictionResult", () => {
  it("builds analytics with BTTS and handicaps", () => {
    const result = grahamHubRowToPredictionResult({
      pred: samplePred,
      homeName: "Mexico",
      awayName: "South Africa",
    });

    expect(result.homeWinPct).toBeCloseTo(81.6, 0);
    expect(result.analytics?.btts.yesPct).toBeGreaterThan(0);
    expect(result.analytics?.btts.noPct).toBeGreaterThan(0);
    expect(result.analytics?.overUnder.length).toBeGreaterThan(0);
    expect(result.analytics?.handicapMarkets.asianHandicap.length).toBeGreaterThan(0);
    expect(result.analytics?.topScores.length).toBeGreaterThan(0);
  });
});

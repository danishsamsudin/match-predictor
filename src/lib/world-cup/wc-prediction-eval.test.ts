import { describe, expect, it } from "vitest";
import { evaluateHubPredictionAgainstResult } from "@/lib/world-cup/wc-prediction-eval";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";

const mexicoPred: HubPredictionRow = {
  home_win_pct: 0.816,
  draw_pct: 0.128,
  away_win_pct: 0.056,
  predicted_score_home: 0,
  predicted_score_away: 2,
  under_2_5_pct: 0.174,
  over_2_5_pct: 0.826,
  model_version: "wc-graham-v1.0",
  snapshot: { home_xg: 2.65, away_xg: 0.55, rho: -0.12, scenario: "standard" },
};

describe("evaluateHubPredictionAgainstResult", () => {
  it("scores Mexico 2-0 correctly on 1X2", () => {
    const scores = evaluateHubPredictionAgainstResult(mexicoPred, 2, 0);
    expect(scores.brier1x2).toBeLessThan(0.2);
    expect(scores.brierOver25).toBeLessThan(0.5);
  });
});

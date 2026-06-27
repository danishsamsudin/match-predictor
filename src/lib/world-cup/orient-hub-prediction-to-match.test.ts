import { describe, expect, it } from "vitest";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import {
  formatPredictedScoreline,
  hubPredictionNeedsHomeAwaySwap,
  orientHubPredictionToMatch,
} from "@/lib/world-cup/orient-hub-prediction-to-match";

function predRow(
  homeApiId: number,
  awayApiId: number,
  overrides: Partial<HubPredictionRow> = {}
): HubPredictionRow {
  return {
    home_win_pct: 0.78,
    draw_pct: 0.15,
    away_win_pct: 0.07,
    predicted_score_home: 2,
    predicted_score_away: 1,
    under_2_5_pct: 0.4,
    over_2_5_pct: 0.6,
    model_version: "wc-graham-v1",
    snapshot: {
      home_team_api_id: homeApiId,
      away_team_api_id: awayApiId,
      lambda: 2.1,
      mu: 1.0,
      home_xg: 2.1,
      away_xg: 1.0,
    },
    ...overrides,
  };
}

describe("orientHubPredictionToMatch", () => {
  it("swaps when locked prediction home differs from official fixture home", () => {
    const pred = predRow(4705, 4729);
    const needsSwap = hubPredictionNeedsHomeAwaySwap(
      pred,
      "tunisia-db",
      "netherlands-db",
      "Tunisia",
      "Netherlands"
    );
    expect(needsSwap).toBe(true);

    const oriented = orientHubPredictionToMatch(
      pred,
      "tunisia-db",
      "netherlands-db",
      "Tunisia",
      "Netherlands"
    );
    expect(oriented.home_win_pct).toBe(0.07);
    expect(oriented.away_win_pct).toBe(0.78);
    expect(oriented.predicted_score_home).toBe(1);
    expect(oriented.predicted_score_away).toBe(2);
  });

  it("leaves aligned predictions unchanged", () => {
    const pred = predRow(4705, 4729);
    const oriented = orientHubPredictionToMatch(
      pred,
      "netherlands-db",
      "tunisia-db",
      "Netherlands",
      "Tunisia"
    );
    expect(oriented).toBe(pred);
  });
});

describe("formatPredictedScoreline", () => {
  it("renders whole-number scorelines without decimals", () => {
    expect(formatPredictedScoreline(1, 1)).toBe("1-1");
    expect(formatPredictedScoreline(2.0, 1.0)).toBe("2-1");
  });
});

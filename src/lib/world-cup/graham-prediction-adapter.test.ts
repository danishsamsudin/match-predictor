import { describe, expect, it } from "vitest";
import {
  buildAnalyticsFromHubPrediction,
  grahamHubRowToPredictionResult,
} from "@/lib/world-cup/graham-prediction-adapter";
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
      estimated: {
        corners: 9.4,
        fouls: 24.1,
        yellowCards: 3.2,
        redCards: 0.1,
      },
    });

    expect(result.homeWinPct).toBeCloseTo(81.6, 0);
    expect(result.analytics?.btts.yesPct).toBeGreaterThan(0);
    expect(result.analytics?.btts.noPct).toBeGreaterThan(0);
    expect(result.analytics?.overUnder.length).toBeGreaterThan(0);
    expect(result.analytics?.handicapMarkets.asianHandicap.length).toBeGreaterThan(0);
    expect(result.analytics?.topScores.length).toBeGreaterThan(0);
    expect(result.estimated.corners).toBeGreaterThan(0);
    expect(result.estimated.fouls).toBeGreaterThan(0);
  });

  it("uses model 1X2 in Form & momentum when H2H history is empty", () => {
    const analytics = buildAnalyticsFromHubPrediction(
      samplePred,
      "Brazil",
      "Norway",
      {
        homeFormScore: 0.78,
        awayFormScore: 0.592,
        h2hHomeWinRate: 1 / 3,
        h2hDrawRate: 1 / 3,
        h2hAwayWinRate: 1 / 3,
        h2hHasData: false,
        statComparison: [],
        teamComparison: {
          home: {} as never,
          away: {} as never,
          usesDatabaseStats: false,
          fixtureContext: null,
        },
      }
    );

    expect(analytics.h2h.homeWinPct).toBeCloseTo(81.6, 0);
    expect(analytics.h2h.drawPct).toBeCloseTo(12.8, 0);
    expect(analytics.h2h.awayWinPct).toBeCloseTo(5.6, 0);
    expect(analytics.h2h.homeWinPct).not.toBeCloseTo(33.3, 0);
    expect(analytics.h2h.hasData).toBe(false);
  });

  it("exposes per-factor model impact rows for Graham hub snapshots", () => {
    const analytics = buildAnalyticsFromHubPrediction(
      {
        ...samplePred,
        snapshot: {
          ...samplePred.snapshot,
          gamma_home: 1.007,
          gamma_away: 0.971,
          host_nation_boost: 1.05,
          delta_final_away: 0.96,
          weather_away_xg_mult: 0.92,
        },
      },
      "Mexico",
      "England"
    );

    expect(analytics.modelImpact.map((r) => r.label)).toEqual([
      "Altitude acclimation",
      "Host nation",
      "Travel & jet lag",
      "Weather",
      "Lineup",
    ]);
    expect(analytics.modelImpact[1].homeMultiplier).toBe(1.05);
  });
});

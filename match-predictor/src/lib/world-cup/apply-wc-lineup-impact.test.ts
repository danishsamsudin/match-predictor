import { describe, expect, it } from "vitest";
import { applyLineupImpactToHubPrediction } from "./apply-wc-lineup-impact";
import type { HubPredictionRow } from "./hub-main-predict";

function sampleHubRow(overrides?: Partial<HubPredictionRow>): HubPredictionRow {
  return {
    home_win_pct: 0.55,
    draw_pct: 0.25,
    away_win_pct: 0.2,
    predicted_score_home: 2,
    predicted_score_away: 1,
    under_2_5_pct: 0.4,
    over_2_5_pct: 0.6,
    model_version: "graham-wc-test",
    snapshot: {
      home_xg: 1.8,
      away_xg: 1.1,
      lambda: 1.8,
      mu: 1.1,
      rho: -0.08,
      scenario: "open",
    },
    ...overrides,
  };
}

describe("applyLineupImpactToHubPrediction", () => {
  it("shifts win probabilities when home attack multiplier increases", () => {
    const base = sampleHubRow();
    const adjusted = applyLineupImpactToHubPrediction(base, {
      homeXgMultiplier: 1.12,
      awayXgMultiplier: 1,
      homeDefenseMultiplier: 1,
      awayDefenseMultiplier: 1,
      notes: [],
    });

    expect(adjusted.snapshot.home_xg).toBeGreaterThan(base.snapshot.home_xg as number);
    expect(adjusted.home_win_pct).toBeGreaterThan(base.home_win_pct);
    expect(adjusted.snapshot.base_home_xg).toBe(1.8);
  });

  it("boosts away win chance when home defense is weak", () => {
    const base = sampleHubRow();
    const adjusted = applyLineupImpactToHubPrediction(base, {
      homeXgMultiplier: 1,
      awayXgMultiplier: 1,
      homeDefenseMultiplier: 1.15,
      awayDefenseMultiplier: 1,
      notes: [],
    });

    expect(adjusted.snapshot.away_xg).toBeGreaterThan(base.snapshot.away_xg as number);
    expect(adjusted.away_win_pct).toBeGreaterThan(base.away_win_pct);
  });

  it("leaves xG unchanged when multipliers are neutral", () => {
    const base = sampleHubRow();
    const adjusted = applyLineupImpactToHubPrediction(base, {
      homeXgMultiplier: 1,
      awayXgMultiplier: 1,
      homeDefenseMultiplier: 1,
      awayDefenseMultiplier: 1,
      notes: [],
    });

    expect(adjusted.snapshot.home_xg).toBe(base.snapshot.home_xg);
    expect(adjusted.snapshot.away_xg).toBe(base.snapshot.away_xg);
  });
});

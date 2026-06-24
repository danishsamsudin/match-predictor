import { describe, expect, it } from "vitest";
import {
  blendDeltaWeights,
  blendScalar,
  calibrationGridImproved,
  mlHoldoutImprovementThreshold,
  rampFeatureWeights,
} from "@/lib/world-cup/incremental-calibration";

const deployed = {
  xgElo: 0.4,
  talent: 0.2,
  tournament: 0.15,
  recentXgForm: 0.1,
  fifa: 0.1,
  momentum: 0.05,
};

describe("incremental-calibration", () => {
  it("blends delta weights partially toward target", () => {
    const target = {
      xgElo: 0.2,
      talent: 0.0,
      tournament: 0.3,
      recentXgForm: 0.2,
      fifa: 0.2,
      momentum: 0.1,
    };
    const blended = blendDeltaWeights(deployed, target, 0.08);
    const sum = Object.values(blended).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(blended.xgElo).toBeGreaterThan(0.2);
    expect(blended.xgElo).toBeLessThan(deployed.xgElo);
  });

  it("caps scalar moves per step", () => {
    expect(blendScalar(1.3, 1.5, 0.05)).toBeCloseTo(1.365, 3);
    expect(blendScalar(1.3, 2.0, 0.05)).toBeCloseTo(1.365, 3);
  });

  it("ramps process weights from zero in small absolute steps", () => {
    const next = rampFeatureWeights({}, { box_xg_share_diff: -0.17 }, 0.025);
    expect(next.box_xg_share_diff).toBeCloseTo(-0.025, 5);
  });

  it("uses adaptive holdout threshold", () => {
    expect(mlHoldoutImprovementThreshold(8)).toBeCloseTo(0.004, 3);
    expect(mlHoldoutImprovementThreshold(32)).toBeLessThan(0.004);
  });

  it("allows strict calibration grid improvement", () => {
    expect(calibrationGridImproved(0.4098, 0.4116)).toBe(true);
    expect(calibrationGridImproved(0.4116, 0.4116)).toBe(false);
  });

  it("wc form and lineup scalar keys have defaults for grid expansion", async () => {
    const { getDefaultWcCalibrationConstants } = await import(
      "@/lib/world-cup/wc-calibration-config"
    );
    const defaults = getDefaultWcCalibrationConstants();
    for (const key of [
      "wcAttackFormWeight",
      "wcDefenseFormWeight",
      "wcFinishingRegressionWeight",
      "wcLineupAttackBlend",
      "wcLineupDefenseBlend",
      "wcLowEventRhoBoost",
    ] as const) {
      expect(defaults[key]).toBeGreaterThan(0);
    }
  });
});

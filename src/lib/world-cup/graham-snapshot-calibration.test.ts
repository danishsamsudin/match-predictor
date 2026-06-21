import { describe, expect, it } from "vitest";
import {
  avgCompositeLossForSnapshots,
  recomputeXgFromSnapshot,
} from "@/lib/world-cup/graham-snapshot-calibration";
import { getDefaultWcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

describe("graham-snapshot-calibration", () => {
  const snapshot = {
    delta_xg_elo: 80,
    delta_talent: 0.1,
    delta_tournament: 40,
    delta_recent_form: 0.2,
    delta_fifa: 50,
    momentum_index: 0.1,
    gamma_home: 1,
    gamma_away: 1,
    delta_final_home: 1,
    delta_final_away: 1,
    sigma_home: 1,
    sigma_away: 1,
    host_nation_boost: 1,
    rho: 0,
    scenario: "",
  };

  it("recomputes xG from snapshot deltas", () => {
    const cal = getDefaultWcCalibrationConstants();
    const { homeXg, awayXg } = recomputeXgFromSnapshot(snapshot, cal);
    expect(homeXg).toBeGreaterThan(awayXg);
    expect(homeXg).toBeGreaterThan(1);
  });

  it("changes xG when delta weights shift", () => {
    const base = getDefaultWcCalibrationConstants();
    const tuned = {
      ...base,
      deltaWeights: {
        ...base.deltaWeights,
        xgElo: 0.55,
        talent: 0.15,
        tournament: 0.1,
        recentXgForm: 0.1,
        fifa: 0.05,
        momentum: 0.05,
      },
    };
    const baseXg = recomputeXgFromSnapshot(snapshot, base).homeXg;
    const tunedXg = recomputeXgFromSnapshot(snapshot, tuned).homeXg;
    expect(tunedXg).not.toBe(baseXg);
  });

  it("evaluates composite loss for snapshots", () => {
    const cal = getDefaultWcCalibrationConstants();
    const loss = avgCompositeLossForSnapshots(
      [{ snapshot, actualHome: 2, actualAway: 1 }],
      cal,
      cal.modelVersion
    );
    expect(loss).toBeGreaterThan(0);
    expect(Number.isFinite(loss)).toBe(true);
  });

  it("applies process feature weights from snapshot", () => {
    const cal = getDefaultWcCalibrationConstants();
    const withProcess = {
      ...snapshot,
      process_features: {
        chance_quality_diff: 0.35,
        finishing_skill_diff: 0.4,
      },
    };
    const tuned = {
      ...cal,
      processFeatureWeights: {
        chance_quality_diff: 8,
        finishing_skill_diff: 6,
      },
    };
    const baseXg = recomputeXgFromSnapshot(withProcess, cal).homeXg;
    const tunedXg = recomputeXgFromSnapshot(withProcess, tuned).homeXg;
    expect(tunedXg).not.toBe(baseXg);
  });
});

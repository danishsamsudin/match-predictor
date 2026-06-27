import { describe, expect, it } from "vitest";
import { getDefaultWcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import { recomputeXgFromSnapshot } from "@/lib/world-cup/graham-snapshot-calibration";
import { swapSnapshotHomeAway } from "@/lib/world-cup/swap-hub-prediction-orientation";

describe("swapSnapshotHomeAway", () => {
  it("negates signed deltas and swaps team ids", () => {
    const snapshot = {
      home_team_api_id: 4705,
      away_team_api_id: 4729,
      delta_xg_elo: 120,
      delta_talent: 0.05,
      momentum_index: 0.3,
      home_xg: 2.1,
      away_xg: 1.0,
      opta_features: { rotation_index_diff: 0.4, chance_index_diff: 0.2 },
      process_features: { pressing_intensity_diff: -0.1 },
    };

    const swapped = swapSnapshotHomeAway(snapshot);
    expect(swapped.home_team_api_id).toBe(4729);
    expect(swapped.away_team_api_id).toBe(4705);
    expect(swapped.delta_xg_elo).toBe(-120);
    expect(swapped.momentum_index).toBe(-0.3);
    expect(swapped.home_xg).toBe(1.0);
    expect(swapped.away_xg).toBe(2.1);
    expect((swapped.opta_features as Record<string, number>).rotation_index_diff).toBe(-0.4);
    expect((swapped.process_features as Record<string, number>).pressing_intensity_diff).toBe(0.1);
  });

  it("recompute xG is stable after orientation swap", () => {
    const cal = getDefaultWcCalibrationConstants();
    const snapshot = {
      home_team_api_id: 1,
      away_team_api_id: 2,
      delta_xg_elo: 80,
      delta_talent: 0.02,
      delta_tournament: 10,
      delta_recent_form: 0.05,
      delta_fifa: 20,
      momentum_index: 0.15,
      gamma_home: 1,
      gamma_away: 0.98,
      delta_final_home: 0.99,
      delta_final_away: 1,
      sigma_home: 1,
      sigma_away: 0.94,
      host_nation_boost: 1.04,
      finishing_regression_home: 0.01,
      finishing_regression_away: -0.02,
      wc_form_home_matches: 2,
      wc_form_away_matches: 2,
      home_avg_chance_index: 1.6,
      away_avg_chance_index: 1.3,
      rho: -0.08,
    };

    const before = recomputeXgFromSnapshot(snapshot, cal);
    const swapped = swapSnapshotHomeAway({
      ...snapshot,
      home_xg: before.homeXg,
      away_xg: before.awayXg,
    });
    const after = recomputeXgFromSnapshot(swapped, cal);

    expect(Math.abs(after.homeXg - before.awayXg)).toBeLessThan(0.15);
    expect(Math.abs(after.awayXg - before.homeXg)).toBeLessThan(0.15);
  });
});

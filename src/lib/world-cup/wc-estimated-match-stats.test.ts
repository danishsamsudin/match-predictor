import { describe, expect, it } from "vitest";
import { computeWcEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import {
  loadWcOptaEventCalibration,
  clearWcOptaEventCalibrationCache,
} from "@/lib/world-cup/wc-opta-event-calibration";

describe("loadWcOptaEventCalibration", () => {
  it("loads tournament samples from Opta HTML fixtures and data folder", () => {
    clearWcOptaEventCalibrationCache();
    const calibration = loadWcOptaEventCalibration({ refresh: true });
    expect(calibration.sampleCount).toBeGreaterThanOrEqual(2);
    expect(calibration.avgCornersPerMatch).toBeGreaterThan(3);
    expect(calibration.avgYellowPerMatch).toBeGreaterThan(1);
    expect(calibration.avgFoulsPerMatch).toBeGreaterThan(15);
    expect(calibration.teamRates.size).toBeGreaterThan(0);
  });

  it("loads team style profiles from full Opta widgets", () => {
    clearWcOptaEventCalibrationCache();
    const calibration = loadWcOptaEventCalibration({ refresh: true });
    expect(calibration.teamStyles.size).toBeGreaterThan(0);
    const usaStyle = [...calibration.teamStyles.values()].find(
      (s) => s.foulsPerGame >= 12
    );
    expect(usaStyle?.physicalityIndex).toBeGreaterThan(0.7);
    expect(usaStyle?.widePlayIndex).toBeGreaterThan(0.7);
  });
});

describe("computeWcEstimatedMatchStats", () => {
  it("returns non-zero corners, fouls, and cards for a WC fixture", () => {
    const stats = computeWcEstimatedMatchStats({
      homeTeamApiId: 4778,
      awayTeamApiId: 4748,
      homeName: "Morocco",
      awayName: "Brazil",
      homeDbTeamId: "morocco-db",
      awayDbTeamId: "brazil-db",
      homeXg: 0.98,
      awayXg: 1.3,
      finishedMatches: [],
    });

    expect(stats.corners).toBeGreaterThan(4);
    expect(stats.fouls).toBeGreaterThan(16);
    expect(stats.yellowCards).toBeGreaterThan(1.5);
    expect(stats.redCards).toBeGreaterThan(0.04);
  });

  it("differentiates high-xG and low-xG matchups", () => {
    const lowXg = computeWcEstimatedMatchStats({
      homeTeamApiId: 4781,
      awayTeamApiId: 4736,
      homeName: "Mexico",
      awayName: "South Africa",
      homeDbTeamId: "mexico-db",
      awayDbTeamId: "sa-db",
      homeXg: 0.9,
      awayXg: 0.7,
      finishedMatches: [],
    });
    const highXg = computeWcEstimatedMatchStats({
      homeTeamApiId: 4781,
      awayTeamApiId: 4736,
      homeName: "Mexico",
      awayName: "South Africa",
      homeDbTeamId: "mexico-db",
      awayDbTeamId: "sa-db",
      homeXg: 2.4,
      awayXg: 1.8,
      finishedMatches: [],
    });

    expect(highXg.corners).toBeGreaterThan(lowXg.corners);
    expect(highXg.yellowCards).toBeGreaterThanOrEqual(lowXg.yellowCards);
  });

  it("incorporates observed WC tournament rates for teams with Opta samples", () => {
    const calibration = loadWcOptaEventCalibration({ refresh: true });
    const mexicoRates = calibration.teamRates.get(4781);
    expect(mexicoRates).toBeDefined();

    const withObserved = computeWcEstimatedMatchStats({
      homeTeamApiId: 4781,
      awayTeamApiId: 4736,
      homeName: "Mexico",
      awayName: "South Africa",
      homeDbTeamId: "mexico-db",
      awayDbTeamId: "sa-db",
      homeXg: 1.46,
      awayXg: 0.07,
      finishedMatches: [],
    });

    expect(withObserved.corners).toBeGreaterThan(3);
    expect(withObserved.fouls).toBeGreaterThan(16);
  });
});

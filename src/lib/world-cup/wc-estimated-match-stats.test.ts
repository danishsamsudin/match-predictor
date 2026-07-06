import { describe, expect, it } from "vitest";
import { computeWcEstimatedMatchStats, clampEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import {
  getDefaultWcCalibrationConstants,
  mergeCalibrationFromRecord,
  normalizeEventCoeffs,
} from "@/lib/world-cup/wc-calibration-config";
import {
  loadWcOptaEventCalibration,
  clearWcOptaEventCalibrationCache,
} from "@/lib/world-cup/wc-opta-event-calibration";

describe("loadWcOptaEventCalibration", () => {
  it("loads tournament samples from committed Opta HTML fixtures", () => {
    clearWcOptaEventCalibrationCache();
    const calibration = loadWcOptaEventCalibration({ refresh: true });
    expect(calibration.sampleCount).toBeGreaterThanOrEqual(1);
    expect(calibration.avgCornersPerMatch).toBeGreaterThan(3);
    expect(calibration.avgYellowPerMatch).toBeGreaterThan(0);
    expect(calibration.avgFoulsPerMatch).toBeGreaterThan(0);
    expect(calibration.teamRates.size).toBeGreaterThan(0);
  });

  it("loads team style profiles from full Opta widgets", () => {
    clearWcOptaEventCalibrationCache();
    const calibration = loadWcOptaEventCalibration({ refresh: true });
    expect(calibration.teamStyles.size).toBeGreaterThan(0);
    const physicalTeam = [...calibration.teamStyles.values()].find(
      (s) => s.foulsPerGame >= 12
    );
    expect(physicalTeam?.physicalityIndex).toBeGreaterThan(0.7);
    expect(physicalTeam?.widePlayIndex).toBeGreaterThan(0.7);
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

  it("keeps ML-calibrated estimates within realistic bounds", () => {
    const calibration = getDefaultWcCalibrationConstants();
    const stats = computeWcEstimatedMatchStats({
      homeTeamApiId: 4778,
      awayTeamApiId: 4748,
      homeName: "Morocco",
      awayName: "Brazil",
      homeDbTeamId: "morocco-db",
      awayDbTeamId: "brazil-db",
      homeXg: 1.4,
      awayXg: 1.6,
      finishedMatches: [],
      calibration,
    });

    expect(stats.corners).toBeGreaterThanOrEqual(4);
    expect(stats.corners).toBeLessThanOrEqual(18);
    expect(stats.fouls).toBeGreaterThanOrEqual(16);
    expect(stats.fouls).toBeLessThanOrEqual(32);
    expect(stats.yellowCards).toBeGreaterThanOrEqual(1.5);
    expect(stats.yellowCards).toBeLessThanOrEqual(8);
    expect(stats.redCards).toBeGreaterThanOrEqual(0.05);
    expect(stats.redCards).toBeLessThanOrEqual(0.8);
  });

  it("normalizes legacy natural-scale intercepts and clamps inflated priors", () => {
    const legacy = mergeCalibrationFromRecord({
      eventModelCoeffs: {
        fouls: {
          intercept: 20,
          totalXgSlope: 0.8,
          knockoutSlope: 0.5,
          physicalitySlope: 1.2,
          refereeStrictnessSlope: 0.1,
        },
        corners: {
          intercept: 9.5,
          totalXgSlope: 0.6,
          knockoutSlope: -0.2,
          physicalitySlope: 0.3,
          refereeStrictnessSlope: 0,
        },
        yellow: {
          intercept: 3.2,
          totalXgSlope: 0.35,
          knockoutSlope: 0.15,
          physicalitySlope: 0.4,
          refereeStrictnessSlope: 0.25,
        },
      },
    });

    expect(normalizeEventCoeffs({ ...legacy.eventModelCoeffs.fouls, intercept: 20 }, "fouls").intercept).toBeLessThan(
      5
    );
    expect(
      normalizeEventCoeffs({ ...legacy.eventModelCoeffs.yellow, intercept: 3.2 }, "yellow").intercept
    ).toBeLessThan(2);

    const stats = computeWcEstimatedMatchStats({
      homeTeamApiId: 4781,
      awayTeamApiId: 4736,
      homeName: "Mexico",
      awayName: "South Africa",
      homeDbTeamId: "mexico-db",
      awayDbTeamId: "sa-db",
      homeXg: 1.5,
      awayXg: 1.5,
      finishedMatches: [],
      calibration: legacy,
    });

    expect(stats.fouls).toBeLessThanOrEqual(32);
    expect(stats.corners).toBeLessThanOrEqual(18);
    expect(stats.yellowCards).toBeLessThanOrEqual(8);
  });

  it("clampEstimatedMatchStats enforces ceilings", () => {
    expect(
      clampEstimatedMatchStats({
        corners: 99_999,
        fouls: 1_000_000,
        yellowCards: 36,
        redCards: 2.6,
      })
    ).toEqual({
      corners: 18,
      fouls: 32,
      yellowCards: 8,
      redCards: 0.8,
    });
  });
});

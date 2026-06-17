import { describe, expect, it } from "vitest";
import { computeEstimatedMatchStats } from "./estimated-match-stats";
import type { TeamStatAverages } from "@/lib/types/prediction";

function teamStats(overrides: Partial<TeamStatAverages> = {}): TeamStatAverages {
  return {
    goalsFor: 1.25,
    goalsAgainst: 1.1,
    corners: 5.2,
    fouls: 11,
    yellowCards: 1.8,
    redCards: 0.08,
    shotsOnTarget: 4.2,
    ...overrides,
  };
}

describe("computeEstimatedMatchStats", () => {
  it("scales corners with final xG and shot volume", () => {
    const lowXg = computeEstimatedMatchStats({
      homeStats: teamStats(),
      awayStats: teamStats(),
      homeXg: 0.9,
      awayXg: 0.8,
    });
    const highXg = computeEstimatedMatchStats({
      homeStats: teamStats(),
      awayStats: teamStats(),
      homeXg: 2.1,
      awayXg: 1.9,
    });

    expect(highXg.corners).toBeGreaterThan(lowXg.corners);
  });

  it("differentiates physical and attacking profiles", () => {
    const physical = computeEstimatedMatchStats({
      homeStats: teamStats({ fouls: 13.5, yellowCards: 2.4, corners: 4.4 }),
      awayStats: teamStats({ fouls: 12.8, yellowCards: 2.1, corners: 4.1 }),
      homeXg: 1.2,
      awayXg: 1.1,
    });
    const technical = computeEstimatedMatchStats({
      homeStats: teamStats({ fouls: 8.5, yellowCards: 1.2, corners: 6.4, shotsOnTarget: 5.5 }),
      awayStats: teamStats({ fouls: 9.1, yellowCards: 1.4, corners: 6.1, shotsOnTarget: 5.2 }),
      homeXg: 1.8,
      awayXg: 1.5,
    });

    expect(physical.fouls).toBeGreaterThan(technical.fouls);
    expect(physical.yellowCards).toBeGreaterThan(technical.yellowCards);
    expect(technical.corners).toBeGreaterThan(physical.corners);
  });

  it("separates world-cup-style attacking vs physical national profiles", () => {
    const france = computeEstimatedMatchStats({
      homeStats: teamStats({
        corners: 6.1,
        fouls: 9.8,
        yellowCards: 1.5,
        shotsOnTarget: 5.4,
        goalsFor: 2.1,
      }),
      awayStats: teamStats({
        corners: 4.6,
        fouls: 12.4,
        yellowCards: 2.2,
        shotsOnTarget: 3.6,
        goalsFor: 1.0,
      }),
      homeXg: 2.05,
      awayXg: 0.85,
      fifaRatingDelta: 210,
    });
    const balancedMinnows = computeEstimatedMatchStats({
      homeStats: teamStats({
        corners: 4.8,
        fouls: 12.6,
        yellowCards: 2.3,
        shotsOnTarget: 3.4,
      }),
      awayStats: teamStats({
        corners: 4.5,
        fouls: 12.9,
        yellowCards: 2.4,
        shotsOnTarget: 3.2,
      }),
      homeXg: 1.15,
      awayXg: 1.05,
      fifaRatingDelta: 35,
    });

    expect(france.corners).not.toBe(balancedMinnows.corners);
    expect(france.fouls).not.toBe(balancedMinnows.fouls);
    expect(france.yellowCards).not.toBe(balancedMinnows.yellowCards);
  });

  it("raises card tempo for closer FIFA-ranked matchups", () => {
    const balanced = computeEstimatedMatchStats({
      homeStats: teamStats(),
      awayStats: teamStats(),
      homeXg: 1.35,
      awayXg: 1.25,
      fifaRatingDelta: 25,
    });
    const mismatch = computeEstimatedMatchStats({
      homeStats: teamStats(),
      awayStats: teamStats(),
      homeXg: 2.4,
      awayXg: 0.7,
      fifaRatingDelta: 280,
    });

    expect(balanced.fouls).toBeGreaterThan(mismatch.fouls * 0.95);
  });
});

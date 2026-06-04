import { describe, expect, it } from "vitest";
import {
  computeH2HRates,
  computeMomentumIndex,
  getMomentumWeights,
  W1_FORM_NATIONAL,
  W2_H2H_NATIONAL,
} from "./form-momentum";
import type { FixtureResult } from "@/lib/types/football";

function h2hMatch(
  homeId: number,
  awayId: number,
  homeGoals: number,
  awayGoals: number,
  date: string
): FixtureResult {
  return {
    fixture: { id: 1, date, status: { short: "FT" } },
    teams: {
      home: { id: homeId, name: "H", winner: homeGoals > awayGoals },
      away: { id: awayId, name: "A", winner: awayGoals > homeGoals },
    },
    goals: { home: homeGoals, away: awayGoals },
  };
}

describe("getMomentumWeights", () => {
  it("uses 80/20 for national context", () => {
    const w = getMomentumWeights("national", 1);
    expect(w.w1).toBe(W1_FORM_NATIONAL);
    expect(w.w2).toBe(W2_H2H_NATIONAL);
  });
});

describe("computeH2HRates national calendar decay", () => {
  it("discounts meetings older than 24 months", () => {
    const old = h2hMatch(1, 2, 2, 0, "2018-06-01");
    const recent = h2hMatch(1, 2, 1, 0, "2025-06-01");
    const rates = computeH2HRates([old, recent], 1, {
      entityType: "national",
      referenceDate: "2026-06-01",
      leagueId: 1,
    });
    expect(rates.hasData).toBe(true);
    expect(rates.homeWinRate).toBeGreaterThan(0.9);
  });
});

describe("computeMomentumIndex", () => {
  it("clamps extreme values to [-2, 2]", () => {
    const idx = computeMomentumIndex({
      homeFormScore: 1,
      awayFormScore: 0,
      h2hHomeWinRate: 1,
      h2hDrawRate: 0,
      h2hAwayWinRate: 0,
      homeLeagueStrength: 1,
      awayLeagueStrength: 0.3,
      homeStats: { goalsFor: 2, goalsAgainst: 0.5, corners: 5, fouls: 10, yellowCards: 2, redCards: 0, shotsOnTarget: 4 },
      awayStats: { goalsFor: 0.5, goalsAgainst: 2, corners: 4, fouls: 11, yellowCards: 2, redCards: 0, shotsOnTarget: 3 },
      h2hMeetingCount: 10,
      h2hHasData: true,
      entityType: "club",
      homeLeagueId: 39,
      awayLeagueId: 40,
    });
    expect(idx).toBeLessThanOrEqual(2);
    expect(idx).toBeGreaterThanOrEqual(-2);
  });
});

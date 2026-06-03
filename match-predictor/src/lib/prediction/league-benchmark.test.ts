import { describe, expect, it } from "vitest";
import {
  PREMIER_LEAGUE_ID,
  applyLeagueBenchmarkToPerformanceScore,
  computeLeagueStrengthMomentumEdge,
  getLeagueStrengthMultiplier,
  normalizeTeamStatsToPremierLeague,
} from "./league-benchmark";

describe("getLeagueStrengthMultiplier", () => {
  it("uses Premier League as 1.0 benchmark", () => {
    expect(getLeagueStrengthMultiplier(PREMIER_LEAGUE_ID)).toBe(1);
    expect(getLeagueStrengthMultiplier(88)).toBeLessThan(getLeagueStrengthMultiplier(39));
    expect(getLeagueStrengthMultiplier(61)).toBe(0.8);
    expect(getLeagueStrengthMultiplier(88)).toBe(0.72);
  });
});

describe("normalizeTeamStatsToPremierLeague", () => {
  it("downgrades Eredivisie attack and upgrades conceded vs PL", () => {
    const raw = {
      goalsFor: 2.5,
      goalsAgainst: 0.8,
      corners: 6,
      fouls: 11,
      yellowCards: 2,
      redCards: 0.1,
      shotsOnTarget: 5,
    };
    const adj = normalizeTeamStatsToPremierLeague(raw, 88);
    expect(adj.goalsFor).toBeLessThan(raw.goalsFor);
    expect(adj.goalsAgainst).toBeGreaterThan(raw.goalsAgainst);
  });

  it("leaves Premier League stats unchanged", () => {
    const raw = {
      goalsFor: 1.8,
      goalsAgainst: 1.0,
      corners: 5,
      fouls: 10,
      yellowCards: 2,
      redCards: 0,
      shotsOnTarget: 4,
    };
    expect(normalizeTeamStatsToPremierLeague(raw, 39)).toEqual(raw);
  });
});

describe("applyLeagueBenchmarkToPerformanceScore", () => {
  it("discounts high scores from weaker leagues", () => {
    const pl = applyLeagueBenchmarkToPerformanceScore(80, 39);
    const eredivisie = applyLeagueBenchmarkToPerformanceScore(80, 88);
    expect(pl).toBe(80);
    expect(eredivisie).not.toBeNull();
    expect(eredivisie!).toBeLessThan(80);
  });
});

describe("computeLeagueStrengthMomentumEdge", () => {
  it("favours home side from stronger league", () => {
    expect(
      computeLeagueStrengthMomentumEdge(39, 88)
    ).toBeGreaterThan(0);
    expect(
      computeLeagueStrengthMomentumEdge(88, 39)
    ).toBeLessThan(0);
  });
});

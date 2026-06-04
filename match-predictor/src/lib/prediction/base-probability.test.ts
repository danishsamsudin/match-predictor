import { describe, expect, it } from "vitest";
import { computeBaseProbability } from "./base-probability";
import { MOMENTUM_STRENGTH_CLAMP } from "./form-momentum";
import type { TeamStatAverages } from "@/lib/types/prediction";

const stats = (gf: number, ga: number): TeamStatAverages => ({
  goalsFor: gf,
  goalsAgainst: ga,
  corners: 5,
  fouls: 10,
  yellowCards: 2,
  redCards: 0.1,
  shotsOnTarget: 4,
});

describe("computeBaseProbability", () => {
  it("keeps xG positive under extreme negative momentum", () => {
    const result = computeBaseProbability({
      homeFormScore: 0,
      awayFormScore: 1,
      h2hHomeWinRate: 0,
      h2hDrawRate: 0,
      h2hAwayWinRate: 1,
      homeLeagueStrength: 0.5,
      awayLeagueStrength: 1,
      homeStats: stats(1.5, 1.2),
      awayStats: stats(1.8, 0.9),
      leagueAvgGoals: 1.35,
      homeLeagueId: 39,
      awayLeagueId: 39,
      h2hMeetingCount: 5,
      h2hHasData: true,
    });
    expect(result.homeXg).toBeGreaterThan(0);
    expect(result.awayXg).toBeGreaterThan(0);
  });

  it("uses custom leagueAvgGoals (μ)", () => {
    const lowMu = computeBaseProbability({
      homeFormScore: 0.5,
      awayFormScore: 0.5,
      h2hHomeWinRate: 1 / 3,
      h2hDrawRate: 1 / 3,
      h2hAwayWinRate: 1 / 3,
      homeLeagueStrength: 1,
      awayLeagueStrength: 1,
      homeStats: stats(1.2, 1.2),
      awayStats: stats(1.2, 1.2),
      leagueAvgGoals: 1.2,
    });
    const highMu = computeBaseProbability({
      homeFormScore: 0.5,
      awayFormScore: 0.5,
      h2hHomeWinRate: 1 / 3,
      h2hDrawRate: 1 / 3,
      h2hAwayWinRate: 1 / 3,
      homeLeagueStrength: 1,
      awayLeagueStrength: 1,
      homeStats: stats(1.2, 1.2),
      awayStats: stats(1.2, 1.2),
      leagueAvgGoals: 1.5,
    });
    expect(lowMu.homeXg + lowMu.awayXg).toBeLessThan(highMu.homeXg + highMu.awayXg);
  });
});

describe("momentum clamp", () => {
  it("exports clamp bound used in form-momentum", () => {
    expect(MOMENTUM_STRENGTH_CLAMP).toBe(2);
  });
});

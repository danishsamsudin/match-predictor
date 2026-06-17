import { describe, expect, it } from "vitest";
import {
  mostLikelyScoreFromXg,
  resolveMatchProbsFromXg,
  runTournamentMatchSim,
  simulateMatchOutcome,
} from "./tournament-sim";

describe("tournament-sim", () => {
  it("resolves 1X2 from xG grid", () => {
    const probs = resolveMatchProbsFromXg(1.4, 1.1);
    expect(probs.homeWin + probs.draw + probs.awayWin).toBeCloseTo(1, 5);
    expect(probs.homeWin).toBeGreaterThan(probs.awayWin);
  });

  it("runs Monte Carlo without throwing", () => {
    const result = runTournamentMatchSim({
      matches: [{ homeTeamId: 1, awayTeamId: 2, homeXg: 1.5, awayXg: 1 }],
      iterations: 200,
    });
    expect(result.iterations).toBe(200);
    expect(result.homeWinPct + result.drawPct + result.awayWinPct).toBeCloseTo(100, 0);
  });

  it("samples valid outcomes", () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      outcomes.add(simulateMatchOutcome(1.2, 1.2));
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it("avoidDraw favors the higher-xG side instead of always 0-1", () => {
    const equal = mostLikelyScoreFromXg(1.25, 1.25, { avoidDraw: true });
    expect(equal.home).not.toBe(equal.away);

    const homeFav = mostLikelyScoreFromXg(2.0, 0.8, { avoidDraw: true });
    expect(homeFav.home).toBeGreaterThan(homeFav.away);

    const awayFav = mostLikelyScoreFromXg(0.8, 2.0, { avoidDraw: true });
    expect(awayFav.away).toBeGreaterThan(awayFav.home);
  });
});

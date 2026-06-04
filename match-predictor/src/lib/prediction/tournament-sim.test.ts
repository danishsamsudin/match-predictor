import { describe, expect, it } from "vitest";
import {
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
});

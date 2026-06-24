import { describe, expect, it } from "vitest";
import {
  computeLineupImpact,
  LAV_BASELINE_SCORE,
  resolvePlayerPerformanceScore,
} from "./lineup-impact";
import type { FixtureLineup } from "@/lib/types/football";

function lineup(teamId: number, scores: number[]): FixtureLineup {
  const positions = ["G", "D", "D", "D", "D", "M", "M", "M", "F", "F", "F"];
  return {
    team: { id: teamId, name: "Team" },
    formation: "4-3-3",
    startXI: scores.map((score, i) => ({
      player: {
        id: teamId * 100 + i,
        name: `P${i}`,
        number: i + 1,
        pos: positions[i] ?? "M",
        grid: null,
        performanceScore: score,
      },
    })),
    substitutes: [],
  };
}

describe("resolvePlayerPerformanceScore", () => {
  it("defaults unrated players to neutral 65", () => {
    expect(resolvePlayerPerformanceScore(null)).toBe(LAV_BASELINE_SCORE);
    expect(resolvePlayerPerformanceScore(undefined)).toBe(LAV_BASELINE_SCORE);
  });
});

describe("computeLineupImpact LAV", () => {
  it("does not penalize XI with all neutral scores", () => {
    const neutral = lineup(1, Array(11).fill(LAV_BASELINE_SCORE));
    const result = computeLineupImpact([neutral, lineup(2, Array(11).fill(80))], [], 1, 2);
    expect(result.homeXgMultiplier).toBeCloseTo(1, 2);
    expect(result.homeSuspensionLavImpact).toBe(0);
    expect(result.homeDisciplineRiskIndex).toBe(0);
  });

  it("boosts opponent xG when defense LAV is weak", () => {
    const weakDefense = lineup(1, [
      65, 40, 40, 40, 40, 65, 65, 65, 80, 80, 80,
    ]);
    const strong = lineup(2, Array(11).fill(70));
    const result = computeLineupImpact([weakDefense, strong], [], 1, 2);
    expect(result.homeDefenseMultiplier).toBeGreaterThan(1);
  });

  it("computes suspension LAV delta from bench replacement quality", () => {
    const home = lineup(1, [65, 65, 65, 65, 65, 65, 65, 65, 90, 65, 65]);
    home.substitutes = [
      {
        player: {
          id: 99,
          name: "Sub",
          number: 12,
          pos: "F",
          grid: null,
          performanceScore: 55,
        },
      },
    ];
    const away = lineup(2, Array(11).fill(70));
    const result = computeLineupImpact([home, away], [], 1, 2, {
      homeSuspendedPlayerIds: new Set([108]),
    });
    expect(result.homeSuspensionLavImpact).toBeGreaterThan(0);
    expect(result.homeAttackLavDelta).toBeGreaterThan(0);
  });
});

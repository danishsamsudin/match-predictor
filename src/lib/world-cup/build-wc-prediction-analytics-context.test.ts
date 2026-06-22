import { describe, expect, it } from "vitest";
import { buildWcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";

describe("buildWcPredictionAnalyticsContext", () => {
  it("includes canonical venue for Spain in team comparison", async () => {
    const ctx = await buildWcPredictionAnalyticsContext({
      snapshot: {
        home_xg_elo: 1500,
        away_xg_elo: 1124,
        home_wctr: 1490,
        away_wctr: 1180,
        home_attack: 1.2345678,
        away_attack: 0.9876543,
        home_defense: 0.8765432,
        away_defense: 1.1111111,
      },
      homeXg: 2.1,
      awayXg: 0.8,
      homeTeamApiId: 4698,
      awayTeamApiId: 4834,
      homeDbTeamId: "spain-db",
      awayDbTeamId: "saudi-db",
      homeName: "Spain",
      awayName: "Saudi Arabia",
      homeFormMatches: [],
      awayFormMatches: [],
    });

    expect(ctx.teamComparison.home.seasonStats.venueName).toBe("Santiago Bernabéu");
    expect(ctx.teamComparison.home.seasonStats.venueCapacity).toBe("83186");
    expect(ctx.statComparison.some((r) => r.metric === "xG-Elo rating")).toBe(true);
    expect(ctx.statComparison.some((r) => r.metric === "xG-Elo advantage")).toBe(false);
    expect(ctx.statComparison.some((r) => r.metric === "WCTR advantage")).toBe(false);
    const xgEloRow = ctx.statComparison.find((r) => r.metric === "xG-Elo rating");
    expect(xgEloRow?.home).toBe(1500);
    expect(xgEloRow?.away).toBe(1124);
    const wctrRow = ctx.statComparison.find((r) => r.metric === "Tournament rating (WCTR)");
    expect(wctrRow?.home).toBe(1490);
    expect(wctrRow?.away).toBe(1180);
    const attackRow = ctx.statComparison.find((r) => r.metric === "Attack process rate");
    expect(attackRow?.home).toBe(1.235);
    expect(attackRow?.away).toBe(0.988);
    const defenseRow = ctx.statComparison.find((r) => r.metric === "Defense process rate");
    expect(defenseRow?.home).toBe(0.877);
    expect(defenseRow?.away).toBe(1.111);
  });
});

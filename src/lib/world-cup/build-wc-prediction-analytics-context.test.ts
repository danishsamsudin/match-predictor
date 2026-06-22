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
    expect(ctx.statComparison.some((r) => r.metric === "xG-Elo advantage")).toBe(true);
    const xgEloRow = ctx.statComparison.find((r) => r.metric === "xG-Elo rating");
    expect(xgEloRow?.home).toBe(1500);
    expect(xgEloRow?.away).toBe(1124);
    const wctrRow = ctx.statComparison.find((r) => r.metric === "Tournament rating (WCTR)");
    expect(wctrRow?.home).toBe(1490);
    expect(wctrRow?.away).toBe(1180);
  });
});

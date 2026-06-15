import { describe, expect, it } from "vitest";
import { computeWcLineupPlayerXgImpact } from "@/lib/world-cup/wc-lineup-player-xg-impact";
import type { WcLineupPlayerStatsMap } from "@/lib/world-cup/resolve-wc-lineup-player-stats";

function player(
  overrides: Partial<WcLineupPlayerStatsMap[string]> & { optaPlayerId: string; playerName: string }
): WcLineupPlayerStatsMap[string] {
  return {
    role: "M",
    isStarter: true,
    availabilityFactor: 1,
    avgOptaPoints: 7,
    chanceIndexPer90: 0.4,
    defensiveActionsPer90: 2,
    gkSaveIndex: null,
    minutesTotal: 180,
    ...overrides,
  };
}

describe("computeWcLineupPlayerXgImpact", () => {
  it("boosts home attack when WC form is strong", () => {
    const home: WcLineupPlayerStatsMap = {};
    const away: WcLineupPlayerStatsMap = {};
    for (let i = 0; i < 11; i++) {
      home[`h${i}`] = player({
        optaPlayerId: `h${i}`,
        playerName: `Home ${i}`,
        role: i < 3 ? "D" : i < 8 ? "M" : "F",
        avgOptaPoints: 8.5,
        chanceIndexPer90: 0.55,
      });
      away[`a${i}`] = player({
        optaPlayerId: `a${i}`,
        playerName: `Away ${i}`,
        avgOptaPoints: 5.5,
        chanceIndexPer90: 0.2,
      });
    }

    const impact = computeWcLineupPlayerXgImpact({
      homePlayers: home,
      awayPlayers: away,
      baseHomeXg: 1.5,
      baseAwayXg: 1.1,
      mu: 1.25,
      mode: "model_xi",
    });

    expect(impact.homeXgMultiplier).toBeGreaterThan(1);
    expect(impact.awayXgMultiplier).toBeGreaterThan(0.75);
    expect(impact.notes.some((n) => n.includes("Model XI"))).toBe(true);
  });

  it("returns neutral multipliers when lineups are empty", () => {
    const impact = computeWcLineupPlayerXgImpact({
      homePlayers: {},
      awayPlayers: {},
      baseHomeXg: 1.4,
      baseAwayXg: 1.2,
      mu: 1.25,
    });

    expect(impact.homeXgMultiplier).toBe(1);
    expect(impact.awayXgMultiplier).toBe(1);
  });
});

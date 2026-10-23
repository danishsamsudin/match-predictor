import { describe, expect, it } from "vitest";
import {
  loadUnderstatSeasonXgRows,
  medianPlayed,
  shouldPreferUnderstatSeasonXg,
  understatRowsToSeasonXgAgg,
  understatSeasonXgAvailable,
} from "@/lib/glpm/understat-season-xg";
import { SM_SEASON_2026_27 } from "@/lib/sportmonks/constants";

describe("understat-season-xg", () => {
  it("loads Bundesliga 26/27 normalized rows with team ids", () => {
    expect(understatSeasonXgAvailable(SM_SEASON_2026_27.BUNDESLIGA)).toBe(true);
    const rows = loadUnderstatSeasonXgRows(SM_SEASON_2026_27.BUNDESLIGA);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.teamSmId > 0 && r.xgf >= 0 && r.xga >= 0)).toBe(
      true
    );
  });

  it("marks understat aggregates as provider-grade", () => {
    const rows = loadUnderstatSeasonXgRows(SM_SEASON_2026_27.BUNDESLIGA);
    const map = understatRowsToSeasonXgAgg(rows.slice(0, 3));
    for (const agg of map.values()) {
      expect(agg.providerN).toBeGreaterThan(0);
      expect(agg.proxyN).toBe(0);
    }
  });

  it("prefers understat only when depth is comparable to standings", () => {
    const deep = [
      {
        teamSmId: 1,
        teamName: "A",
        matches: 10,
        xgf: 1,
        xga: 1,
        goalsFor: 1,
        goalsAgainst: 1,
      },
    ];
    const shallow = [{ ...deep[0]!, matches: 2 }];
    expect(shouldPreferUnderstatSeasonXg(deep, 10)).toBe(true);
    expect(shouldPreferUnderstatSeasonXg(shallow, 12)).toBe(false);
    expect(medianPlayed([8, 9, 10])).toBe(9);
  });
});

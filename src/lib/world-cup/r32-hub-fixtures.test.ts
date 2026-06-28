import { describe, expect, it } from "vitest";
import {
  buildR32HubMatchRows,
  isKnockoutSlotPlaceholder,
  loadR32Fixtures,
  r32FixtureHasBothTeams,
  r32MatchId,
} from "@/lib/world-cup/r32-hub-fixtures";

describe("r32 hub fixtures", () => {
  it("loads 16 Round of 32 fixtures", () => {
    expect(loadR32Fixtures()).toHaveLength(16);
  });

  it("detects FIFA slot placeholders", () => {
    expect(isKnockoutSlotPlaceholder("3CEFHI")).toBe(true);
    expect(isKnockoutSlotPlaceholder("2J")).toBe(true);
    expect(isKnockoutSlotPlaceholder("1L")).toBe(true);
    expect(isKnockoutSlotPlaceholder("TBD")).toBe(true);
    expect(isKnockoutSlotPlaceholder("Mexico")).toBe(false);
    expect(isKnockoutSlotPlaceholder("Bosnia & Herzegovina")).toBe(false);
  });

  it("builds stable knockout match ids", () => {
    expect(r32MatchId(73)).toBe("wc2026-ko-73");
  });

  it("marks fixtures with unresolved sides", () => {
    const mexico = loadR32Fixtures().find((f) => f.match_number === 79)!;
    expect(r32FixtureHasBothTeams(mexico)).toBe(true);
    const usa = loadR32Fixtures().find((f) => f.match_number === 81)!;
    expect(r32FixtureHasBothTeams(usa)).toBe(true);
  });

  it("maps known nations to team ids from the draw", () => {
    const teamNames = new Map([
      ["4714", "USA"],
      ["4720", "Mexico"],
    ]);
    const rows = buildR32HubMatchRows(teamNames);
    const usaMatch = rows.find((m) => m.id === "wc2026-ko-81")!;
    expect(usaMatch.home_team_name).toBe("USA");
    expect(usaMatch.home_team_id).toBe("4714");
    expect(usaMatch.away_team_name).toBe("Bosnia & Herzegovina");
    expect(usaMatch.round).toBe("R32");
    expect(usaMatch.group_code).toBeNull();
  });
});

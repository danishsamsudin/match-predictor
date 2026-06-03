import { describe, expect, it } from "vitest";
import {
  WORLD_CUP_2026_TEAMS,
  WORLD_CUP_REFERENCE_LEAGUE_ID,
  filterToWorldCupTeams,
  isWorldCupLeague,
} from "./world-cup-2026-teams";

describe("world-cup-2026-teams", () => {
  it("exposes 48 World Cup nations", () => {
    expect(WORLD_CUP_2026_TEAMS).toHaveLength(48);
    expect(isWorldCupLeague(WORLD_CUP_REFERENCE_LEAGUE_ID)).toBe(true);
    expect(isWorldCupLeague(39)).toBe(false);
  });

  it("filterToWorldCupTeams drops non-tournament sides", () => {
    const filtered = filterToWorldCupTeams([
      ...WORLD_CUP_2026_TEAMS.slice(0, 2),
      { id: 99999, name: "Not A Nation" },
    ]);
    expect(filtered).toHaveLength(48);
    expect(filtered.some((t) => t.id === 99999)).toBe(false);
  });
});

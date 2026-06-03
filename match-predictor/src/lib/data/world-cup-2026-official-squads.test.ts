import { describe, expect, it } from "vitest";
import {
  OFFICIAL_WC_2026_SQUADS,
  getOfficialWcTeamSquad,
  resolveWc2026TeamLabel,
} from "./world-cup-2026-official-squads";
import { WORLD_CUP_2026_TEAMS } from "./world-cup-2026-teams";

describe("world-cup-2026-official-squads", () => {
  it("includes all 48 nations with 26 players and a head coach", () => {
    expect(Object.keys(OFFICIAL_WC_2026_SQUADS.teams)).toHaveLength(48);
    for (const team of WORLD_CUP_2026_TEAMS) {
      const squad = getOfficialWcTeamSquad(team.name);
      expect(squad, team.name).toBeTruthy();
      expect(squad!.players).toHaveLength(26);
      expect(squad!.coach?.name).toBeTruthy();
    }
  });

  it("resolves common national team aliases", () => {
    expect(resolveWc2026TeamLabel("United States")).toBe("USA");
    expect(resolveWc2026TeamLabel("Korea Republic")).toBe("South Korea");
    expect(resolveWc2026TeamLabel("IR Iran")).toBe("Iran");
    expect(resolveWc2026TeamLabel(undefined, 4819)).toBe("Argentina");
  });
});

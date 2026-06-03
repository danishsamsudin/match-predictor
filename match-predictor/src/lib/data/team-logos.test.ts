import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { TEAM_LOGO_ID_TO_NAME } from "@/lib/data/team-logo-manifest";
import { resolveLogoIdForTeam, resolveTeamLogo } from "@/lib/data/team-logos";

describe("team-logos", () => {
  it("resolves by canonical team id before name aliases", () => {
    expect(resolveLogoIdForTeam({ id: 33, name: "Wrong Label" })).toBe(33);
    expect(resolveLogoIdForTeam({ id: 33, name: "Tottenham Hotspur" })).toBe(33);
  });

  it("resolves common nicknames via extra aliases", () => {
    expect(resolveLogoIdForTeam({ id: 99999, name: "Spurs" })).toBe(33);
  });

  it("prefers name over mismatched upstream id (Ajax vs Saudi club id)", () => {
    expect(
      resolveLogoIdForTeam({ id: 34315, name: "AFC Ajax", shortName: "Ajax" })
    ).toBe(2953);
    expect(resolveLogoIdForTeam({ id: 2953, name: "AFC Ajax" })).toBe(2953);
  });

  it("maps known manifest ids to an existing local badge or flag", () => {
    const sampleIds = [33, 17, 35, 1644];
    for (const id of sampleIds) {
      if (!TEAM_LOGO_ID_TO_NAME[id]) continue;
      const logo = resolveTeamLogo({ id, name: TEAM_LOGO_ID_TO_NAME[id] });
      if (logo.startsWith("http")) {
        expect(logo).toMatch(/^https:\/\//);
      } else {
        const file = path.join(process.cwd(), "public", logo.replace(/^\//, ""));
        expect(fs.existsSync(file), `missing ${file}`).toBe(true);
      }
    }
  });
});

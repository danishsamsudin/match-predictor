import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";
import { TEAM_LOGO_ID_TO_NAME } from "@/lib/data/team-logo-manifest";
import {
  isSquareNationalFlag,
  resolveLogoIdForTeam,
  resolveNationalFlagUrl,
  resolveTeamLogo,
} from "@/lib/data/team-logos";

describe("team-logos", () => {
  it("detects legally square national flags", () => {
    expect(isSquareNationalFlag("Switzerland")).toBe(true);
    expect(isSquareNationalFlag("Brazil")).toBe(false);
    expect(isSquareNationalFlag("England")).toBe(false);
  });

  it("resolves World Cup and Nations League flags via flagcdn", () => {
    expect(resolveNationalFlagUrl("England")).toBe("https://flagcdn.com/w160/gb-eng.png");
    expect(resolveNationalFlagUrl("Poland")).toBe("https://flagcdn.com/w160/pl.png");
    expect(resolveNationalFlagUrl("Italy")).toBe("https://flagcdn.com/w160/it.png");
    expect(resolveNationalFlagUrl("Kosovo")).toBe("https://flagcdn.com/w160/xk.png");
    expect(resolveNationalFlagUrl("Northern Ireland")).toBe(
      "https://flagcdn.com/w160/gb-nir.png"
    );
    expect(resolveNationalFlagUrl("Republic of Ireland")).toBe(
      "https://flagcdn.com/w160/ie.png"
    );
    expect(resolveNationalFlagUrl("North Macedonia")).toBe(
      "https://flagcdn.com/w160/mk.png"
    );
    expect(resolveNationalFlagUrl("Faroe Islands")).toBe(
      "https://flagcdn.com/w160/fo.png"
    );
    expect(resolveNationalFlagUrl("Türkiye")).toBe("https://flagcdn.com/w160/tr.png");
    expect(resolveNationalFlagUrl("Turkey")).toBe("https://flagcdn.com/w160/tr.png");
    expect(resolveNationalFlagUrl("Czech Republic")).toBe(
      "https://flagcdn.com/w160/cz.png"
    );
    expect(resolveNationalFlagUrl("Korea Republic")).toBe(
      "https://flagcdn.com/w160/kr.png"
    );
  });

  it("covers every Nations League nation with a flag URL", () => {
    for (const team of NATIONS_LEAGUE_2026_TEAMS) {
      expect(
        resolveNationalFlagUrl(team.name),
        `missing flag for ${team.name}`
      ).toMatch(/^https:\/\/flagcdn\.com\/w160\/[a-z0-9-]+\.png$/);
    }
  });

  it("uses flagcdn for national team badges even without entityType", () => {
    expect(resolveTeamLogo({ id: 4703, name: "Poland" })).toBe(
      "https://flagcdn.com/w160/pl.png"
    );
    expect(resolveTeamLogo({ id: 4707, name: "Italy" }, "national")).toBe(
      "https://flagcdn.com/w160/it.png"
    );
  });

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

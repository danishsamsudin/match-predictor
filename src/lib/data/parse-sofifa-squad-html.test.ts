import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  isWc2026SofifaSquadFilename,
  parseSofifaSquadHtml,
  resolveWc2026SofifaTeamLabel,
} from "@/lib/data/parse-sofifa-squad-html";

const SOFIFA_DIR = path.join(
  process.cwd(),
  "data/world-cup-2026/WC Squads - SoFIFA"
);
const ENGLAND_HTML = path.join(
  SOFIFA_DIR,
  "England - FC 26 - Jun 10, 2026 _ SoFIFA.html"
);

describe("parseSofifaSquadHtml", () => {
  it("parses England squad ratings and key players", () => {
    const html = readFileSync(ENGLAND_HTML, "utf-8");
    const squad = parseSofifaSquadHtml(html, path.basename(ENGLAND_HTML));

    expect(squad.teamName).toBe("England");
    expect(squad.sofifaTeamId).toBe(1318);
    expect(squad.ratings.overall).toBe(84);
    expect(squad.ratings.attack).toBe(86);
    expect(squad.players.length).toBeGreaterThan(20);

    const kane = squad.players.find((p) => p.fullName === "Harry Kane");
    const pickford = squad.players.find((p) => p.fullName === "Jordan Pickford");
    const watkins = squad.players.find((p) => p.fullName === "Ollie Watkins");
    expect(pickford?.overall).toBe(85);
    expect(pickford?.isStarter).toBe(true);
    expect(pickford?.squadRole).toBe("GK");
    expect(watkins?.isStarter).toBe(false);
    expect(watkins?.squadRole).toBe("SUB");
    expect(watkins?.positions).toContain("ST");
    expect(kane?.overall).toBeGreaterThan(80);
    expect(squad.setPieces.Penalties).toBe("Harry Kane");
  });

  it("flags non-WC nations", () => {
    expect(isWc2026SofifaSquadFilename("Italy - FC 26 - Jun 10, 2026 _ SoFIFA.html")).toBe(
      false
    );
    expect(isWc2026SofifaSquadFilename("Denmark - FC 26 - Jun 10, 2026 _ SoFIFA.html")).toBe(
      false
    );
    expect(resolveWc2026SofifaTeamLabel("Korea Republic - FC 26 - Jun 10, 2026 _ SoFIFA.html")).toBe(
      "South Korea"
    );
    expect(resolveWc2026SofifaTeamLabel("Congo DR - FC 26 - Jun 10, 2026 _ SoFIFA.html")).toBe(
      "DR Congo"
    );
  });
});

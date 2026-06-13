import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseOptaDateString,
  parseOptaMatchHtml,
} from "@/lib/world-cup/opta-html-parser";

const FIXTURE_DIR = path.join(__dirname, "__fixtures__/opta-html");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.html`), "utf8");
}

describe("parseOptaDateString", () => {
  it("parses Opta date labels", () => {
    expect(parseOptaDateString("Thursday 11 June 2026")).toBe("2026-06-11");
  });
});

describe("parseOptaMatchHtml", () => {
  it("parses Mexico vs South Africa fixture", () => {
    const html = loadFixture("mexico-south-africa");
    const parsed = parseOptaMatchHtml(html);

    expect(parsed.homeTeamName).toBe("Mexico");
    expect(parsed.awayTeamName).toBe("South Africa");
    expect(parsed.homeGoals).toBe(2);
    expect(parsed.awayGoals).toBe(0);
    expect(parsed.halfTimeHome).toBe(1);
    expect(parsed.halfTimeAway).toBe(0);
    expect(parsed.matchDate).toBe("2026-06-11");
    expect(parsed.homeFormation).toBe("4-1-4-1");
    expect(parsed.awayFormation).toBe("5-3-2");
    expect(parsed.homeXg).toBeCloseTo(1.46, 2);
    expect(parsed.awayXg).toBeCloseTo(0.07, 2);
    expect(parsed.homeShots).toBe(16);
    expect(parsed.awayShots).toBe(3);
    expect(parsed.homeCorners).toBe(3);
    expect(parsed.awayCorners).toBe(1);
    expect(parsed.homeFoulsConceded).toBeNull();
    expect(parsed.awayFoulsConceded).toBeNull();
    expect(parsed.homeTeamApiId).toBe(4781);
    expect(parsed.awayTeamApiId).toBe(4736);
    expect(parsed.narrativeFeatures.possessionHomePct).toBeCloseTo(60.5, 1);
    expect(parsed.articleText).toMatch(/three players were sent off/i);
    expect(parsed.optaFacts.length).toBeGreaterThan(0);
  });

  it("parses South Korea vs Czechia fixture", () => {
    const html = loadFixture("south-korea-czechia");
    const parsed = parseOptaMatchHtml(html);

    expect(parsed.homeTeamName).toBe("South Korea");
    expect(parsed.awayTeamName).toBe("Czechia");
    expect(parsed.homeGoals).toBe(2);
    expect(parsed.awayGoals).toBe(1);
    expect(parsed.homeXg).toBeCloseTo(2.3, 1);
    expect(parsed.awayXg).toBeCloseTo(0.83, 2);
    expect(parsed.homeCorners).toBe(4);
    expect(parsed.awayCorners).toBe(5);
    expect(parsed.homeTeamApiId).toBe(4735);
    expect(parsed.awayTeamApiId).toBe(4714);
    expect(parsed.narrativeFeatures.setPieceGoal).toBe(true);
    expect(parsed.narrativeFeatures.setPieceGoalRateMentioned).toBeNull();
    expect(parsed.narrativeFeatures.comebackWin).toBe(true);
  });

  it("parses discipline stats from Opta Discipline section", () => {
    const widgetHtml = `
      <table class="Opta-Stats-Bars"><tbody>
        <tr><th scope="row">Fouls conceded</th></tr>
        <tr><td class="Opta-Outer">13</td><td></td><td class="Opta-Outer Opta-Outer-bigger">17</td></tr>
        <tr><th scope="row">Yellow cards</th></tr>
        <tr><td class="Opta-Outer">1</td><td></td><td class="Opta-Outer Opta-Outer-bigger">5</td></tr>
        <tr><th scope="row">Red cards</th></tr>
        <tr><td class="Opta-Outer">0</td><td></td><td class="Opta-Outer">0</td></tr>
      </tbody></table>`;
    const parsed = parseOptaMatchHtml("<title>USA vs Paraguay Stats:</title>", { widgetHtml });

    expect(parsed.homeFoulsConceded).toBe(13);
    expect(parsed.awayFoulsConceded).toBe(17);
    expect(parsed.widgetStats?.home.tackles).toBeNull();
    expect(parsed.narrativeFeatures.yellowCardsHome).toBe(1);
    expect(parsed.narrativeFeatures.yellowCardsAway).toBe(5);
    expect(parsed.narrativeFeatures.redCardsHome).toBe(0);
    expect(parsed.narrativeFeatures.redCardsAway).toBe(0);
  });

  it("parses Canada vs Bosnia live title without score in headline", () => {
    const html = `<title>Canada vs Bosnia-Herzegovina Stats: World Cup 2026 Live | Opta Analyst</title>`;
    const parsed = parseOptaMatchHtml(html);

    expect(parsed.homeTeamName).toBe("Canada");
    expect(parsed.awayTeamName).toBe("Bosnia & Herzegovina");
    expect(parsed.homeTeamApiId).toBe(4752);
    expect(parsed.awayTeamApiId).toBe(4479);
  });
});

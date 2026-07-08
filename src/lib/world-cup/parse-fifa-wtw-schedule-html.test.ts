import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFifaWtwR32ScheduleHtml, parseFifaWtwR16ScheduleHtml, parseFifaWtwQfScheduleHtml, type FifaKnockoutScheduleFallback } from "@/lib/world-cup/parse-fifa-wtw-schedule-html";

const DEFAULT_HTML = path.join(
  os.homedir(),
  "Downloads",
  "Game Schedule & Where to Watch _ FIFA World Cup 2026™.html"
);

const BRACKET_PATH = path.join(process.cwd(), "data/world-cup-2026/knockout-bracket.json");

function loadBracketFallbacks(round: "R32" | "R16" | "QF"): FifaKnockoutScheduleFallback[] {
  const raw = JSON.parse(fs.readFileSync(BRACKET_PATH, "utf8")) as {
    matches?: Array<{
      match_number: number;
      round: string;
      date: string;
      kickoff_time: string;
      stadium: string;
      city: string;
    }>;
  };
  return (raw.matches ?? [])
    .filter((m) => m.round === round)
    .map((m) => ({
      match_number: m.match_number,
      date: m.date,
      kickoff_time: m.kickoff_time,
      stadium: m.stadium,
      city: m.city,
    }));
}

describe("parseFifaWtwR32ScheduleHtml", () => {
  it.skipIf(!fs.existsSync(DEFAULT_HTML))(
    "parses 16 Round of 32 fixtures with resolved teams and venue-local kickoffs",
    () => {
      const html = fs.readFileSync(DEFAULT_HTML, "utf8");
      const fixtures = parseFifaWtwR32ScheduleHtml(html, loadBracketFallbacks("R32"));

      expect(fixtures).toHaveLength(16);
      expect(fixtures.map((f) => f.match_number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 16 }, (_, i) => i + 73)
      );

      const saCanada = fixtures.find((f) => f.match_number === 73)!;
      expect(saCanada.home_team).toBe("South Africa");
      expect(saCanada.away_team).toBe("Canada");
      expect(saCanada.city).toBe("Los Angeles");
      expect(saCanada.kickoff_time).toBe("12:00");

      const mexico = fixtures.find((f) => f.match_number === 79)!;
      expect(mexico.home_team).toBe("Mexico");
      expect(mexico.away_team).toBe("Ecuador");

      const usa = fixtures.find((f) => f.match_number === 81)!;
      expect(usa.away_team).toBe("Bosnia & Herzegovina");

      const england = fixtures.find((f) => f.match_number === 80)!;
      expect(england.away_team).toBe("DR Congo");
    }
  );

  it.skipIf(!fs.existsSync(DEFAULT_HTML))(
    "parses 8 Round of 16 fixtures with resolved teams",
    () => {
      const html = fs.readFileSync(DEFAULT_HTML, "utf8");
      const fixtures = parseFifaWtwR16ScheduleHtml(html, loadBracketFallbacks("R16"));

      expect(fixtures).toHaveLength(8);
      expect(fixtures.map((f) => f.match_number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 8 }, (_, i) => i + 89)
      );

      const canadaMorocco = fixtures.find((f) => f.match_number === 90)!;
      expect(canadaMorocco.home_team).toBe("Canada");
      expect(canadaMorocco.away_team).toBe("Morocco");
      expect(canadaMorocco.home_goals).toBe(0);
      expect(canadaMorocco.away_goals).toBe(3);

      const mexicoEngland = fixtures.find((f) => f.match_number === 92)!;
      expect(mexicoEngland.home_team).toBe("Mexico");
      expect(mexicoEngland.away_team).toBe("England");
    }
  );

  it.skipIf(!fs.existsSync(DEFAULT_HTML))(
    "parses 4 Quarter-final fixtures with resolved teams",
    () => {
      const html = fs.readFileSync(DEFAULT_HTML, "utf8");
      const fixtures = parseFifaWtwQfScheduleHtml(html, loadBracketFallbacks("QF"));

      expect(fixtures).toHaveLength(4);
      expect(fixtures.map((f) => f.match_number).sort((a, b) => a - b)).toEqual([97, 98, 99, 100]);

      const franceMorocco = fixtures.find((f) => f.match_number === 97)!;
      expect(franceMorocco.home_team).toBe("France");
      expect(franceMorocco.away_team).toBe("Morocco");
      expect(franceMorocco.city).toBe("Boston");

      const spainBelgium = fixtures.find((f) => f.match_number === 98)!;
      expect(spainBelgium.home_team).toBe("Spain");
      expect(spainBelgium.away_team).toBe("Belgium");

      const norwayEngland = fixtures.find((f) => f.match_number === 99)!;
      expect(norwayEngland.home_team).toBe("Norway");
      expect(norwayEngland.away_team).toBe("England");

      const argSwitzerland = fixtures.find((f) => f.match_number === 100)!;
      expect(argSwitzerland.home_team).toBe("Argentina");
      expect(argSwitzerland.away_team).toBe("Switzerland");
    }
  );
});

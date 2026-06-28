import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFifaWtwR32ScheduleHtml } from "@/lib/world-cup/parse-fifa-wtw-schedule-html";

const DEFAULT_HTML = path.join(
  os.homedir(),
  "Downloads",
  "Game Schedule & Where to Watch _ FIFA World Cup 2026™.html"
);

describe("parseFifaWtwR32ScheduleHtml", () => {
  it.skipIf(!fs.existsSync(DEFAULT_HTML))(
    "parses 16 Round of 32 fixtures with resolved teams and venue-local kickoffs",
    () => {
      const html = fs.readFileSync(DEFAULT_HTML, "utf8");
      const fixtures = parseFifaWtwR32ScheduleHtml(html);

      expect(fixtures).toHaveLength(16);
      expect(fixtures.map((f) => f.match_number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 16 }, (_, i) => i + 73)
      );

      const saCanada = fixtures.find((f) => f.match_number === 73)!;
      expect(saCanada.home_team).toBe("South Africa");
      expect(saCanada.away_team).toBe("Canada");
      expect(saCanada.city).toBe("Los Angeles");
      expect(saCanada.kickoff_time).toBe("12:00");
      expect(saCanada.cest_time).toBe("21:00");

      const mexico = fixtures.find((f) => f.match_number === 79)!;
      expect(mexico.home_team).toBe("Mexico");
      expect(mexico.away_team).toBe("Ecuador");

      const usa = fixtures.find((f) => f.match_number === 81)!;
      expect(usa.away_team).toBe("Bosnia & Herzegovina");

      const england = fixtures.find((f) => f.match_number === 80)!;
      expect(england.away_team).toBe("DR Congo");
    }
  );
});

import { describe, expect, it } from "vitest";
import {
  clearOptaParseIndexCache,
  findOptaParsedMatch,
} from "@/lib/world-cup/resolve-opta-from-html";

describe("resolve-opta-from-html", () => {
  it("finds Germany vs Curaçao from committed HTML", () => {
    clearOptaParseIndexCache();
    const parsed = findOptaParsedMatch({
      date: "2026-06-14",
      homeName: "Curaçao",
      awayName: "Germany",
    });
    expect(parsed?.homeTeamName).toBe("Germany");
    expect(parsed?.awayTeamName).toBe("Curaçao");
    expect(parsed?.homeGoals).toBe(7);
    expect(parsed?.awayGoals).toBe(1);
  });

  it("finds United States vs Paraguay from committed HTML", () => {
    clearOptaParseIndexCache();
    const parsed = findOptaParsedMatch({
      date: "2026-06-12",
      homeName: "Paraguay",
      awayName: "United States",
    });
    expect(parsed?.homeTeamName).toBe("USA");
    expect(parsed?.awayTeamName).toBe("Paraguay");
    expect(parsed?.homeGoals).toBe(4);
    expect(parsed?.awayGoals).toBe(1);
  });
});

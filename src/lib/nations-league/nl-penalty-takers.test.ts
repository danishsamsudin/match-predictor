import { describe, expect, it } from "vitest";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";
import {
  listNlPenaltyTakerCoverage,
  resolveNationalPenaltyTaker,
} from "@/lib/nations-league/nl-penalty-takers";

describe("resolveNationalPenaltyTaker", () => {
  it("resolves Georgia to Kvaratskhelia", () => {
    expect(resolveNationalPenaltyTaker("Georgia", { preferNlMap: true })).toMatch(
      /Kvaratskhelia/i
    );
  });

  it("covers every Nations League 2026 nation", () => {
    const missing: string[] = [];
    for (const team of NATIONS_LEAGUE_2026_TEAMS) {
      const taker = resolveNationalPenaltyTaker(team.name, { preferNlMap: true });
      if (!taker) missing.push(team.name);
    }
    expect(missing).toEqual([]);
  });

  it("accepts common aliases", () => {
    expect(resolveNationalPenaltyTaker("Turkey", { preferNlMap: true })).toMatch(
      /Çalhanoğlu|Calhanoglu/i
    );
    expect(
      resolveNationalPenaltyTaker("Bosnia and Herzegovina", { preferNlMap: true })
    ).toMatch(/Džeko|Dzeko/i);
  });

  it("reports full coverage count", () => {
    const coverage = listNlPenaltyTakerCoverage();
    expect(coverage.teamCount).toBe(NATIONS_LEAGUE_2026_TEAMS.length);
  });
});

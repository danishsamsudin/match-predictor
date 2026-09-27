import { describe, expect, it } from "vitest";
import { loadNationsLeagueScheduleFixtures } from "@/lib/nations-league/schedule-fixtures";

describe("Nations League schedule fixtures", () => {
  it("includes all eight 2026-09-27 matchday fixtures", () => {
    const today = loadNationsLeagueScheduleFixtures().filter((f) =>
      f.date.startsWith("2026-09-27")
    );
    expect(today).toHaveLength(8);
    expect(today.map((f) => `${f.home.name} vs ${f.away.name}`)).toEqual(
      expect.arrayContaining([
        "Lithuania vs Azerbaijan",
        "Gibraltar vs Andorra",
        "Germany vs Greece",
        "Norway vs Portugal",
      ])
    );
  });
});

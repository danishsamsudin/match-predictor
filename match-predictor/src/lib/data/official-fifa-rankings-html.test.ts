import { describe, expect, it } from "vitest";
import { readOfficialFifaRankingsHtmlRows } from "@/lib/data/official-fifa-rankings-html";

describe("readOfficialFifaRankingsHtmlRows", () => {
  it("loads Mexico at FIFA rank 15 from the 2026 HTML snapshot", () => {
    const rows = readOfficialFifaRankingsHtmlRows();
    expect(rows.length).toBeGreaterThan(200);
    const mexico = rows.find((r) => r.sofascoreTeamId === 4781);
    expect(mexico?.teamName).toBe("Mexico");
    expect(mexico?.rank).toBe(15);
    expect(mexico?.dataSource).toBe("fifa");
  });
});

import { describe, expect, it } from "vitest";
import { loadOfficialFifaRankingsRows } from "@/lib/data/official-fifa-rankings-snapshot";

describe("loadOfficialFifaRankingsRows", () => {
  it("loads Mexico at FIFA rank 15 and Netherlands above Sweden", () => {
    const rows = loadOfficialFifaRankingsRows();
    expect(rows.length).toBeGreaterThan(200);
    const mexico = rows.find((r) => r.sofascoreTeamId === 4781);
    expect(mexico?.teamName).toBe("Mexico");
    expect(mexico?.rank).toBe(15);
    expect(mexico?.totalPoints).toBeCloseTo(1684.13, 2);
    expect(mexico?.dataSource).toBe("fifa");

    const netherlands = rows.find((r) => r.sofascoreTeamId === 4705);
    const sweden = rows.find((r) => r.sofascoreTeamId === 4688);
    expect(netherlands!.rank).toBeLessThan(sweden!.rank);
    expect(netherlands!.totalPoints).toBeGreaterThan(1600);
  });
});

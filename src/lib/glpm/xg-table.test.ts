import { describe, expect, it } from "vitest";
import {
  buildXgTableRows,
  classifyXgSource,
  leagueIsMostlyProxy,
  perGame,
  xgDiffFromTotals,
  xgScoreFromTotals,
  type GlpmXgTableRow,
  type SeasonXgAgg,
} from "@/lib/glpm/xg-table";

describe("xgScoreFromTotals", () => {
  it("is xGF minus xGA", () => {
    expect(xgScoreFromTotals(12.5, 8.0)).toBeCloseTo(4.5);
    expect(xgScoreFromTotals(5, 9)).toBeCloseTo(-4);
  });
});

describe("xgDiffFromTotals", () => {
  it("is actual GD minus xG Score", () => {
    // GF 15, GA 8 => GD 7; xGF 12, xGA 10 => xG Score 2; Diff 5
    expect(
      xgDiffFromTotals({ gf: 15, ga: 8, xgf: 12, xga: 10 })
    ).toBeCloseTo(5);
  });

  it("is negative when underperforming expected GD", () => {
    // GD 0, xG Score +4 => Diff -4
    expect(
      xgDiffFromTotals({ gf: 10, ga: 10, xgf: 14, xga: 10 })
    ).toBeCloseTo(-4);
  });
});

describe("perGame", () => {
  it("divides by played", () => {
    expect(perGame(20, 10)).toBeCloseTo(2);
    expect(perGame(7.5, 5)).toBeCloseTo(1.5);
  });

  it("returns null when played is zero or invalid", () => {
    expect(perGame(10, 0)).toBeNull();
    expect(perGame(10, -1)).toBeNull();
  });
});

describe("classifyXgSource", () => {
  it("classifies provider, proxy, mixed, and none", () => {
    expect(classifyXgSource(5, 0)).toBe("provider");
    expect(classifyXgSource(0, 3)).toBe("proxy");
    expect(classifyXgSource(2, 2)).toBe("mixed");
    expect(classifyXgSource(0, 0)).toBe("none");
  });
});

describe("buildXgTableRows", () => {
  it("joins standings with xG and ranks by xG Score desc", () => {
    const standings = [
      {
        teamSmId: 1,
        teamName: "Alpha",
        played: 10,
        goalsFor: 18,
        goalsAgainst: 8,
        rank: 2,
      },
      {
        teamSmId: 2,
        teamName: "Beta",
        played: 10,
        goalsFor: 12,
        goalsAgainst: 10,
        rank: 1,
      },
      {
        teamSmId: 3,
        teamName: "Gamma",
        played: 10,
        goalsFor: 9,
        goalsAgainst: 14,
        rank: 3,
      },
    ];
    const xgByTeam = new Map<number, SeasonXgAgg>([
      [1, { teamSmId: 1, xgf: 14, xga: 10, providerN: 10, proxyN: 0 }],
      [2, { teamSmId: 2, xgf: 16, xga: 8, providerN: 10, proxyN: 0 }],
      [3, { teamSmId: 3, xgf: 8, xga: 15, providerN: 0, proxyN: 10 }],
    ]);

    const rows = buildXgTableRows(standings, xgByTeam);
    expect(rows.map((r) => r.teamSmId)).toEqual([2, 1, 3]);
    expect(rows[0]!.xgScore).toBeCloseTo(8);
    expect(rows[0]!.tablePos).toBe(1);
    // Beta: GD 2, xG Score 8 => Diff -6
    expect(rows[0]!.diff).toBeCloseTo(-6);
    // Alpha: GD 10, xG Score 4 => Diff 6
    expect(rows[1]!.diff).toBeCloseTo(6);
    expect(rows[2]!.xgSource).toBe("proxy");
  });

  it("handles missing xG aggregates as none with zero totals", () => {
    const rows = buildXgTableRows(
      [
        {
          teamSmId: 9,
          teamName: "No Xg",
          played: 2,
          goalsFor: 1,
          goalsAgainst: 1,
          rank: 1,
        },
      ],
      new Map()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.xgSource).toBe("none");
    expect(rows[0]!.xgf).toBe(0);
    expect(rows[0]!.xgScore).toBe(0);
  });
});

describe("leagueIsMostlyProxy", () => {
  it("is true when >= 60% of teams with xG are proxy-only", () => {
    const rows: GlpmXgTableRow[] = [
      {
        teamSmId: 1,
        teamName: "A",
        played: 1,
        xgf: 1,
        xga: 1,
        gf: 1,
        ga: 1,
        xgScore: 0,
        diff: 0,
        tablePos: 1,
        xgSource: "proxy",
      },
      {
        teamSmId: 2,
        teamName: "B",
        played: 1,
        xgf: 1,
        xga: 1,
        gf: 1,
        ga: 1,
        xgScore: 0,
        diff: 0,
        tablePos: 2,
        xgSource: "proxy",
      },
      {
        teamSmId: 3,
        teamName: "C",
        played: 1,
        xgf: 1,
        xga: 1,
        gf: 1,
        ga: 1,
        xgScore: 0,
        diff: 0,
        tablePos: 3,
        xgSource: "provider",
      },
    ];
    expect(leagueIsMostlyProxy(rows)).toBe(true);
  });

  it("ignores teams with no xG", () => {
    const rows: GlpmXgTableRow[] = [
      {
        teamSmId: 1,
        teamName: "A",
        played: 1,
        xgf: 0,
        xga: 0,
        gf: 1,
        ga: 1,
        xgScore: 0,
        diff: 0,
        tablePos: 1,
        xgSource: "none",
      },
      {
        teamSmId: 2,
        teamName: "B",
        played: 1,
        xgf: 1,
        xga: 1,
        gf: 1,
        ga: 1,
        xgScore: 0,
        diff: 0,
        tablePos: 2,
        xgSource: "provider",
      },
    ];
    expect(leagueIsMostlyProxy(rows)).toBe(false);
  });
});

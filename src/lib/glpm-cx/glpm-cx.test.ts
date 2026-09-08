import { describe, expect, it } from "vitest";
import { applyCxToXg, cxRestDaysMultiplier, cxTravelMultiplier } from "@/lib/glpm-cx/apply-cx";
import { deriveMarketsFromScoreMatrix, europeanHandicapFromMatrix, inferStyleLabels, sliceScoreMatrix, styleMatchupBadges } from "@/lib/glpm-cx/derived-markets";
import { predictMatch } from "@/lib/glpm/engine";
import { GLPM_CX_GLOSSARY, glossaryTipBody } from "@/lib/glpm-cx/glossary";
import { poissonOverProb } from "@/lib/glpm-cx/satellites/player-props";
import { EMPTY_SHOT_MARKETS } from "@/lib/glpm-cx/satellites/shot-markets";
import { runSeasonMonteCarlo } from "@/lib/glpm-cx/satellites/season-sim";
import { buildMatchVsStyleRows } from "@/lib/glpm-cx/vs-style";

describe("glpm-cx applyCxToXg", () => {
  it("leaves xG unchanged when all multipliers are 1", () => {
    const out = applyCxToXg({
      homeXg: 1.5,
      awayXg: 1.1,
      home: {
        restDays: 7,
        travelKm: 0,
        restMult: 1,
        travelMult: 1,
        altitudeMult: 1,
        weatherMult: 1,
        lineupMult: 1,
      },
      away: {
        restDays: 7,
        travelKm: 0,
        restMult: 1,
        travelMult: 1,
        altitudeMult: 1,
        weatherMult: 1,
        lineupMult: 1,
      },
    });
    expect(out.homeXg).toBeCloseTo(1.5, 5);
    expect(out.awayXg).toBeCloseTo(1.1, 5);
  });

  it("scales xG with rest and travel multipliers", () => {
    const out = applyCxToXg({
      homeXg: 2,
      awayXg: 2,
      home: {
        restDays: 1,
        travelKm: 0,
        restMult: 0.9,
        travelMult: 1,
        altitudeMult: 1,
        weatherMult: 1,
        lineupMult: 1,
      },
      away: {
        restDays: 7,
        travelKm: 2000,
        restMult: 1,
        travelMult: 0.95,
        altitudeMult: 1,
        weatherMult: 1,
        lineupMult: 1,
      },
    });
    expect(out.homeXg).toBeCloseTo(1.8, 5);
    expect(out.awayXg).toBeCloseTo(1.9, 5);
  });

  it("computes rest/travel helpers", () => {
    expect(cxRestDaysMultiplier(7)).toBe(1);
    expect(cxRestDaysMultiplier(1)).toBeLessThan(1);
    expect(cxRestDaysMultiplier(125)).toBeLessThan(1);
    expect(cxTravelMultiplier(100)).toBe(1);
    expect(cxTravelMultiplier(2000)).toBeLessThan(1);
  });
});

describe("glpm-cx derived markets", () => {
  it("derives DC / AH / fair odds from a score matrix", () => {
    const pred = predictMatch(1.6, 1.1);
    const derived = deriveMarketsFromScoreMatrix({
      scoreMatrix: pred.scoreMatrix,
      homeWin: pred.homeWin,
      draw: pred.draw,
      awayWin: pred.awayWin,
      bttsYes: pred.bttsYes,
      bttsNo: pred.bttsNo,
      overUnder: pred.overUnder,
    });
    expect(derived.doubleChance.homeOrDraw).toBeCloseTo(pred.homeWin + pred.draw, 5);
    expect(derived.asianHandicap.length).toBeGreaterThan(0);
    expect(derived.fairOdds.homeWin).toBeGreaterThan(1);
    expect(derived.topScorelines[0]?.probability).toBeGreaterThan(0);
  });

  it("omits european handicap 0 and keeps Toto lines", () => {
    const pred = predictMatch(1.6, 1.1);
    const derived = deriveMarketsFromScoreMatrix({
      scoreMatrix: pred.scoreMatrix,
      homeWin: pred.homeWin,
      draw: pred.draw,
      awayWin: pred.awayWin,
      bttsYes: pred.bttsYes,
      bttsNo: pred.bttsNo,
      overUnder: pred.overUnder,
    });
    expect(derived.europeanHandicap.map((l) => l.line)).toEqual([-3, -2, -1, 1, 2, 3]);
    const eh0 = europeanHandicapFromMatrix(pred.scoreMatrix, 0);
    expect(eh0.home).toBeCloseTo(pred.homeWin, 5);
    expect(eh0.draw).toBeCloseTo(pred.draw, 5);
    expect(eh0.away).toBeCloseTo(pred.awayWin, 5);
  });

  it("european handicap home -1 requires a two-goal win", () => {
    // EH -1: margin = h - a - 1 → 2-0 home, 1-0 and 2-1 draw, else away
    const matrix = [
      [0.1, 0.05, 0.02],
      [0.2, 0.1, 0.03],
      [0.25, 0.1, 0.05],
    ];
    const eh = europeanHandicapFromMatrix(matrix, -1);
    expect(eh.home).toBeCloseTo(0.25, 5);
    expect(eh.draw).toBeCloseTo(0.3, 5);
    expect(eh.away).toBeCloseTo(0.35, 5);
  });

  it("match goal ranges partition; team bands follow Toto", () => {
    const pred = predictMatch(1.6, 1.1);
    const derived = deriveMarketsFromScoreMatrix({
      scoreMatrix: pred.scoreMatrix,
      homeWin: pred.homeWin,
      draw: pred.draw,
      awayWin: pred.awayWin,
      bttsYes: pred.bttsYes,
      bttsNo: pred.bttsNo,
      overUnder: pred.overUnder,
    });
    const matchSum = derived.goalRanges.match.reduce((a, b) => a + b.probability, 0);
    expect(matchSum).toBeCloseTo(1, 5);
    expect(derived.goalRanges.home.map((b) => b.label)).toEqual([
      "0",
      "1-2",
      "1-3",
      "2-3",
      "4+",
    ]);
    expect(derived.goalRanges.away.map((b) => b.label)).toEqual([
      "0",
      "1-2",
      "1-3",
      "2-3",
      "4+",
    ]);
    let match01 = 0;
    let homeZero = 0;
    for (let h = 0; h < pred.scoreMatrix.length; h++) {
      for (let a = 0; a < (pred.scoreMatrix[h]?.length ?? 0); a++) {
        if (h + a <= 1) match01 += pred.scoreMatrix[h][a];
        if (h === 0) homeZero += pred.scoreMatrix[h][a];
      }
    }
    expect(derived.goalRanges.match.find((b) => b.label === "0-1")!.probability).toBeCloseTo(
      match01,
      5
    );
    expect(derived.goalRanges.home.find((b) => b.label === "0")!.probability).toBeCloseTo(
      homeZero,
      5
    );
  });

  it("builds style matchup badges", () => {
    const badges = styleMatchupBadges(["high_press"], ["low_block"]);
    expect(badges.some((b) => b.label.includes("High press"))).toBe(true);
  });

  it("infers style labels from ratings when snapshots are empty", () => {
    const labels = inferStyleLabels({
      labels: [],
      ratings: {
        attack: 70,
        defence: 55,
        goalkeeper: 60,
        build_up: 68,
        possession: 48,
        pressing: 72,
        finishing: 61,
      },
      avgPossession: null,
      avgPpda: null,
    });
    expect(labels).toContain("high_press");
    expect(labels.length).toBeGreaterThan(0);
  });

  it("slices the score matrix to a 5x5 display grid", () => {
    const pred = predictMatch(1.6, 1.1);
    const { grid, tailMass } = sliceScoreMatrix(pred.scoreMatrix, 4);
    expect(grid).toHaveLength(5);
    expect(grid[0]).toHaveLength(5);
    expect(tailMass).toBeGreaterThanOrEqual(0);
    const displayed = grid.flat().reduce((a, b) => a + b, 0);
    expect(displayed + tailMass).toBeCloseTo(
      pred.scoreMatrix.flat().reduce((a, b) => a + b, 0),
      5
    );
  });
});

describe("understat finishing table", () => {
  it("maps Newcastle and Bournemouth to 2025/26 season xG", async () => {
    const { lookupUnderstatSeasonRow } = await import(
      "@/lib/glpm/understat-season-table"
    );
    const newcastle = lookupUnderstatSeasonRow("Newcastle United");
    const bournemouth = lookupUnderstatSeasonRow("AFC Bournemouth");
    expect(newcastle?.goals).toBe(53);
    expect(newcastle?.xg).toBeCloseTo(60.61, 2);
    expect(bournemouth?.goals).toBe(58);
    expect(bournemouth?.xg).toBeCloseTo(66.83, 2);
  });
});

describe("shared ceiling helper", () => {
  it("treats identical 100 ratings as no signal", async () => {
    const { isSharedCeiling } = await import("@/lib/glpm/load-insight-ratings");
    expect(isSharedCeiling(100, 100)).toBe(true);
    expect(isSharedCeiling(60.8, 46.7)).toBe(false);
  });
});

describe("glpm-cx glossary", () => {
  it("covers required insight keys", () => {
    const keys = Object.keys(GLPM_CX_GLOSSARY);
    expect(keys).toContain("homeAwayXg");
    expect(keys).toContain("valueEdge");
    expect(keys).toContain("proxyHonesty");
    expect(keys).toContain("europeanHandicap");
    expect(keys).toContain("goalRanges");
    expect(keys).toContain("shotMarkets");
    expect(glossaryTipBody("modelBadge")).toContain("GLPM-CX");
  });
});

describe("glpm-cx satellites", () => {
  it("poisson over probs increase with lambda", () => {
    expect(poissonOverProb(0.4, 0.5)).toBeLessThan(poissonOverProb(2.2, 0.5));
  });

  it("poisson over works for high shot lines", () => {
    expect(poissonOverProb(24, 22.5)).toBeGreaterThan(0.5);
    expect(poissonOverProb(24, 22.5)).toBeLessThan(1);
    expect(poissonOverProb(8, 20.5)).toBeLessThan(0.01);
  });

  it("empty shot markets stub has zero totals and line pairs", () => {
    expect(EMPTY_SHOT_MARKETS.totalShots).toBe(0);
    expect(EMPTY_SHOT_MARKETS.shotsOverUnder.length).toBe(4);
    expect(EMPTY_SHOT_MARKETS.sotOver.length).toBe(4);
    expect(EMPTY_SHOT_MARKETS.shotsOverUnder[0]?.over).toBe(0);
    expect(EMPTY_SHOT_MARKETS.sotOver[0]?.over).toBe(0);
  });

  it("season monte carlo returns probabilities summing roughly per team set", () => {
    const result = runSeasonMonteCarlo({
      iterations: 500,
      standings: [
        { teamSmId: 1, points: 40 },
        { teamSmId: 2, points: 38 },
        { teamSmId: 3, points: 30 },
        { teamSmId: 4, points: 20 },
      ],
      fixtures: [
        { homeTeamSmId: 1, awayTeamSmId: 2, homeWin: 0.45, draw: 0.28, awayWin: 0.27 },
        { homeTeamSmId: 3, awayTeamSmId: 4, homeWin: 0.5, draw: 0.25, awayWin: 0.25 },
      ],
    });
    expect(result.iterations).toBe(500);
    const titleSum = Object.values(result.titleProb).reduce((a, b) => a + b, 0);
    expect(titleSum).toBeCloseTo(1, 1);
  });
});

describe("glpm-cx vs-style builder", () => {
  it("emits rows for each opponent style", () => {
    const rows = buildMatchVsStyleRows(
      1,
      10,
      20,
      { xg: 1.2, shots: 12 },
      { xg: 0.8, shots: 8 },
      ["low_block", "high_press"],
      ["high_possession"]
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.match_sm_id === 1)).toBe(true);
  });
});

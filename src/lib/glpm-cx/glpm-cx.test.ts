import { describe, expect, it } from "vitest";
import { applyCxToXg, cxRestDaysMultiplier, cxTravelMultiplier } from "@/lib/glpm-cx/apply-cx";
import { deriveMarketsFromScoreMatrix, styleMatchupBadges } from "@/lib/glpm-cx/derived-markets";
import { predictMatch } from "@/lib/glpm/engine";
import { GLPM_CX_GLOSSARY, glossaryTipBody } from "@/lib/glpm-cx/glossary";
import { poissonOverProb } from "@/lib/glpm-cx/satellites/player-props";
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

  it("builds style matchup badges", () => {
    const badges = styleMatchupBadges(["high_press"], ["low_block"]);
    expect(badges.some((b) => b.label.includes("High press"))).toBe(true);
  });
});

describe("glpm-cx glossary", () => {
  it("covers required insight keys", () => {
    const keys = Object.keys(GLPM_CX_GLOSSARY);
    expect(keys).toContain("homeAwayXg");
    expect(keys).toContain("valueEdge");
    expect(keys).toContain("proxyHonesty");
    expect(glossaryTipBody("modelBadge")).toContain("GLPM-CX");
  });
});

describe("glpm-cx satellites", () => {
  it("poisson over probs increase with lambda", () => {
    expect(poissonOverProb(0.4, 0.5)).toBeLessThan(poissonOverProb(2.2, 0.5));
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

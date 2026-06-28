import { describe, expect, it } from "vitest";
import { confederationStrengthModifier } from "@/lib/world-cup/confederation-strength";
import {
  clampInternationalBaselineXg,
  computeInternationalRatesFromMatches,
  internationalMatchTierWeight,
  pullInternationalXgTowardFifaAnchor,
  resolveInternationalExpectedGoals,
  resolveInternationalScoreCorrelation,
} from "@/lib/world-cup/international-strength";
import {
  attenuateRhoForExpectedGoalGap,
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
} from "@/lib/world-cup/score-grid";

const neutralRates = {
  attack: 1,
  defense: 1,
  sample: { goalsFor: 1.25, goalsAgainst: 1.25, effectiveWeight: 0, matchCount: 0 },
};

describe("internationalMatchTierWeight", () => {
  it("down-weights friendlies vs competitive fixtures", () => {
    expect(internationalMatchTierWeight("Friendlies (M)")).toBeLessThan(
      internationalMatchTierWeight("WCQ — CAF (M)")
    );
  });
});

describe("resolveInternationalExpectedGoals", () => {
  it("does not crush a top-40 vs top-60 gap into extreme xG", () => {
    const homeRates = computeInternationalRatesFromMatches("mx", [
      {
        date: "2025-10-01",
        home_team_id: "mx",
        away_team_id: "x",
        home_goals: 2,
        away_goals: 0,
        competition: "WCQ — CONCACAF (M)",
      },
      {
        date: "2025-06-01",
        home_team_id: "mx",
        away_team_id: "y",
        home_goals: 1,
        away_goals: 1,
        competition: "Friendlies (M)",
      },
    ]);
    const awayRates = computeInternationalRatesFromMatches("za", [
      {
        date: "2025-09-01",
        home_team_id: "za",
        away_team_id: "z",
        home_goals: 1,
        away_goals: 0,
        competition: "WCQ — CAF (M)",
      },
      {
        date: "2025-03-01",
        home_team_id: "a",
        away_team_id: "za",
        home_goals: 2,
        away_goals: 1,
        competition: "Friendlies (M)",
      },
    ]);

    const { homeXg, awayXg } = resolveInternationalExpectedGoals({
      homeTeamId: 4781,
      awayTeamId: 4736,
      homeName: "Mexico",
      awayName: "South Africa",
      homeRates,
      awayRates,
    });

    expect(homeXg).toBeGreaterThan(awayXg);
    expect(homeXg).toBeGreaterThan(1.15);
    expect(awayXg).toBeLessThan(1.35);
  });

  it("pulls compressed post-shock xG back toward FIFA for mismatches", () => {
    const pulled = pullInternationalXgTowardFifaAnchor(1.05, 1.22, {
      homeTeamId: 4739,
      awayTeamId: 4481,
      homeName: "Senegal",
      awayName: "France",
    });
    expect(pulled.awayXg - pulled.homeXg).toBeGreaterThan(0.75);
    expect(pulled.awayXg).toBeGreaterThan(1.55);
  });

  it("spreads xG for top-tier vs strong contender (France vs Senegal)", () => {
    const { homeXg, awayXg } = resolveInternationalExpectedGoals({
      homeTeamId: 4481,
      awayTeamId: 4739,
      homeName: "France",
      awayName: "Senegal",
      homeRates: neutralRates,
      awayRates: neutralRates,
    });

    expect(homeXg).toBeGreaterThan(1.8);
    expect(awayXg).toBeLessThan(0.95);
    const rho = attenuateRhoForExpectedGoalGap(
      resolveInternationalScoreCorrelation(homeXg, awayXg, -188),
      homeXg,
      awayXg
    );
    const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, false);
    expect(outcomes.homeWin).toBeGreaterThan(0.52);
    const { cells } = buildGuardedScoreMatrix(homeXg, awayXg, rho, false);
    const top = cells.reduce((best, c) => (c.probability > best.probability ? c : best));
    expect(`${top.home}-${top.away}`).not.toBe("1-1");
  });

  it("preserves large FIFA gaps for elite vs minnow xG", () => {
    const { homeXg, awayXg } = resolveInternationalExpectedGoals({
      homeTeamId: 4481,
      awayTeamId: 7229,
      homeName: "France",
      awayName: "Haiti",
      homeRates: neutralRates,
      awayRates: neutralRates,
    });

    expect(homeXg).toBeGreaterThan(2.55);
    expect(awayXg).toBeLessThan(0.85);
    const rho = attenuateRhoForExpectedGoalGap(
      resolveInternationalScoreCorrelation(homeXg, awayXg),
      homeXg,
      awayXg
    );
    const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, false);
    expect(outcomes.homeWin).toBeGreaterThan(0.72);
    const { cells } = buildGuardedScoreMatrix(homeXg, awayXg, rho, false);
    const top = cells.reduce((best, c) => (c.probability > best.probability ? c : best));
    expect(top.home).toBeGreaterThan(top.away);
    expect(outcomes.draw).toBeLessThan(0.2);
  });
});

describe("resolveInternationalScoreCorrelation", () => {
  it("yields realistic draw mass for balanced internationals", () => {
    const homeXg = 1.45;
    const awayXg = 1.05;
    const rho = attenuateRhoForExpectedGoalGap(
      resolveInternationalScoreCorrelation(homeXg, awayXg),
      homeXg,
      awayXg
    );
    expect(rho).toBeLessThanOrEqual(0.05);
    const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, false);
    expect(outcomes.draw).toBeGreaterThan(0.18);
    expect(outcomes.draw).toBeLessThan(0.32);
    expect(outcomes.homeWin).toBeLessThan(0.72);
  });
});

describe("resolveInternationalScoreCorrelation", () => {
  it("varies smoothly with total xG without jumps above 0.02", () => {
    let prev = resolveInternationalScoreCorrelation(1.0, 1.0);
    for (let total = 2.0; total <= 3.5; total += 0.05) {
      const rho = resolveInternationalScoreCorrelation(total / 2, total / 2);
      expect(Math.abs(rho - prev)).toBeLessThan(0.021);
      prev = rho;
    }
  });

  it("is less negative when total xG is high", () => {
    const low = resolveInternationalScoreCorrelation(0.9, 0.8);
    const high = resolveInternationalScoreCorrelation(1.6, 1.7);
    expect(high).toBeGreaterThan(low);
  });
});

describe("softClampXg", () => {
  it("approaches cap without hard wall when softness is positive", () => {
    const hard = clampInternationalBaselineXg(6.5, 0);
    const soft = clampInternationalBaselineXg(6.5, 0.12);
    expect(hard).toBe(5);
    expect(soft).toBeGreaterThan(5);
    expect(soft).toBeLessThan(6.5);
  });
});

describe("confederationStrengthModifier", () => {
  it("deflates goals scored vs weak-confederation opponents in match history", () => {
    const matches = [
      {
        date: "2025-10-01",
        home_team_id: "cw",
        away_team_id: "x",
        home_goals: 7,
        away_goals: 0,
        competition: "WCQ — CONCACAF (M)",
      },
      {
        date: "2025-06-01",
        home_team_id: "cw",
        away_team_id: "y",
        home_goals: 3,
        away_goals: 1,
        competition: "WCQ — CONCACAF (M)",
      },
    ];
    const unweighted = computeInternationalRatesFromMatches("cw", matches, Date.now());
    const noComp = [
      {
        date: "2025-10-01",
        home_team_id: "cw",
        away_team_id: "x",
        home_goals: 7,
        away_goals: 0,
        competition: null,
      },
    ];
    const withoutOppPool = computeInternationalRatesFromMatches("cw", noComp, Date.now());
    expect(confederationStrengthModifier("CONCACAF")).toBe(0.68);
    expect(unweighted.sample.goalsFor).toBeLessThan(7);
    expect(unweighted.sample.goalsFor).toBeLessThan(
      withoutOppPool.sample.goalsFor + 0.01
    );
  });
});

describe("mismatched international score grid", () => {
  it("does not peak on 1-1 when FIFA gap is large but post-shock xG is compressed", () => {
    const homeXg = 0.75;
    const awayXg = 1.65;
    const rho = attenuateRhoForExpectedGoalGap(
      resolveInternationalScoreCorrelation(homeXg, awayXg, -188),
      homeXg,
      awayXg
    );
    const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, false);
    expect(outcomes.predictedAway).toBeGreaterThan(outcomes.predictedHome);
    expect(`${outcomes.predictedHome}-${outcomes.predictedAway}`).not.toBe("1-1");
  });

  it("does not peak on 1-1 when the stronger side has a clear xG edge", () => {
    const homeXg = 0.85;
    const awayXg = 1.73;
    const rho = attenuateRhoForExpectedGoalGap(
      resolveInternationalScoreCorrelation(homeXg, awayXg),
      homeXg,
      awayXg
    );
    const { cells } = buildGuardedScoreMatrix(homeXg, awayXg, rho, false);
    const top = cells.reduce((best, c) => (c.probability > best.probability ? c : best));
    expect(top.away).toBeGreaterThan(top.home);
    expect(`${top.home}-${top.away}`).not.toBe("1-1");
  });

  it("attenuates rho toward zero as xG gap widens", () => {
    const balanced = resolveInternationalScoreCorrelation(1.4, 1.2);
    const lopsided = resolveInternationalScoreCorrelation(2.4, 0.75);
    const tight = attenuateRhoForExpectedGoalGap(balanced, 1.4, 1.2);
    const wide = attenuateRhoForExpectedGoalGap(lopsided, 2.4, 0.75);
    expect(Math.abs(wide)).toBeLessThanOrEqual(Math.abs(tight));
    expect(Math.abs(lopsided)).toBeLessThanOrEqual(Math.abs(balanced));
  });

  it("attenuates draw inflation as xG gap widens under continuous rho", () => {
    const base = resolveInternationalScoreCorrelation(1.12, 1.83);
    const rho = attenuateRhoForExpectedGoalGap(base, 1.12, 1.83);
    expect(Math.abs(rho)).toBeLessThanOrEqual(Math.abs(base) + 1e-9);
    expect(base).toBeGreaterThan(resolveInternationalScoreCorrelation(1.0, 1.0));
  });
});

import { describe, expect, it } from "vitest";
import { confederationStrengthModifier } from "@/lib/world-cup/confederation-strength";
import {
  computeInternationalRatesFromMatches,
  internationalMatchTierWeight,
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

  it("preserves large FIFA gaps for elite vs minnow xG", () => {
    const { homeXg, awayXg } = resolveInternationalExpectedGoals({
      homeTeamId: 4481,
      awayTeamId: 7229,
      homeName: "France",
      awayName: "Haiti",
      homeRates: neutralRates,
      awayRates: neutralRates,
    });

    expect(homeXg).toBeGreaterThan(2.4);
    expect(awayXg).toBeLessThan(1);
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
    expect(rho).toBeLessThan(0);
    const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, false);
    expect(outcomes.draw).toBeGreaterThan(0.18);
    expect(outcomes.draw).toBeLessThan(0.32);
    expect(outcomes.homeWin).toBeLessThan(0.72);
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
    expect(unweighted.attack).toBeLessThan(withoutOppPool.attack);
    expect(unweighted.sample.goalsFor).toBeLessThan(7);
  });
});

describe("mismatched international score grid", () => {
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
    const base = resolveInternationalScoreCorrelation(2.4, 0.75);
    const tight = attenuateRhoForExpectedGoalGap(base, 1.4, 1.2);
    const wide = attenuateRhoForExpectedGoalGap(base, 2.4, 0.75);
    expect(Math.abs(wide)).toBeLessThan(Math.abs(tight));
    expect(Math.abs(wide)).toBeLessThan(Math.abs(base));
  });

  it("suppresses 1-1 tau boost for Germany-class xG gaps (~0.7)", () => {
    const base = resolveInternationalScoreCorrelation(1.12, 1.83);
    const rho = attenuateRhoForExpectedGoalGap(base, 1.12, 1.83);
    expect(1 - rho).toBeLessThan(1.09);
    expect(1 - rho).toBeGreaterThan(1.0);
  });
});

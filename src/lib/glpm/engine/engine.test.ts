/**
 * Vitest parity checks for the TypeScript GLPM engine vs Python Chapter 11/12.
 */

import { describe, expect, it } from "vitest";
import {
  buildScoreMatrix,
  DEFAULT_HOME_ADVANTAGE,
  DEFAULT_MU_XG,
  derive1x2,
  deriveBtts,
  deriveOverUnder,
  dixonColesTau,
  estimateExpectedGoals,
  predictMatch,
  PRIMARY_ORDER,
  scoreProbability,
} from "./index";

function avgVector(overrides: Record<string, number> = {}) {
  const base = Object.fromEntries(PRIMARY_ORDER.map((k) => [k, 60]));
  return { ...base, ...overrides };
}

describe("GLPM xG engine (TS)", () => {
  it("equal average vectors on neutral venue ≈ μ", () => {
    const result = estimateExpectedGoals(avgVector(), avgVector(), {
      isNeutralVenue: true,
    });
    expect(result.homeXg).toBeCloseTo(DEFAULT_MU_XG, 6);
    expect(result.awayXg).toBeCloseTo(DEFAULT_MU_XG, 6);
    expect(result.modelVersion).toBe("glpm_xg_v1");
  });

  it("strong home attack raises home xG", () => {
    const result = estimateExpectedGoals(
      avgVector({ attack: 85, finishing: 80 }),
      avgVector({ defence: 40, goalkeeper: 45 }),
      { isNeutralVenue: true }
    );
    expect(result.homeXg).toBeGreaterThan(result.awayXg);
    const home = result.interactions.home as { attack_defence: number };
    expect(home.attack_defence).toBeGreaterThan(0);
  });

  it("home advantage boosts home xG by configured multiplier", () => {
    const vectors = [avgVector(), avgVector()] as const;
    const neutral = estimateExpectedGoals(...vectors, { isNeutralVenue: true });
    const homeFixture = estimateExpectedGoals(...vectors, {
      isNeutralVenue: false,
    });
    expect(homeFixture.homeXg).toBeCloseTo(
      neutral.homeXg * DEFAULT_HOME_ADVANTAGE,
      6
    );
    expect(homeFixture.awayXg).toBeCloseTo(neutral.awayXg, 6);
  });
});

describe("GLPM Dixon–Coles predictions (TS)", () => {
  it("score matrix is 10×10 and sums to 1", () => {
    const matrix = buildScoreMatrix(1.5, 1.2);
    expect(matrix.length).toBe(10);
    expect(matrix[0].length).toBe(10);
    const sum = matrix.flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it("1X2 probabilities sum to 1", () => {
    const result = predictMatch(1.6, 1.1);
    expect(result.homeWin + result.draw + result.awayWin).toBeCloseTo(1, 9);
  });

  it("higher home xG raises home win", () => {
    const homeFav = predictMatch(2.2, 0.8);
    const awayFav = predictMatch(0.8, 2.2);
    expect(homeFav.homeWin).toBeGreaterThan(homeFav.awayWin);
    expect(awayFav.awayWin).toBeGreaterThan(awayFav.homeWin);
    expect(homeFav.homeWin).toBeGreaterThan(awayFav.homeWin);
  });

  it("negative rho inflates low-score draws vs rho=0", () => {
    const hx = 1.3;
    const ax = 1.2;
    const withRho = buildScoreMatrix(hx, ax, { rho: -0.13 });
    const noRho = buildScoreMatrix(hx, ax, { rho: 0 });
    expect(withRho[0][0]).toBeGreaterThan(noRho[0][0]);
    expect(withRho[1][1]).toBeGreaterThan(noRho[1][1]);
    expect(dixonColesTau(2, 1, hx, ax, -0.13)).toBe(1);
    expect(scoreProbability(2, 1, hx, ax, -0.13)).toBeCloseTo(
      scoreProbability(2, 1, hx, ax, 0),
      12
    );
  });

  it("O/U and BTTS consistent with matrix", () => {
    const matrix = buildScoreMatrix(1.7, 1.4, { rho: -0.13 });
    const ou = deriveOverUnder(matrix);
    const btts = deriveBtts(matrix);
    expect(Object.keys(ou).sort()).toEqual(["0.5", "1.5", "2.5", "3.5", "4.5"]);
    for (const probs of Object.values(ou)) {
      expect(probs.over + probs.under).toBeCloseTo(1, 9);
    }
    let over25 = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        if (h + a > 2.5) over25 += matrix[h][a];
      }
    }
    expect(ou["2.5"].over).toBeCloseTo(over25, 12);

    let yesDirect = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        if (h > 0 && a > 0) yesDirect += matrix[h][a];
      }
    }
    expect(btts.yes).toBeCloseTo(yesDirect, 12);

    const { homeWin, draw, awayWin } = derive1x2(matrix);
    expect(homeWin + draw + awayWin).toBeCloseTo(1, 9);
  });

  it("accepts XgEngineResult as single argument", () => {
    const xg = estimateExpectedGoals(avgVector({ attack: 75 }), avgVector(), {
      isNeutralVenue: true,
    });
    const result = predictMatch(xg);
    expect(result.homeXg).toBe(xg.homeXg);
    expect(result.awayXg).toBe(xg.awayXg);
    expect(result.modelVersion).toBe("glpm_pred_v1");
  });
});

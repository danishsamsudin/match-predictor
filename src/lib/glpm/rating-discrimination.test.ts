/**
 * Unit tests for collapsed primary-rating detection.
 */

import { describe, expect, it } from "vitest";
import {
  ratingSpread,
  seasonVectorsAreCollapsed,
} from "@/lib/glpm/rating-discrimination";
import { priorSeasonCompareIsRedundant } from "@/lib/glpm/resolve-vector-season";

describe("rating-discrimination", () => {
  it("computes max-min spread", () => {
    expect(ratingSpread([10, 20, 30])).toBe(20);
    expect(ratingSpread([92.9, 92.9, 92.9])).toBe(0);
  });

  it("flags early-season calibrator collapse", () => {
    const rows = Array.from({ length: 20 }, () => ({
      r_attack: 92.9,
      r_defence: 93.9,
      r_build_up: 91.8,
      r_possession: 91.8,
      r_pressing: 91.3,
      r_finishing: 90.2,
    }));
    expect(seasonVectorsAreCollapsed(rows)).toBe(true);
  });

  it("accepts a healthy league table", () => {
    const rows = [
      {
        r_attack: 79.1,
        r_defence: 57.3,
        r_build_up: 55.1,
        r_possession: 70.2,
        r_pressing: 72.2,
        r_finishing: 59.7,
      },
      {
        r_attack: 33.1,
        r_defence: 80.5,
        r_build_up: 73.6,
        r_possession: 55.0,
        r_pressing: 69.5,
        r_finishing: 92.2,
      },
      {
        r_attack: 76.5,
        r_defence: 55.2,
        r_build_up: 71.3,
        r_possession: 55.8,
        r_pressing: 78.0,
        r_finishing: 50.5,
      },
    ];
    expect(seasonVectorsAreCollapsed(rows)).toBe(false);
  });
});

describe("priorSeasonCompareIsRedundant", () => {
  it("flags when main already borrowed the prior vector season", () => {
    expect(
      priorSeasonCompareIsRedundant({
        vectorSeasonId: 25583,
        priorSeasonId: 25583,
      })
    ).toBe(true);
  });

  it("allows compare when main is still on the fixture season", () => {
    expect(
      priorSeasonCompareIsRedundant({
        vectorSeasonId: 28083,
        priorSeasonId: 25583,
      })
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPromotionPriorVector,
  pickPriorSeasonId,
  PROMOTION_PRIOR_MODEL,
} from "@/lib/glpm/promotion";
import { PROMOTION_PRIOR_ANCHOR } from "@/lib/glpm/league-strength";

describe("promotion", () => {
  it("picks the most recent prior season in the same competition", () => {
    const prior = pickPriorSeasonId(
      [
        { smId: 27958, competitionId: 72, startDate: "2026-08-07" },
        { smId: 25597, competitionId: 72, startDate: "2025-08-08" },
        { smId: 28083, competitionId: 8, startDate: "2026-08-21" },
      ],
      72,
      27958
    );
    expect(prior).toBe(25597);
  });

  it("builds a flat promotion prior vector", () => {
    const v = buildPromotionPriorVector({
      teamSmId: 1128,
      seasonId: 27958,
      teamName: "ADO Den Haag",
    });
    expect(v.modelVersion).toBe(PROMOTION_PRIOR_MODEL);
    expect(v.ratings.attack).toBe(PROMOTION_PRIOR_ANCHOR);
    expect(v.ratings.defence).toBe(PROMOTION_PRIOR_ANCHOR);
    expect(v.teamName).toBe("ADO Den Haag");
  });
});

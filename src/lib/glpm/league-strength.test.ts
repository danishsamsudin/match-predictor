import { describe, expect, it } from "vitest";
import {
  CROSS_LEAGUE_REMAP_MODEL,
  PROMOTION_PRIOR_ANCHOR,
  getGlpmLeagueStrength,
  isFeederPromotion,
  remapRatingAcrossCompetitions,
  remapRatingVectorAcrossCompetitions,
} from "@/lib/glpm/league-strength";
import { PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import type { LoadedRatingVector } from "@/lib/glpm/load-vectors";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";

function fakeVector(
  teamSmId: number,
  ratings: Partial<Record<PrimaryKey, number>> = {},
  seasonId = 1
): LoadedRatingVector {
  const base = {} as Record<PrimaryKey, number>;
  for (const k of PRIMARY_ORDER) base[k] = ratings[k] ?? 60;
  return {
    teamSmId,
    seasonId,
    asOfDate: "2026-05-01",
    ratings: base,
    metadata: {},
    modelVersion: "test",
    teamName: null,
  };
}

describe("league-strength", () => {
  it("treats Championship as weaker than Premier League", () => {
    expect(getGlpmLeagueStrength(SM_LEAGUE.CHAMPIONSHIP)).toBeLessThan(
      getGlpmLeagueStrength(SM_LEAGUE.PREMIER_LEAGUE)
    );
    expect(isFeederPromotion(SM_LEAGUE.CHAMPIONSHIP, SM_LEAGUE.PREMIER_LEAGUE)).toBe(
      true
    );
  });

  it("does not inflate same-competition ratings", () => {
    expect(
      remapRatingAcrossCompetitions(88, SM_LEAGUE.PREMIER_LEAGUE, SM_LEAGUE.PREMIER_LEAGUE)
    ).toBe(88);
  });

  it("pulls Championship elite toward a PL promotion prior", () => {
    const mapped = remapRatingAcrossCompetitions(
      92,
      SM_LEAGUE.CHAMPIONSHIP,
      SM_LEAGUE.PREMIER_LEAGUE,
      { destinationAnchor: 60 }
    );
    // Ω map then promotion blend should land near lower-table PL, not Elite.
    expect(mapped).toBeLessThan(60);
    expect(mapped).toBeGreaterThan(PROMOTION_PRIOR_ANCHOR - 2);
  });

  it("keeps Championship mid-table below remapped elite", () => {
    const elite = remapRatingAcrossCompetitions(
      92,
      SM_LEAGUE.CHAMPIONSHIP,
      SM_LEAGUE.PREMIER_LEAGUE,
      { destinationAnchor: 60 }
    );
    const mid = remapRatingAcrossCompetitions(
      60,
      SM_LEAGUE.CHAMPIONSHIP,
      SM_LEAGUE.PREMIER_LEAGUE,
      { destinationAnchor: 60 }
    );
    expect(elite).toBeGreaterThan(mid);
    expect(mid).toBeLessThan(55);
  });

  it("boosts relegated PL sides relative to Championship scale", () => {
    const mapped = remapRatingAcrossCompetitions(
      60,
      SM_LEAGUE.PREMIER_LEAGUE,
      SM_LEAGUE.CHAMPIONSHIP,
      { destinationAnchor: 60 }
    );
    expect(mapped).toBeGreaterThanOrEqual(60);
  });

  it("remaps full vectors and stamps remap model version", () => {
    const out = remapRatingVectorAcrossCompetitions(
      fakeVector(19, { attack: 90, defence: 88 }, 25648),
      SM_LEAGUE.CHAMPIONSHIP,
      SM_LEAGUE.PREMIER_LEAGUE,
      { destinationAnchor: 60, targetSeasonId: 28083 }
    );
    expect(out.modelVersion).toBe(CROSS_LEAGUE_REMAP_MODEL);
    expect(out.seasonId).toBe(28083);
    expect(out.ratings.attack).toBeLessThan(60);
    expect(out.ratings.defence).toBeLessThan(60);
  });
});

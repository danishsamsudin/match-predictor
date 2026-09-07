import { describe, expect, it } from "vitest";
import {
  pickDefaultGlpmSeasonId,
  pickFixtureSeasonId,
  pickRatingSeasonId,
  type GlpmSeasonReadiness,
  type GlpmSeasonRef,
} from "./season-ready";
import { SM_LEAGUE, SM_SEASON_2025_26, SM_SEASON_2026_27 } from "@/lib/sportmonks/constants";

function readiness(
  partial: Partial<GlpmSeasonReadiness>
): GlpmSeasonReadiness {
  return {
    hasVectors: false,
    hasFinishedMatches: false,
    hasUpcomingMatches: false,
    isPredictReady: false,
    hasDiscriminatingVectors: false,
    ...partial,
  };
}

describe("pickRatingSeasonId", () => {
  const seasons: GlpmSeasonRef[] = [
    {
      smId: SM_SEASON_2026_27.PREMIER_LEAGUE,
      name: "2026/27",
      competitionId: SM_LEAGUE.PREMIER_LEAGUE,
    },
    {
      smId: SM_SEASON_2025_26.PREMIER_LEAGUE,
      name: "2025/26",
      competitionId: SM_LEAGUE.PREMIER_LEAGUE,
    },
  ];

  it("prefers completed discriminating season over early upcoming season", () => {
    const map = new Map<number, GlpmSeasonReadiness>([
      [
        SM_SEASON_2026_27.PREMIER_LEAGUE,
        readiness({
          hasUpcomingMatches: true,
          hasVectors: true,
          hasDiscriminatingVectors: true,
          hasFinishedMatches: true,
        }),
      ],
      [
        SM_SEASON_2025_26.PREMIER_LEAGUE,
        readiness({
          hasFinishedMatches: true,
          hasVectors: true,
          hasDiscriminatingVectors: true,
        }),
      ],
    ]);

    expect(pickFixtureSeasonId(seasons, map, SM_LEAGUE.PREMIER_LEAGUE)).toBe(
      SM_SEASON_2026_27.PREMIER_LEAGUE
    );
    expect(pickDefaultGlpmSeasonId(seasons, map, SM_LEAGUE.PREMIER_LEAGUE)).toBe(
      SM_SEASON_2026_27.PREMIER_LEAGUE
    );
    expect(pickRatingSeasonId(seasons, map, SM_LEAGUE.PREMIER_LEAGUE)).toBe(
      SM_SEASON_2025_26.PREMIER_LEAGUE
    );
  });

  it("falls back to TRAIN_FALLBACK when completed season flags are missing", () => {
    const map = new Map<number, GlpmSeasonReadiness>([
      [
        SM_SEASON_2026_27.SERIE_A,
        readiness({
          hasUpcomingMatches: true,
          hasVectors: true,
          hasDiscriminatingVectors: true,
          hasFinishedMatches: true,
        }),
      ],
      [
        SM_SEASON_2025_26.SERIE_A,
        readiness({
          // Simulates the old under-sampled readiness bug.
          hasVectors: true,
          hasDiscriminatingVectors: true,
        }),
      ],
    ]);
    const serieSeasons: GlpmSeasonRef[] = [
      {
        smId: SM_SEASON_2026_27.SERIE_A,
        name: "2026/27",
        competitionId: SM_LEAGUE.SERIE_A,
      },
      {
        smId: SM_SEASON_2025_26.SERIE_A,
        name: "2025/26",
        competitionId: SM_LEAGUE.SERIE_A,
      },
    ];
    expect(pickRatingSeasonId(serieSeasons, map, SM_LEAGUE.SERIE_A)).toBe(
      SM_SEASON_2025_26.SERIE_A
    );
  });
});

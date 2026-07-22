/**
 * Cross-competition rating remapping for GLPM.
 *
 * Within-season percentiles are not absolute: a Championship elite side can land
 * in the same 0–100 band as a Premier League elite side. When a vector is carried
 * into a stronger (or weaker) competition, remap with league quality Ω.
 */

import { PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import type { LoadedRatingVector } from "@/lib/glpm/load-vectors";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";

/** Ω vs Premier League (1.0 = PL). SportMonks competition ids. */
export const GLPM_LEAGUE_STRENGTH_VS_PL: Record<number, number> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: 1.0,
  [SM_LEAGUE.SERIE_A]: 0.9,
  [SM_LEAGUE.BUNDESLIGA]: 0.92,
  [SM_LEAGUE.EREDIVISIE]: 0.72,
  // Slightly below the legacy SofaScore Ω (0.7): second-tier percentiles inflate
  // more aggressively once carried into PL fixtures.
  [SM_LEAGUE.CHAMPIONSHIP]: 0.65,
};

const DEFAULT_LEAGUE_STRENGTH = 0.75;

/** Second-tier → parent top-flight (promotion path). */
export const GLPM_FEEDER_PARENT: Record<number, number> = {
  [SM_LEAGUE.CHAMPIONSHIP]: SM_LEAGUE.PREMIER_LEAGUE,
  // SportMonks ids reserved for when feeder seasons are ingested:
  // 387 Serie B → Serie A, 83 2. Bundesliga → Bundesliga, 74 Eerste Divisie → Eredivisie
};

/** Typical early-season level for newly promoted sides (relegation-battle band). */
export const PROMOTION_PRIOR_ANCHOR = 48;

/**
 * After Ω remapping, blend this fraction toward the promotion prior so Championship
 * elites land near lower-table PL, not mid-table.
 */
export const PROMOTION_PRIOR_BLEND = 0.7;

export const CROSS_LEAGUE_REMAP_MODEL = "glpm_cross_league_remap_v1";

export function getGlpmLeagueStrength(competitionId: number): number {
  return GLPM_LEAGUE_STRENGTH_VS_PL[competitionId] ?? DEFAULT_LEAGUE_STRENGTH;
}

export function isFeederPromotion(
  sourceCompetitionId: number,
  targetCompetitionId: number
): boolean {
  return GLPM_FEEDER_PARENT[sourceCompetitionId] === targetCompetitionId;
}

export function isRelegationDrop(
  sourceCompetitionId: number,
  targetCompetitionId: number
): boolean {
  return GLPM_FEEDER_PARENT[targetCompetitionId] === sourceCompetitionId;
}

/** Map one 0–100 rating from source competition scale → target competition scale. */
export function remapRatingAcrossCompetitions(
  rating: number,
  sourceCompetitionId: number,
  targetCompetitionId: number,
  opts?: {
    destinationAnchor?: number | null;
    forcePromotionBlend?: boolean;
  }
): number {
  if (!Number.isFinite(rating)) return PROMOTION_PRIOR_ANCHOR;
  if (sourceCompetitionId === targetCompetitionId) return clampRating(rating);

  const sourceOmega = getGlpmLeagueStrength(sourceCompetitionId);
  const targetOmega = getGlpmLeagueStrength(targetCompetitionId);
  const anchor =
    opts?.destinationAnchor != null && Number.isFinite(opts.destinationAnchor)
      ? Number(opts.destinationAnchor)
      : 55;

  let mapped: number;

  if (sourceOmega < targetOmega * 0.995) {
    // Weaker → stronger (e.g. Championship → PL)
    const omega = Math.min(1, sourceOmega / targetOmega);
    mapped = rating * omega + anchor * (1 - omega);

    const promote =
      opts?.forcePromotionBlend === true ||
      isFeederPromotion(sourceCompetitionId, targetCompetitionId);
    if (promote) {
      const promotionAnchor = Math.min(anchor, PROMOTION_PRIOR_ANCHOR);
      mapped =
        mapped * (1 - PROMOTION_PRIOR_BLEND) +
        promotionAnchor * PROMOTION_PRIOR_BLEND;
    }
  } else if (sourceOmega > targetOmega * 1.005) {
    // Stronger → weaker (e.g. relegated PL → Championship)
    const omega = Math.min(1, targetOmega / sourceOmega);
    const delta = rating - 60;
    mapped = anchor + delta / Math.max(omega, 0.35);
  } else {
    mapped = rating;
  }

  return clampRating(mapped);
}

export function remapRatingVectorAcrossCompetitions(
  vector: LoadedRatingVector,
  sourceCompetitionId: number,
  targetCompetitionId: number,
  opts?: {
    destinationAnchor?: number | null;
    targetSeasonId?: number | null;
    forcePromotionBlend?: boolean;
  }
): LoadedRatingVector {
  if (sourceCompetitionId === targetCompetitionId) {
    return vector;
  }

  const ratings = {} as Record<PrimaryKey, number>;
  for (const key of PRIMARY_ORDER) {
    ratings[key] = remapRatingAcrossCompetitions(
      vector.ratings[key],
      sourceCompetitionId,
      targetCompetitionId,
      opts
    );
  }

  return {
    ...vector,
    seasonId: opts?.targetSeasonId ?? vector.seasonId,
    ratings,
    modelVersion: CROSS_LEAGUE_REMAP_MODEL,
  };
}

function clampRating(value: number): number {
  return Math.max(20, Math.min(100, Math.round(value * 10) / 10));
}

/**
 * Resolve rating vectors for hub cards: season → any-season → promotion prior
 * → competition mean prior.
 *
 * Any-season vectors from a different competition are remapped with league Ω
 * (and a promotion prior for feeder → parent) so Championship elites do not
 * enter Premier League fixtures as PL-elite.
 *
 * Newly promoted clubs with no second-tier history use a lower-table promotion
 * prior instead of the full competition mean.
 */

import { PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import type { LoadedRatingVector } from "@/lib/glpm/load-vectors";
import type { GlpmHubPredictionSource } from "@/lib/glpm/hub-types";
import { remapRatingVectorAcrossCompetitions } from "@/lib/glpm/league-strength";
import { buildPromotionPriorVector } from "@/lib/glpm/promotion";

export function meanPrimaryRatings(r: Record<PrimaryKey, number>): number {
  return PRIMARY_ORDER.reduce((s, k) => s + r[k], 0) / PRIMARY_ORDER.length;
}

export function buildCompetitionMeanVector(
  vectors: Iterable<LoadedRatingVector>,
  opts: { teamSmId: number; seasonId: number; asOfDate?: string }
): LoadedRatingVector | null {
  const list = [...vectors];
  if (!list.length) return null;

  const sums = {} as Record<PrimaryKey, number>;
  for (const key of PRIMARY_ORDER) sums[key] = 0;
  for (const v of list) {
    for (const key of PRIMARY_ORDER) {
      sums[key] += v.ratings[key];
    }
  }
  const n = list.length;
  const ratings = {} as Record<PrimaryKey, number>;
  for (const key of PRIMARY_ORDER) {
    ratings[key] = sums[key] / n;
  }

  return {
    teamSmId: opts.teamSmId,
    seasonId: opts.seasonId,
    asOfDate: opts.asOfDate ?? list[0]!.asOfDate,
    ratings,
    metadata: {},
    modelVersion: "glpm_hub_competition_mean_v1",
    teamName: null,
  };
}

export type ResolvedHubVector = {
  vector: LoadedRatingVector;
  /** True when the vector is a prior (mean, promotion, or cross-league remap). */
  isPrior: boolean;
};

export type ResolveHubVectorOpts = {
  /** Competition of the fixture / hub season (e.g. Premier League). */
  targetCompetitionId?: number | null;
  /** season_id → competition_id for any-season source lookup. */
  seasonCompetitionBySeasonId?: Map<number, number> | null;
  /** Destination-league anchor (usually competition mean overall). */
  destinationAnchor?: number | null;
  /** Season id stamped onto remapped / prior vectors. */
  targetSeasonId?: number | null;
  /** Teams new to this competition vs the prior season (promoted / newly arrived). */
  promotedTeamIds?: ReadonlySet<number> | null;
};

/**
 * Prefer season-scoped vector, then any-season fallback (remapped when the source
 * competition differs), then promotion prior for newcomers, then competition mean.
 */
export function resolveHubTeamVector(
  teamSmId: number,
  seasonVectors: Map<number, LoadedRatingVector>,
  anySeasonVectors: Map<number, LoadedRatingVector>,
  competitionMean: LoadedRatingVector | null,
  opts?: ResolveHubVectorOpts | null
): ResolvedHubVector | null {
  const season = seasonVectors.get(teamSmId);
  if (season) return { vector: season, isPrior: false };

  const any = anySeasonVectors.get(teamSmId);
  if (any) {
    const remapped = maybeRemapAnySeasonVector(any, opts ?? null, competitionMean);
    if (remapped) return remapped;
    return { vector: any, isPrior: false };
  }

  if (opts?.promotedTeamIds?.has(teamSmId) && opts.targetSeasonId != null) {
    return {
      vector: buildPromotionPriorVector({
        teamSmId,
        seasonId: opts.targetSeasonId,
        asOfDate: competitionMean?.asOfDate,
      }),
      isPrior: true,
    };
  }

  if (competitionMean) {
    return {
      vector: {
        ...competitionMean,
        teamSmId,
        ratings: { ...competitionMean.ratings },
      },
      isPrior: true,
    };
  }

  return null;
}

function maybeRemapAnySeasonVector(
  any: LoadedRatingVector,
  opts: ResolveHubVectorOpts | null,
  competitionMean: LoadedRatingVector | null
): ResolvedHubVector | null {
  const targetCompetitionId = opts?.targetCompetitionId ?? null;
  const seasonMap = opts?.seasonCompetitionBySeasonId ?? null;
  if (targetCompetitionId == null || seasonMap == null) return null;

  const sourceCompetitionId = seasonMap.get(any.seasonId);
  if (sourceCompetitionId == null) return null;
  if (sourceCompetitionId === targetCompetitionId) return null;

  const destinationAnchor =
    opts?.destinationAnchor ??
    (competitionMean ? meanPrimaryRatings(competitionMean.ratings) : null);

  const vector = remapRatingVectorAcrossCompetitions(
    any,
    sourceCompetitionId,
    targetCompetitionId,
    {
      destinationAnchor,
      targetSeasonId: opts?.targetSeasonId ?? null,
    }
  );

  return { vector, isPrior: true };
}

export function predictionSourceFromResolved(
  home: ResolvedHubVector,
  away: ResolvedHubVector,
  fromStore: boolean
): GlpmHubPredictionSource {
  if (fromStore) return "stored";
  if (home.isPrior || away.isPrior) return "prior";
  return "live";
}

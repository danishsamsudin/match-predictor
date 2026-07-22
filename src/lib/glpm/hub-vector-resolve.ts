/**
 * Resolve rating vectors for hub cards: season → any-season → competition mean prior.
 */

import { PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import type { LoadedRatingVector } from "@/lib/glpm/load-vectors";
import type { GlpmHubPredictionSource } from "@/lib/glpm/hub-types";

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
  /** True when the vector is a competition-mean prior, not a real team rating. */
  isPrior: boolean;
};

/**
 * Prefer season-scoped vector, then any-season fallback, then competition mean prior
 * (only when the competition already has at least one real vector).
 */
export function resolveHubTeamVector(
  teamSmId: number,
  seasonVectors: Map<number, LoadedRatingVector>,
  anySeasonVectors: Map<number, LoadedRatingVector>,
  competitionMean: LoadedRatingVector | null
): ResolvedHubVector | null {
  const season = seasonVectors.get(teamSmId);
  if (season) return { vector: season, isPrior: false };

  const any = anySeasonVectors.get(teamSmId);
  if (any) return { vector: any, isPrior: false };

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

export function predictionSourceFromResolved(
  home: ResolvedHubVector,
  away: ResolvedHubVector,
  fromStore: boolean
): GlpmHubPredictionSource {
  if (fromStore) return "stored";
  if (home.isPrior || away.isPrior) return "prior";
  return "live";
}

/**
 * Rank movement helpers for league standings (UI arrows + refresh jobs).
 */

import type { GlpmStandingRow } from "@/lib/glpm/hub-types";

export type StandingRankMovement = "up" | "down" | "same" | "new";

export type FinishedResultFingerprintInput = {
  matchSmId: number;
  homeScore: number;
  awayScore: number;
};

/** Stable fingerprint of finished scores so no-op refreshes keep previous_rank. */
export function fingerprintFinishedResults(
  matches: FinishedResultFingerprintInput[]
): string {
  if (!matches.length) return "empty";
  const parts = matches
    .map((m) => `${m.matchSmId}:${m.homeScore}-${m.awayScore}`)
    .sort();
  return parts.join("|");
}

export function deriveRankMovement(
  rank: number,
  previousRank: number | null | undefined
): { rankDelta: number; rankMovement: StandingRankMovement } {
  if (previousRank == null) {
    return { rankDelta: 0, rankMovement: "new" };
  }
  const rankDelta = previousRank - rank;
  if (rankDelta > 0) return { rankDelta, rankMovement: "up" };
  if (rankDelta < 0) return { rankDelta, rankMovement: "down" };
  return { rankDelta: 0, rankMovement: "same" };
}

export function attachPreviousRanks(
  rows: GlpmStandingRow[],
  previousByTeam: Map<number, number | null>
): GlpmStandingRow[] {
  return rows.map((row) => {
    const previousRank = previousByTeam.has(row.teamSmId)
      ? (previousByTeam.get(row.teamSmId) ?? null)
      : null;
    const { rankDelta, rankMovement } = deriveRankMovement(row.rank, previousRank);
    return {
      ...row,
      previousRank,
      rankDelta,
      rankMovement,
    };
  });
}

/**
 * When results fingerprint changes, previous_rank becomes the prior stored rank.
 * When unchanged, keep the existing previous_rank so arrows do not reset.
 */
export function resolvePreviousRanksForRefresh(opts: {
  currentRows: Array<{ teamSmId: number; rank: number }>;
  storedByTeam: Map<number, { rank: number; previousRank: number | null }>;
  fingerprintChanged: boolean;
}): Map<number, number | null> {
  const out = new Map<number, number | null>();
  for (const row of opts.currentRows) {
    const stored = opts.storedByTeam.get(row.teamSmId);
    if (!stored) {
      out.set(row.teamSmId, null);
      continue;
    }
    if (opts.fingerprintChanged) {
      out.set(row.teamSmId, stored.rank);
    } else {
      out.set(row.teamSmId, stored.previousRank);
    }
  }
  return out;
}

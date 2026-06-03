/** Per-match decay for lineup appearance weighting (newest match index 0). */
export const LINEUP_RECENCY_DECAY = 0.9;

export function lineupRecencyWeight(matchIndex: number): number {
  return Math.pow(LINEUP_RECENCY_DECAY, matchIndex);
}

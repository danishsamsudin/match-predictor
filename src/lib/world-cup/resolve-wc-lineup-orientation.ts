import type { PredictRequest } from "@/lib/types/prediction";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";

/** Map request-side lineup team ids to official fixture home/away API ids. */
export function resolveWcLineupApiIds(
  resolved: ResolvedWcMatch,
  request: Pick<PredictRequest, "homeTeamId" | "awayTeamId">
): { lineupHomeApiId: number; lineupAwayApiId: number } {
  if (!resolved.teamsSwappedInInput) {
    return {
      lineupHomeApiId: request.homeTeamId,
      lineupAwayApiId: request.awayTeamId,
    };
  }
  return {
    lineupHomeApiId: request.awayTeamId,
    lineupAwayApiId: request.homeTeamId,
  };
}

import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import type { TeamComparisonSnapshot } from "@/lib/types/team-comparison";
import type { PredictRequest } from "@/lib/types/prediction";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";

function normTeamName(name: string): string {
  return normalizeNationalTeamName(name.trim());
}

export function swapPlayerPropsPayload(payload: PlayerPropsPayload): PlayerPropsPayload {
  return {
    ...payload,
    home: payload.away,
    away: payload.home,
  };
}

export function swapTeamComparisonSides(
  snapshot: TeamComparisonSnapshot
): TeamComparisonSnapshot {
  return {
    ...snapshot,
    home: snapshot.away,
    away: snapshot.home,
  };
}

/**
 * When stored payload home/away team names disagree with display labels, swap sides.
 */
export function alignPlayerPropsToLabels(
  payload: PlayerPropsPayload,
  homeLabel: string,
  awayLabel: string
): PlayerPropsPayload {
  const home = normTeamName(homeLabel);
  const away = normTeamName(awayLabel);
  const payloadHome = normTeamName(payload.home.teamName);
  const payloadAway = normTeamName(payload.away.teamName);

  if (payloadHome === home && payloadAway === away) return payload;
  if (payloadHome === away && payloadAway === home) return swapPlayerPropsPayload(payload);
  return payload;
}

export function shouldOrientWcCompareToRequest(
  request: Pick<PredictRequest, "mode">,
  resolved: ResolvedWcMatch
): boolean {
  return request.mode === "compare" && resolved.teamsSwappedInInput;
}

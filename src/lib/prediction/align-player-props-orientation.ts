import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import type { TeamComparisonSnapshot } from "@/lib/types/team-comparison";
import type { PredictRequest } from "@/lib/types/prediction";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";

function normTeamName(name: string): string {
  return normalizeNationalTeamName(name.trim());
}

function shouldSwapSidesToLabels(
  sideHomeName: string,
  sideAwayName: string,
  homeLabel: string,
  awayLabel: string
): boolean {
  const home = normTeamName(homeLabel);
  const away = normTeamName(awayLabel);
  const payloadHome = normTeamName(sideHomeName);
  const payloadAway = normTeamName(sideAwayName);
  return payloadHome === away && payloadAway === home;
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
  if (
    shouldSwapSidesToLabels(
      payload.home.teamName,
      payload.away.teamName,
      homeLabel,
      awayLabel
    )
  ) {
    return swapPlayerPropsPayload(payload);
  }
  return payload;
}

/** Same home/away label alignment as player props — keeps team comparison in sync with the UI. */
export function alignTeamComparisonToLabels(
  snapshot: TeamComparisonSnapshot,
  homeLabel: string,
  awayLabel: string
): TeamComparisonSnapshot {
  if (
    shouldSwapSidesToLabels(snapshot.home.teamName, snapshot.away.teamName, homeLabel, awayLabel)
  ) {
    return swapTeamComparisonSides(snapshot);
  }
  return snapshot;
}

export function alignStatComparisonToLabels<T extends { home: number; away: number }>(
  rows: T[],
  sideHomeName: string,
  sideAwayName: string,
  homeLabel: string,
  awayLabel: string
): T[] {
  if (!shouldSwapSidesToLabels(sideHomeName, sideAwayName, homeLabel, awayLabel)) {
    return rows;
  }
  return rows.map((row) => ({ ...row, home: row.away, away: row.home }));
}

export function shouldOrientWcCompareToRequest(
  request: Pick<PredictRequest, "mode">,
  resolved: ResolvedWcMatch
): boolean {
  return request.mode === "compare" && resolved.teamsSwappedInInput;
}

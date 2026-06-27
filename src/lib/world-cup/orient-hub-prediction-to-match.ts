import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { swapHubPredictionRow } from "@/lib/world-cup/swap-hub-prediction-orientation";

function snapshotApiTeamId(snapshot: Record<string, unknown>, key: string): number {
  const v = snapshot[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** True when locked prediction home/away differs from the match's display orientation. */
export function hubPredictionNeedsHomeAwaySwap(
  pred: Pick<HubPredictionRow, "snapshot">,
  matchHomeTeamId: string,
  matchAwayTeamId: string,
  matchHomeName: string,
  matchAwayName: string
): boolean {
  const snapHome = snapshotApiTeamId(pred.snapshot, "home_team_api_id");
  const snapAway = snapshotApiTeamId(pred.snapshot, "away_team_api_id");
  const matchHome = resolveApiTeamId(matchHomeTeamId, matchHomeName);
  const matchAway = resolveApiTeamId(matchAwayTeamId, matchAwayName);

  if (snapHome > 0 && snapAway > 0 && matchHome > 0 && matchAway > 0) {
    if (snapHome === matchHome && snapAway === matchAway) return false;
    if (snapHome === matchAway && snapAway === matchHome) return true;
  }
  return false;
}

/** Align a locked hub prediction to the match's official home/away for display and scoring. */
export function orientHubPredictionToMatch(
  pred: HubPredictionRow,
  matchHomeTeamId: string,
  matchAwayTeamId: string,
  matchHomeName: string,
  matchAwayName: string
): HubPredictionRow {
  if (
    hubPredictionNeedsHomeAwaySwap(
      pred,
      matchHomeTeamId,
      matchAwayTeamId,
      matchHomeName,
      matchAwayName
    )
  ) {
    return swapHubPredictionRow(pred);
  }
  return pred;
}

/** Integer scoreline label (most likely outcome from the score grid, not xG). */
export function formatPredictedScoreline(home: number, away: number): string {
  return `${Math.round(home)}-${Math.round(away)}`;
}

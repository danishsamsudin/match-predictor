import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { hubPredictionNeedsHomeAwaySwap, orientHubPredictionToMatch } from "@/lib/world-cup/orient-hub-prediction-to-match";

export type OrientedEvalRow = {
  snapshot: Record<string, unknown>;
  actualHome: number;
  actualAway: number;
  matchId?: string;
};

/**
 * Align a locked prediction snapshot to official fixture home/away for calibration/scoring.
 */
export function orientSnapshotForMatch(
  snapshot: Record<string, unknown>,
  actualHome: number,
  actualAway: number,
  matchHomeTeamId: string,
  matchAwayTeamId: string,
  matchHomeName: string,
  matchAwayName: string
): OrientedEvalRow {
  const pred: HubPredictionRow = {
    home_win_pct: 0,
    draw_pct: 0,
    away_win_pct: 0,
    predicted_score_home: 0,
    predicted_score_away: 0,
    under_2_5_pct: 0,
    over_2_5_pct: 0,
    model_version: "",
    snapshot,
  };

  const oriented = orientHubPredictionToMatch(
    pred,
    matchHomeTeamId,
    matchAwayTeamId,
    matchHomeName,
    matchAwayName
  );

  return {
    snapshot: oriented.snapshot,
    actualHome,
    actualAway,
  };
}

export function snapshotNeedsOrientationSwap(
  snapshot: Record<string, unknown>,
  matchHomeTeamId: string,
  matchAwayTeamId: string,
  matchHomeName: string,
  matchAwayName: string
): boolean {
  return hubPredictionNeedsHomeAwaySwap(
    { snapshot },
    matchHomeTeamId,
    matchAwayTeamId,
    matchHomeName,
    matchAwayName
  );
}

/**
 * Derive settled markets and actual match totals for finished fixtures.
 */

import type { LiveScoreSideMetrics, LiveScoreTimelineEvent } from "./types";

export type SettledResult = "H" | "D" | "A";

export type SettledScoreMarkets = {
  result: SettledResult;
  over25: boolean;
  btts: boolean;
  totalGoals: number;
};

export type SideCardCounts = {
  yellow: number;
  red: number;
};

export type ActualMatchTotals = {
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
};

export type ActualSideStatsInput = {
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
} | null;

export function settleScoreMarkets(
  homeScore: number,
  awayScore: number
): SettledScoreMarkets {
  const totalGoals = homeScore + awayScore;
  const result: SettledResult =
    homeScore > awayScore ? "H" : homeScore < awayScore ? "A" : "D";
  return {
    result,
    over25: totalGoals > 2.5,
    btts: homeScore > 0 && awayScore > 0,
    totalGoals,
  };
}

export function countCardsFromTimeline(
  timeline: LiveScoreTimelineEvent[],
  side: "home" | "away"
): SideCardCounts {
  let yellow = 0;
  let red = 0;
  for (const event of timeline) {
    if (event.side !== side) continue;
    if (event.kind === "yellow_card") yellow += 1;
    else if (event.kind === "red_card") red += 1;
    else if (event.kind === "yellow_red_card") {
      yellow += 1;
      red += 1;
    }
  }
  return { yellow, red };
}

function pickNumber(
  preferred: number | null | undefined,
  fallback: number | null | undefined
): number | null {
  if (preferred != null && Number.isFinite(preferred)) return preferred;
  if (fallback != null && Number.isFinite(fallback)) return fallback;
  return null;
}

/**
 * Resolve corners + cards from DB team stats, falling back to payload metrics
 * (corners) and timeline event counts (cards).
 */
export function resolveActualMatchTotals(args: {
  homeStats: ActualSideStatsInput;
  awayStats: ActualSideStatsInput;
  homeMetrics: LiveScoreSideMetrics;
  awayMetrics: LiveScoreSideMetrics;
  timeline: LiveScoreTimelineEvent[];
}): ActualMatchTotals {
  const homeTimeline = countCardsFromTimeline(args.timeline, "home");
  const awayTimeline = countCardsFromTimeline(args.timeline, "away");

  return {
    homeCorners: pickNumber(args.homeStats?.corners, args.homeMetrics.corners),
    awayCorners: pickNumber(args.awayStats?.corners, args.awayMetrics.corners),
    homeYellow: pickNumber(args.homeStats?.yellowCards, homeTimeline.yellow),
    awayYellow: pickNumber(args.awayStats?.yellowCards, awayTimeline.yellow),
    homeRed: pickNumber(args.homeStats?.redCards, homeTimeline.red),
    awayRed: pickNumber(args.awayStats?.redCards, awayTimeline.red),
  };
}

export function favoriteFromPrediction(args: {
  homeWin: number;
  draw: number;
  awayWin: number;
}): SettledResult {
  const { homeWin, draw, awayWin } = args;
  if (homeWin >= draw && homeWin >= awayWin) return "H";
  if (awayWin >= draw && awayWin >= homeWin) return "A";
  return "D";
}

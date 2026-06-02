import type { FixtureResult } from "@/lib/types/football";
import type { BaseProbabilityInput } from "@/lib/types/prediction";

/** Recency weights for the last five matches (newest first). */
const FORM_RECENCY_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];
/** Per-match decay for head-to-head meetings (newest first). */
const H2H_RECENCY_DECAY = 0.88;
/** Minimum H2H meetings before full H2H strength is applied. */
const H2H_CONFIDENCE_MATCHES = 5;

/** Form weight in momentum index. */
export const W1_FORM = 0.35;
/** Head-to-head weight in momentum index. */
export const W2_H2H = 0.65;

export interface H2HRates {
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  hasData: boolean;
}

/** Points earned by `teamId` in one finished match (3 / 1 / 0), or null if unknown. */
export function matchPointsForTeam(match: FixtureResult, teamId: number): number | null {
  const isHome = match.teams.home.id === teamId;
  const isAway = match.teams.away.id === teamId;
  if (!isHome && !isAway) return null;

  const winner = isHome ? match.teams.home.winner : match.teams.away.winner;
  if (winner === true) return 3;
  if (winner === false) return 0;
  if (winner === null) return 1;

  const homeGoals = match.goals?.home;
  const awayGoals = match.goals?.away;
  if (homeGoals == null || awayGoals == null) return null;

  const goalsFor = isHome ? homeGoals : awayGoals;
  const goalsAgainst = isHome ? awayGoals : homeGoals;
  if (goalsFor > goalsAgainst) return 3;
  if (goalsFor < goalsAgainst) return 0;
  return 1;
}

/**
 * Weighted form score in [0, 1]: recent matches count more; wins = 3 pts, draws = 1.
 */
export function computeFormScore(
  form: FixtureResult[],
  teamId: number,
  maxMatches = 5
): number {
  const recent = form.slice(0, maxMatches);
  if (!recent.length) return 0.5;

  let weightedPoints = 0;
  let weightSum = 0;

  for (let i = 0; i < recent.length; i++) {
    const points = matchPointsForTeam(recent[i], teamId);
    if (points == null) continue;
    const weight = FORM_RECENCY_WEIGHTS[i] ?? FORM_RECENCY_WEIGHTS.at(-1)!;
    weightedPoints += points * weight;
    weightSum += weight * 3;
  }

  if (weightSum <= 0) return 0.5;
  return weightedPoints / weightSum;
}

/**
 * Head-to-head rates from the upcoming home team's perspective, with recency weighting.
 */
export function computeH2HRates(
  h2h: FixtureResult[],
  homeTeamId: number
): H2HRates {
  if (!h2h.length) {
    return { homeWinRate: 1 / 3, drawRate: 1 / 3, awayWinRate: 1 / 3, hasData: false };
  }

  let homeWeight = 0;
  let drawWeight = 0;
  let awayWeight = 0;

  for (let i = 0; i < h2h.length; i++) {
    const match = h2h[i];
    const homeIsTarget = match.teams.home.id === homeTeamId;
    const homeWinner = match.teams.home.winner;
    const awayWinner = match.teams.away.winner;

    let outcome: "home" | "draw" | "away" | null = null;
    if (homeWinner === null && awayWinner === null) {
      outcome = "draw";
    } else if (homeIsTarget ? homeWinner : awayWinner) {
      outcome = "home";
    } else {
      outcome = "away";
    }

    if (outcome == null) {
      const homeGoals = match.goals?.home;
      const awayGoals = match.goals?.away;
      if (homeGoals != null && awayGoals != null) {
        if (homeGoals === awayGoals) outcome = "draw";
        else if (homeIsTarget) {
          outcome = homeGoals > awayGoals ? "home" : "away";
        } else {
          outcome = awayGoals > homeGoals ? "home" : "away";
        }
      }
    }

    if (outcome == null) continue;

    const weight = Math.pow(H2H_RECENCY_DECAY, i);
    if (outcome === "home") homeWeight += weight;
    else if (outcome === "draw") drawWeight += weight;
    else awayWeight += weight;
  }

  const total = homeWeight + drawWeight + awayWeight;
  if (total <= 0) {
    return { homeWinRate: 1 / 3, drawRate: 1 / 3, awayWinRate: 1 / 3, hasData: false };
  }

  return {
    homeWinRate: homeWeight / total,
    drawRate: drawWeight / total,
    awayWinRate: awayWeight / total,
    hasData: true,
  };
}

/** Signed H2H edge for the home side; zero when there is no reliable H2H sample. */
export function computeH2HStrength(rates: H2HRates, meetingCount: number): number {
  if (!rates.hasData) return 0;

  const raw =
    rates.homeWinRate - rates.awayWinRate + rates.drawRate * 0.25;
  const confidence = Math.min(1, meetingCount / H2H_CONFIDENCE_MATCHES);
  return raw * confidence;
}

export function computeMomentumIndex(
  input: BaseProbabilityInput & { h2hHasData?: boolean; h2hMeetingCount?: number }
): number {
  const formDiff = input.homeFormScore - input.awayFormScore;
  const h2hStrength = computeH2HStrength(
    {
      homeWinRate: input.h2hHomeWinRate,
      drawRate: input.h2hDrawRate,
      awayWinRate: input.h2hAwayWinRate,
      hasData: input.h2hHasData ?? true,
    },
    input.h2hMeetingCount ?? 0
  );
  return formDiff * W1_FORM + h2hStrength * W2_H2H;
}

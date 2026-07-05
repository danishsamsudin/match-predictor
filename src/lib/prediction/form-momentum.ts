import { getLeagueEntityType } from "@/lib/data/football-reference";
import { computeStrengthMomentumEdge } from "@/lib/prediction/team-strength";
import type { EntityType } from "@/lib/types/football-lookup";
import type { FixtureResult } from "@/lib/types/football";
import type { BaseProbabilityInput } from "@/lib/types/prediction";

/** Recency weights for the last five matches (newest first). */
const FORM_RECENCY_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];
/** Per-match list-index decay for club H2H (newest first). */
const H2H_RECENCY_DECAY = 0.88;
/** Minimum H2H meetings before full H2H strength is applied. */
const H2H_CONFIDENCE_MATCHES = 5;
/** Clamp for log-linear momentum exponent. */
export const MOMENTUM_STRENGTH_CLAMP = 2;

/** Form weight in momentum index (club default). */
export const W1_FORM_CLUB = 0.35;
/** H2H weight in momentum index (club default). */
export const W2_H2H_CLUB = 0.65;
export const W1_FORM_NATIONAL = 0.8;
export const W2_H2H_NATIONAL = 0.2;

const NATIONAL_H2H_MAX_AGE_MONTHS = 24;

export interface H2HRates {
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  hasData: boolean;
  maxMeetingAgeMonths?: number;
}

export interface H2HRatesOptions {
  entityType?: EntityType;
  referenceDate?: string;
  leagueId?: number;
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

export function isNationalMomentumContext(
  entityType?: EntityType,
  leagueId?: number
): boolean {
  if (entityType === "national") return true;
  if (leagueId != null && getLeagueEntityType(leagueId) === "national") return true;
  return false;
}

export function getMomentumWeights(
  entityType?: EntityType,
  leagueId?: number
): { w1: number; w2: number } {
  if (isNationalMomentumContext(entityType, leagueId)) {
    return { w1: W1_FORM_NATIONAL, w2: W2_H2H_NATIONAL };
  }
  return { w1: W1_FORM_CLUB, w2: W2_H2H_CLUB };
}

function monthsBetween(matchDateIso: string, referenceDateIso: string): number {
  const matchMs = new Date(matchDateIso).getTime();
  const refMs = new Date(referenceDateIso).getTime();
  if (!Number.isFinite(matchMs) || !Number.isFinite(refMs)) return 0;
  const diffDays = Math.max(0, (refMs - matchMs) / (1000 * 60 * 60 * 24));
  return diffDays / 30.44;
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

function h2hMeetingWeight(
  index: number,
  match: FixtureResult,
  options?: H2HRatesOptions
): number {
  let weight = Math.pow(H2H_RECENCY_DECAY, index);
  if (!isNationalMomentumContext(options?.entityType, options?.leagueId)) {
    return weight;
  }
  if (!options?.referenceDate || !match.fixture?.date) return weight;
  const ageMonths = monthsBetween(match.fixture.date, options.referenceDate);
  if (ageMonths > NATIONAL_H2H_MAX_AGE_MONTHS) return 0;
  return weight * Math.pow(0.5, ageMonths / 12);
}

/**
 * Head-to-head rates from the upcoming home team's perspective, with recency weighting.
 */
export function computeH2HRates(
  h2h: FixtureResult[],
  homeTeamId: number,
  options?: H2HRatesOptions
): H2HRates {
  if (!h2h.length) {
    return { homeWinRate: 1 / 3, drawRate: 1 / 3, awayWinRate: 1 / 3, hasData: false };
  }

  let homeWeight = 0;
  let drawWeight = 0;
  let awayWeight = 0;
  let maxMeetingAgeMonths = 0;

  for (let i = 0; i < h2h.length; i++) {
    const match = h2h[i];
    if (options?.referenceDate && match.fixture?.date) {
      maxMeetingAgeMonths = Math.max(
        maxMeetingAgeMonths,
        monthsBetween(match.fixture.date, options.referenceDate)
      );
    }

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

    const weight = h2hMeetingWeight(i, match, options);
    if (weight <= 0) continue;
    if (outcome === "home") homeWeight += weight;
    else if (outcome === "draw") drawWeight += weight;
    else awayWeight += weight;
  }

  const total = homeWeight + drawWeight + awayWeight;
  if (total <= 0) {
    return {
      homeWinRate: 1 / 3,
      drawRate: 1 / 3,
      awayWinRate: 1 / 3,
      hasData: false,
      maxMeetingAgeMonths,
    };
  }

  return {
    homeWinRate: homeWeight / total,
    drawRate: drawWeight / total,
    awayWinRate: awayWeight / total,
    hasData: true,
    maxMeetingAgeMonths,
  };
}

/** Signed H2H edge for the home side; zero when there is no reliable H2H sample. */
export function computeH2HStrength(
  rates: H2HRates,
  meetingCount: number,
  options?: H2HRatesOptions
): number {
  if (!rates.hasData) return 0;

  const raw =
    rates.homeWinRate - rates.awayWinRate + rates.drawRate * 0.25;
  let confidence = Math.min(1, meetingCount / H2H_CONFIDENCE_MATCHES);

  if (isNationalMomentumContext(options?.entityType, options?.leagueId)) {
    const maxAge = rates.maxMeetingAgeMonths ?? 0;
    if (maxAge > NATIONAL_H2H_MAX_AGE_MONTHS) confidence = 0;
    else if (maxAge > 12) {
      confidence *= Math.pow(0.5, (maxAge - 12) / 12);
    }
  }

  return raw * confidence;
}

export function clampMomentumIndex(value: number): number {
  return Math.max(-MOMENTUM_STRENGTH_CLAMP, Math.min(MOMENTUM_STRENGTH_CLAMP, value));
}

export function computeMomentumIndex(
  input: BaseProbabilityInput & {
    h2hHasData?: boolean;
    h2hMeetingCount?: number;
    h2hMaxMeetingAgeMonths?: number;
    homeLeagueId?: number;
    awayLeagueId?: number;
    entityType?: EntityType;
    homeTeamId?: number;
    awayTeamId?: number;
    homeTeamName?: string;
    awayTeamName?: string;
  }
): number {
  const { w1, w2 } = getMomentumWeights(input.entityType, input.homeLeagueId);
  const h2hOptions: H2HRatesOptions = {
    entityType: input.entityType,
    leagueId: input.homeLeagueId,
  };

  const formDiff = input.homeFormScore - input.awayFormScore;
  const h2hStrength = computeH2HStrength(
    {
      homeWinRate: input.h2hHomeWinRate,
      drawRate: input.h2hDrawRate,
      awayWinRate: input.h2hAwayWinRate,
      hasData: input.h2hHasData ?? true,
      maxMeetingAgeMonths: input.h2hMaxMeetingAgeMonths,
    },
    input.h2hMeetingCount ?? 0,
    h2hOptions
  );

  const homeLeagueId = input.homeLeagueId ?? 0;
  const awayLeagueId = input.awayLeagueId ?? 0;
  const leagueEdge =
    input.homeLeagueId != null && input.awayLeagueId != null
      ? computeStrengthMomentumEdge(
          {
            entityType: input.entityType,
            teamId: input.homeTeamId ?? 0,
            teamName: input.homeTeamName,
            leagueId: homeLeagueId,
          },
          {
            entityType: input.entityType,
            teamId: input.awayTeamId ?? 0,
            teamName: input.awayTeamName,
            leagueId: awayLeagueId,
          }
        )
      : (input.homeLeagueStrength - input.awayLeagueStrength) * 0.18;

  return clampMomentumIndex(formDiff * w1 + h2hStrength * w2 + leagueEdge);
}

/** @deprecated Use getMomentumWeights — club defaults exported as W1_FORM / W2_H2H. */
export const W1_FORM = W1_FORM_CLUB;
export const W2_H2H = W2_H2H_CLUB;

/** Uniform fallback when no H2H meetings and no model rates are supplied. */
export const NEUTRAL_H2H_OUTCOME_RATE = 1 / 3;

/**
 * Rates shown in the Form & momentum panel: historical H2H when available,
 * otherwise model 1X2 probabilities (avoids flat 33/33/33 for thin H2H).
 */
export function resolveFormMomentumOutcomeDisplayRates(input: {
  h2hHasData: boolean;
  h2hHomeWinRate: number;
  h2hDrawRate: number;
  h2hAwayWinRate: number;
  modelHomeWinRate: number;
  modelDrawRate: number;
  modelAwayWinRate: number;
}): { homeWinRate: number; drawRate: number; awayWinRate: number } {
  if (input.h2hHasData) {
    return {
      homeWinRate: input.h2hHomeWinRate,
      drawRate: input.h2hDrawRate,
      awayWinRate: input.h2hAwayWinRate,
    };
  }
  return {
    homeWinRate: input.modelHomeWinRate,
    drawRate: input.modelDrawRate,
    awayWinRate: input.modelAwayWinRate,
  };
}

/**
 * Home live-score board shape.
 * Fields map to SportMonks livescores / fixtures includes on Starter + xG Basic.
 */

import type { LiveTimelineKind } from "./event-types";

export type LiveScoreSide = "home" | "away";

export type LiveScoreTimelineEvent = {
  id: number;
  kind: LiveTimelineKind;
  side: LiveScoreSide;
  minute: number;
  /** Injury / stoppage time beyond regulation minute, if any. */
  extraMinute: number | null;
  /** Display clock e.g. "67'" or "45+2'". */
  clockLabel: string;
  /** Primary player (scorer, carded, player ON for sub). */
  playerName: string | null;
  /**
   * Secondary player:
   * - goals: assist
   * - substitutions: player OFF
   */
  relatedPlayerName: string | null;
  info: string | null;
};

/** Live team metrics available via statistics / xGFixture on the plan. */
export type LiveScoreSideMetrics = {
  possessionPct: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  xg: number | null;
};

export type LiveScoreMatch = {
  matchSmId: number;
  leagueName: string;
  /** ISO 3166-1 alpha-2 (or regional like gb-eng) for flagcdn. */
  countryIso: string;
  countryName: string;
  stadiumName: string;
  gameweek: number | null;
  /** Display label e.g. "Matchweek 12" or "Round of 16". */
  roundLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamSmId: number;
  awayTeamSmId: number;
  /** SportMonks CDN or local `/team-logos/...` path. */
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  homeScore: number;
  awayScore: number;
  /** e.g. "1st Half", "HT", "2nd Half", "ET". */
  statusLabel: string;
  /** Elapsed minute when available from periods / events. */
  minute: number | null;
  /** Nominal match length for timeline scale (usually 90). */
  durationMinutes: number;
  kickoffAt: string | null;
  timeline: LiveScoreTimelineEvent[];
  homeMetrics: LiveScoreSideMetrics;
  awayMetrics: LiveScoreSideMetrics;
  /** True when this row is demo UI only (no live API row). */
  isPlaceholder?: boolean;
};

export type LiveScoresBoardPayload = {
  matches: LiveScoreMatch[];
  /** ISO timestamp of last successful livescore sync, if any. */
  syncedAt: string | null;
  source: "live" | "placeholder";
};

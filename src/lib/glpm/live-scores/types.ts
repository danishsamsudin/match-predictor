/**
 * Home live-score board shape.
 * Fields map to SportMonks livescores / fixtures includes on Starter + xG Basic.
 */

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
  kickoffAt: string | null;
  /** True when this row is demo UI only (no live API row). */
  isPlaceholder?: boolean;
};

export type LiveScoresBoardPayload = {
  matches: LiveScoreMatch[];
  /** ISO timestamp of last successful livescore sync, if any. */
  syncedAt: string | null;
  source: "live" | "placeholder";
};

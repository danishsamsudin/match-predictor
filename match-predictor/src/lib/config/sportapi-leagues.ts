/**
 * Maps UI/reference league IDs (legacy API-Football ids) to SportAPI7 identifiers.
 * uniqueTournamentId is stable across seasons; categoryId groups fixtures by country.
 */
export interface SportApiLeagueMapping {
  uniqueTournamentId: number;
  categoryId: number;
  displayName: string;
}

/** Reference league id → SportAPI7 ids */
export const SPORTAPI_LEAGUE_MAP: Record<number, SportApiLeagueMapping> = {
  39: { uniqueTournamentId: 17, categoryId: 1, displayName: "Premier League" },
  40: { uniqueTournamentId: 18, categoryId: 1, displayName: "Championship" },
  140: { uniqueTournamentId: 8, categoryId: 32, displayName: "La Liga" },
  78: { uniqueTournamentId: 35, categoryId: 30, displayName: "Bundesliga" },
  135: { uniqueTournamentId: 23, categoryId: 31, displayName: "Serie A" },
  61: { uniqueTournamentId: 34, categoryId: 7, displayName: "Ligue 1" },
  88: { uniqueTournamentId: 37, categoryId: 35, displayName: "Eredivisie" },
  94: { uniqueTournamentId: 238, categoryId: 44, displayName: "Primeira Liga" },
  2: { uniqueTournamentId: 7, categoryId: 1465, displayName: "UEFA Champions League" },
  3: { uniqueTournamentId: 679, categoryId: 1465, displayName: "UEFA Europa League" },
};

/** SportAPI category id → country label used in the UI */
export const SPORTAPI_CATEGORY_COUNTRIES: Record<number, string> = {
  1: "England",
  32: "Spain",
  30: "Germany",
  31: "Italy",
  7: "France",
  35: "Netherlands",
  44: "Portugal",
  1465: "World",
};

export function resolveSportApiLeague(referenceLeagueId: number): SportApiLeagueMapping | undefined {
  return SPORTAPI_LEAGUE_MAP[referenceLeagueId];
}

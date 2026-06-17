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
  // Tier 1 — daily sync
  39: { uniqueTournamentId: 17, categoryId: 1, displayName: "Premier League" },
  140: { uniqueTournamentId: 8, categoryId: 32, displayName: "La Liga" },
  78: { uniqueTournamentId: 35, categoryId: 30, displayName: "Bundesliga" },
  135: { uniqueTournamentId: 23, categoryId: 31, displayName: "Serie A" },
  61: { uniqueTournamentId: 34, categoryId: 7, displayName: "Ligue 1" },
  88: { uniqueTournamentId: 37, categoryId: 35, displayName: "Eredivisie" },
  2: { uniqueTournamentId: 7, categoryId: 1465, displayName: "UEFA Champions League" },
  3: { uniqueTournamentId: 679, categoryId: 1465, displayName: "UEFA Europa League" },
  // Tier 2 — rotate every 2–3 days
  40: { uniqueTournamentId: 18, categoryId: 1, displayName: "Championship" },
  141: { uniqueTournamentId: 54, categoryId: 32, displayName: "Segunda División" },
  79: { uniqueTournamentId: 44, categoryId: 30, displayName: "2. Bundesliga" },
  136: { uniqueTournamentId: 53, categoryId: 31, displayName: "Serie B" },
  62: { uniqueTournamentId: 182, categoryId: 7, displayName: "Ligue 2" },
  253: { uniqueTournamentId: 242, categoryId: 130, displayName: "MLS" },
  307: { uniqueTournamentId: 955, categoryId: 292, displayName: "Saudi Pro League" },
  // Tier 3 — weekly
  848: { uniqueTournamentId: 17015, categoryId: 1465, displayName: "UEFA Conference League" },
  // International — national teams
  1: { uniqueTournamentId: 16, categoryId: 1465, displayName: "FIFA World Cup" },
  4: { uniqueTournamentId: 1, categoryId: 1465, displayName: "UEFA Euro" },
  5: { uniqueTournamentId: 10783, categoryId: 1465, displayName: "UEFA Nations League" },
  6: { uniqueTournamentId: 133, categoryId: 1465, displayName: "Copa América" },
};

/** SportAPI category id → country label used in the UI */
export const SPORTAPI_CATEGORY_COUNTRIES: Record<number, string> = {
  1: "England",
  32: "Spain",
  30: "Germany",
  31: "Italy",
  7: "France",
  35: "Netherlands",
  130: "USA",
  292: "Saudi Arabia",
  1465: "World",
};

export function resolveSportApiLeague(referenceLeagueId: number): SportApiLeagueMapping | undefined {
  return SPORTAPI_LEAGUE_MAP[referenceLeagueId];
}

export function getAllMappedLeagueIds(): number[] {
  return Object.keys(SPORTAPI_LEAGUE_MAP).map(Number);
}

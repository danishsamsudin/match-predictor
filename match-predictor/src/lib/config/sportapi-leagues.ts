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
  94: { uniqueTournamentId: 238, categoryId: 44, displayName: "Primeira Liga" },
  2: { uniqueTournamentId: 7, categoryId: 1465, displayName: "UEFA Champions League" },
  3: { uniqueTournamentId: 679, categoryId: 1465, displayName: "UEFA Europa League" },
  // Tier 2 — rotate every 2–3 days
  40: { uniqueTournamentId: 18, categoryId: 1, displayName: "Championship" },
  141: { uniqueTournamentId: 54, categoryId: 32, displayName: "Segunda División" },
  79: { uniqueTournamentId: 44, categoryId: 30, displayName: "2. Bundesliga" },
  136: { uniqueTournamentId: 53, categoryId: 31, displayName: "Serie B" },
  62: { uniqueTournamentId: 182, categoryId: 7, displayName: "Ligue 2" },
  144: { uniqueTournamentId: 38, categoryId: 33, displayName: "Pro League" },
  179: { uniqueTournamentId: 36, categoryId: 26, displayName: "Premiership" },
  203: { uniqueTournamentId: 52, categoryId: 46, displayName: "Süper Lig" },
  253: { uniqueTournamentId: 242, categoryId: 130, displayName: "MLS" },
  71: { uniqueTournamentId: 325, categoryId: 13, displayName: "Brasileirão Série A" },
  128: { uniqueTournamentId: 155, categoryId: 48, displayName: "Liga Profesional" },
  307: { uniqueTournamentId: 955, categoryId: 292, displayName: "Saudi Pro League" },
  // Tier 3 — weekly
  197: { uniqueTournamentId: 185, categoryId: 67, displayName: "Super League" },
  218: { uniqueTournamentId: 45, categoryId: 17, displayName: "Bundesliga" },
  207: { uniqueTournamentId: 215, categoryId: 25, displayName: "Super League" },
  119: { uniqueTournamentId: 39, categoryId: 8, displayName: "Superliga" },
  103: { uniqueTournamentId: 20, categoryId: 5, displayName: "Eliteserien" },
  113: { uniqueTournamentId: 40, categoryId: 9, displayName: "Allsvenskan" },
  262: { uniqueTournamentId: 11621, categoryId: 116, displayName: "Liga MX" },
  98: { uniqueTournamentId: 196, categoryId: 52, displayName: "J1 League" },
  292: { uniqueTournamentId: 410, categoryId: 291, displayName: "K League 1" },
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
  44: "Portugal",
  33: "Belgium",
  26: "Scotland",
  46: "Turkey",
  67: "Greece",
  17: "Austria",
  25: "Switzerland",
  8: "Denmark",
  5: "Norway",
  9: "Sweden",
  130: "USA",
  116: "Mexico",
  13: "Brazil",
  48: "Argentina",
  292: "Saudi Arabia",
  52: "Japan",
  291: "South Korea",
  1465: "World",
};

export function resolveSportApiLeague(referenceLeagueId: number): SportApiLeagueMapping | undefined {
  return SPORTAPI_LEAGUE_MAP[referenceLeagueId];
}

export function getAllMappedLeagueIds(): number[] {
  return Object.keys(SPORTAPI_LEAGUE_MAP).map(Number);
}

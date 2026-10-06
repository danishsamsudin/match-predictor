import { SM_LEAGUE } from "@/lib/sportmonks/constants";

/** The Odds API sport keys for our five GLPM leagues. */
export const ODDS_SPORT_BY_LEAGUE_SM_ID: Record<number, string> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: "soccer_epl",
  [SM_LEAGUE.EREDIVISIE]: "soccer_netherlands_eredivisie",
  [SM_LEAGUE.BUNDESLIGA]: "soccer_germany_bundesliga",
  [SM_LEAGUE.SERIE_A]: "soccer_italy_serie_a",
  [SM_LEAGUE.CHAMPIONSHIP]: "soccer_efl_champ",
};

export const ODDS_SPORT_KEYS = Object.values(ODDS_SPORT_BY_LEAGUE_SM_ID);

export function sportKeyForLeagueSmId(leagueSmId: number): string | null {
  return ODDS_SPORT_BY_LEAGUE_SM_ID[leagueSmId] ?? null;
}

export function isSupportedOddsLeague(leagueSmId: number): boolean {
  return leagueSmId in ODDS_SPORT_BY_LEAGUE_SM_ID;
}

/** Bookmakers: Pinnacle + Unibet NL (≤10 books = 1 region for quota). */
export const ODDS_BOOKMAKERS = "pinnacle,unibet_nl" as const;

/**
 * Featured markets on the sport-level /odds endpoint.
 * Cost = unique markets returned × 1 bookmaker-group.
 * Soccer often returns h2h; totals when the books list them.
 */
export const ODDS_FEATURED_MARKETS = "h2h,totals" as const;

/**
 * Extra markets via /events/{id}/odds (BTTS is not on the featured endpoint).
 * Kept separate so we only spend credits when the user opens a match.
 */
export const ODDS_EVENT_EXTRA_MARKETS = "btts" as const;

/** Cache TTL: covers evening day-before check through morning day-of. */
export const ODDS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Soft daily credit budget so a busy month stays under the free 500.
 * League featured fetch ≈ 1–2 credits; event BTTS ≈ 1 credit.
 */
export const ODDS_DAILY_CREDIT_LIMIT = 15;

/** Look ahead this many hours when warming / matching fixtures. */
export const ODDS_LOOKAHEAD_HOURS = 36;

/** Include fixtures that kicked off up to this many hours ago (late fills). */
export const ODDS_LOOKBACK_HOURS = 3;

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
 * Extra markets via /events/{id}/odds.
 * Cost = unique markets returned × 1 bookmaker-group (empty markets are free).
 * Cached per event for 12h so opening the same match again is free.
 */
export const ODDS_EVENT_EXTRA_MARKETS =
  "btts,spreads,alternate_spreads,alternate_totals,team_totals,alternate_team_totals" as const;

/** Cache TTL: covers evening day-before check through morning day-of. */
export const ODDS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Soft daily credit budget. Event deep-market calls can cost ~3–6 credits each;
 * 12h cache keeps real month usage well under the free 500.
 */
export const ODDS_DAILY_CREDIT_LIMIT = 40;

/** Look ahead this many hours when warming / matching fixtures.
 * Wide enough for midweek prep of weekend matchdays (not only day-before). */
export const ODDS_LOOKAHEAD_HOURS = 7 * 24;

/** Include fixtures that kicked off up to this many hours ago (late fills). */
export const ODDS_LOOKBACK_HOURS = 6;

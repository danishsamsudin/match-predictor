/** Bookmaker keys we request from The Odds API (EU). */
export type OddsBookmakerKey = "pinnacle" | "unibet_nl" | "unibet";

export type OddsBookSource = "pinnacle" | "unibet";

export type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
  /** Present on team totals / some prop markets (team name). */
  description?: string;
};

export type OddsApiMarket = {
  key: string;
  last_update?: string;
  outcomes: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsApiMarket[];
};

export type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

/** One Value Opportunities row after Pinnacle vs Unibet selection. */
export type SelectedBookOdds = {
  rowId: string;
  price: number;
  source: OddsBookSource;
  /** True when Unibet beat Pinnacle on this selection. */
  unibetPreferred: boolean;
  pinnaclePrice: number | null;
  unibetPrice: number | null;
};

export type MatchOddsResult = {
  matched: boolean;
  sportKey: string | null;
  eventId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  commenceTime: string | null;
  rows: SelectedBookOdds[];
  /** Map of rowId → decimal odds string for inputs. */
  bookByRowId: Record<string, string>;
  /** Map of rowId → which book won. */
  sourceByRowId: Record<string, OddsBookSource>;
  fromCache: boolean;
  creditsUsedThisCall: number;
  requestsRemaining: number | null;
  requestsUsed: number | null;
  fetchedAt: string | null;
  message: string | null;
};

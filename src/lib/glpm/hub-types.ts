/**
 * Client-safe hub payload types.
 */

export type GlpmHubPredictionSource = "stored" | "live" | "prior";

export type GlpmHubWeather = {
  /** available = real kickoff forecast; tbc = match too far out / not yet forecastable */
  status: "available" | "tbc";
  condition: string | null;
  tempC: number | null;
  weatherCode?: number;
  source: "sportmonks" | "open-meteo" | "pending";
  /** Home-ground venue label used for the forecast. */
  venueName?: string | null;
  cityName?: string | null;
};

export type GlpmHubRatingLeader = {
  teamSmId: number;
  teamName: string;
  overall: number;
  attack: number;
  defence: number;
  goalkeeper: number;
  buildUp: number;
  possession: number;
  pressing: number;
  finishing: number;
  asOfDate: string;
};

export type GlpmHubMatchSummaryStats = {
  goals: number | null;
  xg: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  possession: number | null;
  ppda: number | null;
};

export type GlpmHubRecentMatch = {
  matchSmId: number;
  homeName: string;
  awayName: string;
  homeTeamSmId: number;
  awayTeamSmId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  date: string | null;
  homeStats: GlpmHubMatchSummaryStats | null;
  awayStats: GlpmHubMatchSummaryStats | null;
  model: {
    homeWin: number;
    draw: number;
    awayWin: number;
    homeXg: number;
    awayXg: number;
  } | null;
};

export type GlpmHubUpcomingMatch = {
  matchSmId: number;
  homeName: string;
  awayName: string;
  homeTeamSmId: number;
  awayTeamSmId: number;
  date: string | null;
  kickoffAt: string | null;
  venue: string | null;
  gameweek: number | null;
  prediction: {
    homeWin: number;
    draw: number;
    awayWin: number;
    homeXg: number;
    awayXg: number;
    over25: number;
    bttsYes: number;
  } | null;
  predictionSource: GlpmHubPredictionSource | null;
  weather: GlpmHubWeather | null;
};

/** League table row derived from finished GLPM matches. */
export type GlpmStandingRankMovement = "up" | "down" | "same" | "new";

export type GlpmStandingRow = {
  rank: number;
  teamSmId: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Most recent first, e.g. ["W","D","L","W","W"]. */
  form: Array<"W" | "D" | "L">;
  /** Rank before the last results change; null until first standings refresh. */
  previousRank?: number | null;
  /** previousRank - rank; positive means the team moved up the table. */
  rankDelta?: number;
  rankMovement?: GlpmStandingRankMovement;
};

export type GlpmHubPayload = {
  competition: { smId: number; name: string; areaName: string | null } | null;
  season: { smId: number; name: string | null } | null;
  competitions: Array<{
    smId: number;
    name: string;
    areaName: string | null;
    defaultSeasonId: number | null;
  }>;
  seasons: Array<{
    smId: number;
    name: string | null;
    competitionId: number;
    hasVectors: boolean;
    hasFinishedMatches: boolean;
    hasUpcomingMatches: boolean;
    isPredictReady: boolean;
  }>;
  ratingLeaders: GlpmHubRatingLeader[];
  recent: GlpmHubRecentMatch[];
  upcoming: GlpmHubUpcomingMatch[];
  updatedAt: string;
};

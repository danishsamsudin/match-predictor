/**
 * Client-safe hub payload types.
 */

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

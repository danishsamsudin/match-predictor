export interface SportApiTeam {
  id: number;
  name: string;
  shortName?: string;
  slug?: string;
}

export interface SportApiTournament {
  id: number;
  name: string;
  uniqueTournament?: { id: number; name: string; slug?: string };
  category?: { id: number; name: string; slug?: string };
}

export interface SportApiSeason {
  id: number;
  name?: string;
  year?: string;
}

export interface SportApiEvent {
  id: number;
  startTimestamp?: number;
  startTime?: string;
  homeTeam: SportApiTeam;
  awayTeam: SportApiTeam;
  tournament: SportApiTournament;
  season: SportApiSeason;
  status?: { type?: string; description?: string };
  homeScore?: { current?: number; display?: number };
  awayScore?: { current?: number; display?: number };
  venue?: {
    city?: { name?: string };
    stadium?: { name?: string; capacity?: number };
  };
}

export interface SportApiScheduledEventsResponse {
  events: SportApiEvent[];
}

export interface SportApiCategoriesResponse {
  categories: Array<{ category: { id: number; name: string; slug?: string; flag?: string } }>;
}

export interface SportApiSeasonsResponse {
  seasons: SportApiSeason[];
}

export interface SportApiStandingsResponse {
  standings: Array<{
    type: string;
    rows: Array<{
      team: SportApiTeam;
      position: number;
      matches: number;
      wins: number;
      draws: number;
      losses: number;
      scoresFor: number;
      scoresAgainst: number;
      points: number;
    }>;
  }>;
}

export interface SportApiLineupsResponse {
  confirmed?: boolean;
  home?: SportApiLineupSide;
  away?: SportApiLineupSide;
}

export interface SportApiLineupSide {
  players: Array<{
    player: {
      id: number;
      name: string;
      position?: string;
      jerseyNumber?: string;
    };
    substitute?: boolean;
    position?: string;
  }>;
  formation?: string;
}

export interface SportApiStatisticsResponse {
  statistics: Array<{
    period: string;
    groups: Array<{
      groupName: string;
      statisticsItems: Array<{
        name: string;
        home: string | number;
        away: string | number;
      }>;
    }>;
  }>;
}

export interface SportApiIncidentsResponse {
  incidents: Array<{
    incidentType: string;
    time: number;
    isHome?: boolean;
    player?: { id: number; name: string };
    playerIn?: { id: number; name: string };
    playerOut?: { id: number; name: string };
  }>;
}

export interface SportApiTopPlayersResponse {
  topPlayers: Array<{
    player: { id: number; name: string };
    team: SportApiTeam;
    statistics: { goals?: number; appearances?: number };
  }>;
}

export interface SportApiTeamEventsResponse {
  events: SportApiEvent[];
}

export interface SportApiH2HResponse {
  events: SportApiEvent[];
}

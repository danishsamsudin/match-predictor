export interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, string | number>;
  errors: string[] | Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T;
}

export interface Fixture {
  fixture: {
    id: number;
    date: string;
    venue: { id: number; name: string; city: string };
  };
  league: { id: number; name: string; season: number };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

export interface TeamStatistics {
  team: { id: number; name: string };
  league: { id: number; season: number };
  form: string;
  goals: {
    for: {
      average: { home: string; away: string; total: string };
    };
    against: {
      average: { home: string; away: string; total: string };
    };
  };
  cards: {
    yellow: Record<string, { total: number | null; percentage: string | null }>;
    red: Record<string, { total: number | null; percentage: string | null }>;
  };
  lineups: Array<{ formation: string; played: number }>;
  fouls: {
    drawn: { total: number; average: { home: string; away: string; total: string } };
    committed: { total: number; average: { home: string; away: string; total: string } };
  };
  shots: {
    on: { total: number; average: { home: string; away: string; total: string } };
  };
  corners: {
    total: number;
    average: { home: string; away: string; total: string };
  };
}

export interface FixtureResult {
  fixture: { id: number; date: string; status: { short: string } };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}

export interface LineupPlayer {
  player: {
    id: number;
    name: string;
    number: number;
    pos: string;
    grid: string | null;
    averageRating?: number;
  };
}

export interface FixtureLineup {
  team: { id: number; name: string };
  formation: string;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export interface TopScorer {
  player: { id: number; name: string };
  statistics: Array<{
    team: { id: number; name: string };
    games: { appearences: number | null };
    goals: { total: number | null };
  }>;
}

export interface TeamInfo {
  team: {
    id: number;
    name: string;
    country: string;
  };
  venue: {
    id: number;
    name: string;
    address: string;
    city: string;
    capacity: number;
    surface: string;
    image: string;
  };
}

export interface FootballBundle {
  fixture: Fixture;
  homeStats: TeamStatistics;
  awayStats: TeamStatistics;
  homeForm: FixtureResult[];
  awayForm: FixtureResult[];
  h2h: FixtureResult[];
  lineups: FixtureLineup[];
  topScorers: TopScorer[];
  homeTeamInfo: TeamInfo;
  awayTeamInfo: TeamInfo;
}

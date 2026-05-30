import type {
  Fixture,
  FixtureLineup,
  FixtureResult,
  FootballBundle,
  TeamInfo,
  TeamStatistics,
  TopScorer,
} from "@/lib/types/football";

const MOCK_FIXTURE: Fixture = {
  fixture: {
    id: 1035037,
    date: "2026-05-29T15:00:00+00:00",
    venue: { id: 556, name: "Old Trafford", city: "Manchester" },
  },
  league: { id: 39, name: "Premier League", season: 2025 },
  teams: {
    home: { id: 33, name: "Manchester United" },
    away: { id: 40, name: "Liverpool" },
  },
};

function mockStats(teamId: number, teamName: string): TeamStatistics {
  return {
    team: { id: teamId, name: teamName },
    league: { id: 39, season: 2025 },
    form: "WWDLW",
    goals: {
      for: {
        average: { home: "1.8", away: "1.4", total: "1.6" },
      },
      against: {
        average: { home: "0.9", away: "1.2", total: "1.0" },
      },
    },
    cards: {
      yellow: {
        "0-15": { total: 2, percentage: "10%" },
        "16-30": { total: 5, percentage: "25%" },
        "31-45": { total: 3, percentage: "15%" },
        "46-60": { total: 4, percentage: "20%" },
        "61-75": { total: 3, percentage: "15%" },
        "76-90": { total: 3, percentage: "15%" },
      },
      red: {
        "0-15": { total: 0, percentage: null },
        "16-30": { total: 0, percentage: null },
        "31-45": { total: 1, percentage: "50%" },
        "46-60": { total: 0, percentage: null },
        "61-75": { total: 0, percentage: null },
        "76-90": { total: 1, percentage: "50%" },
      },
    },
    lineups: [{ formation: "4-2-3-1", played: 30 }],
    fouls: {
      drawn: { total: 300, average: { home: "10.0", away: "9.5", total: "10.0" } },
      committed: { total: 330, average: { home: "11.0", away: "10.5", total: "11.0" } },
    },
    shots: {
      on: { total: 150, average: { home: "5.5", away: "4.5", total: "5.0" } },
    },
    corners: {
      total: 180,
      average: { home: "6.0", away: "5.5", total: "6.0" },
    },
  };
}

function mockForm(teamId: number, teamName: string): FixtureResult[] {
  return [
    {
      fixture: { id: 1, date: "2026-05-20", status: { short: "FT" } },
      teams: {
        home: { id: teamId, name: teamName, winner: true },
        away: { id: 999, name: "Opponent A", winner: false },
      },
      goals: { home: 2, away: 1 },
    },
    {
      fixture: { id: 2, date: "2026-05-13", status: { short: "FT" } },
      teams: {
        home: { id: 998, name: "Opponent B", winner: false },
        away: { id: teamId, name: teamName, winner: true },
      },
      goals: { home: 0, away: 1 },
    },
    {
      fixture: { id: 3, date: "2026-05-06", status: { short: "FT" } },
      teams: {
        home: { id: teamId, name: teamName, winner: null },
        away: { id: 997, name: "Opponent C", winner: null },
      },
      goals: { home: 1, away: 1 },
    },
    {
      fixture: { id: 4, date: "2026-04-29", status: { short: "FT" } },
      teams: {
        home: { id: 996, name: "Opponent D", winner: true },
        away: { id: teamId, name: teamName, winner: false },
      },
      goals: { home: 3, away: 0 },
    },
    {
      fixture: { id: 5, date: "2026-04-22", status: { short: "FT" } },
      teams: {
        home: { id: teamId, name: teamName, winner: true },
        away: { id: 995, name: "Opponent E", winner: false },
      },
      goals: { home: 2, away: 0 },
    },
  ];
}

function mockLineup(teamId: number, teamName: string, includeTopScorer: boolean): FixtureLineup {
  const scorers = includeTopScorer
    ? [{ player: { id: 1001, name: "Star Striker", number: 9, pos: "F", grid: "5:2" } }]
    : [];
  const base = [
    { player: { id: 1000, name: "Goalkeeper", number: 1, pos: "G", grid: "1:1" } },
    { player: { id: 1002, name: "Defender A", number: 4, pos: "D", grid: "2:1" } },
    { player: { id: 1003, name: "Defender B", number: 5, pos: "D", grid: "2:2" } },
    { player: { id: 1004, name: "Midfielder A", number: 8, pos: "M", grid: "3:2" } },
    { player: { id: 1005, name: "Midfielder B", number: 10, pos: "M", grid: "4:2" } },
  ];
  return {
    team: { id: teamId, name: teamName },
    formation: "4-2-3-1",
    startXI: [...base, ...scorers].map((p) => ({ player: p.player })),
    substitutes: [],
  };
}

function mockTopScorers(): TopScorer[] {
  return [
    {
      player: { id: 1001, name: "Star Striker" },
      statistics: [{ team: { id: 33, name: "Manchester United" }, games: { appearences: 30 }, goals: { total: 18 } }],
    },
    {
      player: { id: 2001, name: "Away Striker" },
      statistics: [{ team: { id: 40, name: "Liverpool" }, games: { appearences: 28 }, goals: { total: 22 } }],
    },
  ];
}

function mockTeamInfo(teamId: number, teamName: string, city: string): TeamInfo {
  return {
    team: { id: teamId, name: teamName, country: "England" },
    venue: {
      id: teamId,
      name: `${teamName} Stadium`,
      address: "1 Stadium Way",
      city,
      capacity: 75000,
      surface: "grass",
      image: "",
    },
  };
}

export function getMockFootballBundle(
  matchId: number,
  homeTeamId: number,
  awayTeamId: number
): FootballBundle {
  const fixture = {
    ...MOCK_FIXTURE,
    fixture: { ...MOCK_FIXTURE.fixture, id: matchId },
    teams: {
      home: { id: homeTeamId, name: "Home Team" },
      away: { id: awayTeamId, name: "Away Team" },
    },
  };

  return {
    fixture,
    homeStats: mockStats(homeTeamId, "Home Team"),
    awayStats: mockStats(awayTeamId, "Away Team"),
    homeForm: mockForm(homeTeamId, "Home Team"),
    awayForm: mockForm(awayTeamId, "Away Team"),
    h2h: mockForm(homeTeamId, "Home Team"),
    lineups: [
      mockLineup(homeTeamId, "Home Team", true),
      mockLineup(awayTeamId, "Away Team", false),
    ],
    topScorers: mockTopScorers(),
    homeTeamInfo: mockTeamInfo(homeTeamId, "Home Team", "Manchester"),
    awayTeamInfo: mockTeamInfo(awayTeamId, "Away Team", "Liverpool"),
  };
}

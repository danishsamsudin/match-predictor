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

const MOCK_OPPONENT_PATTERN = /^Opponent [A-E]$/;

/** Detect placeholder recent-form rows from getMockFootballBundle. */
export function isMockFixtureForm(form: FixtureResult[]): boolean {
  if (!form.length) return false;
  return form.some((match) =>
    [match.teams.home.name, match.teams.away.name].some((name) =>
      MOCK_OPPONENT_PATTERN.test(name)
    )
  );
}

function mockForm(teamId: number, teamName: string): FixtureResult[] {
  const pattern = ["W", "D", "L"] as const;
  const results: Array<"W" | "D" | "L"> = [];
  for (let i = 0; i < 5; i++) {
    results.push(pattern[(teamId + i * 2) % 3]);
  }

  return results.map((result, index) => {
    const opponentId = 990 + index;
    const isHome = index % 2 === 0;
    const homeGoals = result === "W" ? 2 : result === "D" ? 1 : 0;
    const awayGoals = result === "L" ? 2 : result === "D" ? 1 : 0;

    if (isHome) {
      return {
        fixture: { id: teamId * 10 + index, date: `2026-05-${20 - index * 7}`, status: { short: "FT" } },
        teams: {
          home: { id: teamId, name: teamName, winner: result === "W" ? true : result === "L" ? false : null },
          away: { id: opponentId, name: `Opponent ${String.fromCharCode(65 + index)}`, winner: result === "L" ? true : result === "W" ? false : null },
        },
        goals: { home: homeGoals, away: awayGoals },
      };
    }

    return {
      fixture: { id: teamId * 10 + index, date: `2026-05-${20 - index * 7}`, status: { short: "FT" } },
      teams: {
        home: { id: opponentId, name: `Opponent ${String.fromCharCode(65 + index)}`, winner: result === "L" ? true : result === "W" ? false : null },
        away: { id: teamId, name: teamName, winner: result === "W" ? true : result === "L" ? false : null },
      },
      goals: { home: awayGoals, away: homeGoals },
    };
  });
}

function mockH2H(
  homeTeamId: number,
  awayTeamId: number,
  homeName: string,
  awayName: string
): FixtureResult[] {
  const outcomes: Array<{ homeGoals: number; awayGoals: number }> = [
    { homeGoals: 2, awayGoals: 0 },
    { homeGoals: 1, awayGoals: 1 },
    { homeGoals: 0, awayGoals: 2 },
    { homeGoals: 3, awayGoals: 1 },
    { homeGoals: 1, awayGoals: 0 },
  ];

  return outcomes.map((score, index) => {
    const flip = (homeTeamId + awayTeamId + index) % 2 === 1;
    const homeGoals = flip ? score.awayGoals : score.homeGoals;
    const awayGoals = flip ? score.homeGoals : score.awayGoals;
    const homeWinner = homeGoals > awayGoals ? true : homeGoals < awayGoals ? false : null;
    const awayWinner = awayGoals > homeGoals ? true : awayGoals < homeGoals ? false : null;

    return {
      fixture: { id: 9000 + index, date: `2025-0${index + 1}-15`, status: { short: "FT" } },
      teams: {
        home: { id: homeTeamId, name: homeName, winner: homeWinner },
        away: { id: awayTeamId, name: awayName, winner: awayWinner },
      },
      goals: { home: homeGoals, away: awayGoals },
    };
  });
}

function mockLineup(teamId: number, teamName: string, includeTopScorer: boolean): FixtureLineup {
  const scorers = includeTopScorer
    ? [{ player: { id: 1001, name: "Star Striker", number: 9, pos: "F", grid: "5:2" } }]
    : [];
  const base = [
    { player: { id: 1000, name: "Goalkeeper", number: 1, pos: "G", grid: "1:1", averageRating: 6.2 } },
    { player: { id: 1002, name: "Defender A", number: 4, pos: "D", grid: "2:1", averageRating: 6.1 } },
    { player: { id: 1003, name: "Defender B", number: 5, pos: "D", grid: "2:2", averageRating: 6.0 } },
    { player: { id: 1004, name: "Midfielder A", number: 8, pos: "M", grid: "3:2", averageRating: 6.4 } },
    { player: { id: 1005, name: "Midfielder B", number: 10, pos: "M", grid: "4:2", averageRating: 6.3 } },
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
    h2h: mockH2H(homeTeamId, awayTeamId, "Home Team", "Away Team"),
    lineups: [
      mockLineup(homeTeamId, "Home Team", true),
      mockLineup(awayTeamId, "Away Team", false),
    ],
    topScorers: mockTopScorers(),
    homeTeamInfo: mockTeamInfo(homeTeamId, "Home Team", "Manchester"),
    awayTeamInfo: mockTeamInfo(awayTeamId, "Away Team", "Liverpool"),
  };
}

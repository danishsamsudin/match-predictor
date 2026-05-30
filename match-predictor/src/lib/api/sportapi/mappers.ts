import type {
  Fixture,
  FixtureLineup,
  FixtureResult,
  TeamInfo,
  TeamStatistics,
  TopScorer,
} from "@/lib/types/football";
import type {
  SportApiEvent,
  SportApiLineupsResponse,
  SportApiStandingsResponse,
  SportApiStatisticsResponse,
  SportApiTopPlayersResponse,
} from "@/lib/types/sportapi";

function eventKickoffIso(event: SportApiEvent): string {
  if (event.startTimestamp) {
    return new Date(event.startTimestamp * 1000).toISOString();
  }
  if (event.startTime) return event.startTime;
  return new Date().toISOString();
}

function mapPosition(pos?: string): string {
  if (!pos) return "M";
  const p = pos.toUpperCase();
  if (p === "G" || p.includes("GOAL")) return "G";
  if (p === "D" || p.includes("DEF")) return "D";
  if (p === "F" || p.includes("FOR") || p.includes("ATT")) return "F";
  return "M";
}

export function mapEventToFixture(
  event: SportApiEvent,
  referenceLeagueId: number,
  seasonYear: number
): Fixture {
  const venueName = event.venue?.stadium?.name ?? "Stadium";
  const venueCity = event.venue?.city?.name ?? "Unknown";
  return {
    fixture: {
      id: event.id,
      date: eventKickoffIso(event),
      venue: { id: 0, name: venueName, city: venueCity },
    },
    league: {
      id: referenceLeagueId,
      name: event.tournament.uniqueTournament?.name ?? event.tournament.name,
      season: seasonYear,
    },
    teams: {
      home: { id: event.homeTeam.id, name: event.homeTeam.name },
      away: { id: event.awayTeam.id, name: event.awayTeam.name },
    },
  };
}

export function mapEventToFixtureOption(
  event: SportApiEvent,
  referenceLeagueId: number,
  seasonYear: number
) {
  const fixture = mapEventToFixture(event, referenceLeagueId, seasonYear);
  return {
    id: fixture.fixture.id,
    date: fixture.fixture.date,
    venueCity: fixture.fixture.venue.city,
    league: fixture.league,
    home: fixture.teams.home,
    away: fixture.teams.away,
  };
}

function winnerFromScores(
  homeGoals: number | null,
  awayGoals: number | null
): { home: boolean | null; away: boolean | null } {
  if (homeGoals === null || awayGoals === null) {
    return { home: null, away: null };
  }
  if (homeGoals > awayGoals) return { home: true, away: false };
  if (homeGoals < awayGoals) return { home: false, away: true };
  return { home: null, away: null };
}

export function mapEventToFixtureResult(event: SportApiEvent): FixtureResult {
  const homeGoals = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const awayGoals = event.awayScore?.current ?? event.awayScore?.display ?? null;
  const winners = winnerFromScores(
    homeGoals ?? null,
    awayGoals ?? null
  );
  return {
    fixture: {
      id: event.id,
      date: eventKickoffIso(event),
      status: { short: event.status?.type ?? "FT" },
    },
    teams: {
      home: {
        id: event.homeTeam.id,
        name: event.homeTeam.name,
        winner: winners.home,
      },
      away: {
        id: event.awayTeam.id,
        name: event.awayTeam.name,
        winner: winners.away,
      },
    },
    goals: { home: homeGoals ?? null, away: awayGoals ?? null },
  };
}

function avgPerMatch(total: number, matches: number): string {
  if (!matches) return "0";
  return (total / matches).toFixed(2);
}

export function mapStandingsRowToTeamStatistics(
  row: SportApiStandingsResponse["standings"][0]["rows"][0],
  leagueId: number,
  season: number,
  isHomeSide: boolean
): TeamStatistics {
  const matches = row.matches || 1;
  const goalsFor = row.scoresFor;
  const goalsAgainst = row.scoresAgainst;
  const homeAvg = isHomeSide ? avgPerMatch(goalsFor * 0.55, matches) : avgPerMatch(goalsFor * 0.45, matches);
  const awayAvg = isHomeSide ? avgPerMatch(goalsFor * 0.45, matches) : avgPerMatch(goalsFor * 0.55, matches);
  const totalAvg = avgPerMatch(goalsFor, matches);
  const againstHome = isHomeSide
    ? avgPerMatch(goalsAgainst * 0.45, matches)
    : avgPerMatch(goalsAgainst * 0.55, matches);
  const againstAway = isHomeSide
    ? avgPerMatch(goalsAgainst * 0.55, matches)
    : avgPerMatch(goalsAgainst * 0.45, matches);
  const againstTotal = avgPerMatch(goalsAgainst, matches);

  const formChars: string[] = [];
  const formLen = Math.min(5, row.wins + row.draws + row.losses);
  for (let i = 0; i < row.wins && formChars.length < formLen; i++) formChars.push("W");
  for (let i = 0; i < row.draws && formChars.length < formLen; i++) formChars.push("D");
  for (let i = 0; i < row.losses && formChars.length < formLen; i++) formChars.push("L");

  return {
    team: { id: row.team.id, name: row.team.name },
    league: { id: leagueId, season },
    form: formChars.join("").slice(0, 5) || "WWDLW",
    goals: {
      for: {
        average: { home: homeAvg, away: awayAvg, total: totalAvg },
      },
      against: {
        average: { home: againstHome, away: againstAway, total: againstTotal },
      },
    },
    cards: {
      yellow: {
        "0-15": { total: 2, percentage: "10%" },
        "16-30": { total: 3, percentage: "15%" },
        "31-45": { total: 3, percentage: "15%" },
        "46-60": { total: 4, percentage: "20%" },
        "61-75": { total: 4, percentage: "20%" },
        "76-90": { total: 4, percentage: "20%" },
      },
      red: {
        "0-15": { total: 0, percentage: null },
        "16-30": { total: 0, percentage: null },
        "31-45": { total: 0, percentage: null },
        "46-60": { total: 1, percentage: "50%" },
        "61-75": { total: 0, percentage: null },
        "76-90": { total: 1, percentage: "50%" },
      },
    },
    lineups: [{ formation: "4-3-3", played: matches }],
    fouls: {
      drawn: { total: matches * 10, average: { home: "10", away: "10", total: "10" } },
      committed: { total: matches * 11, average: { home: "11", away: "11", total: "11" } },
    },
    shots: {
      on: { total: matches * 5, average: { home: "5", away: "5", total: "5" } },
    },
    corners: {
      total: matches * 6,
      average: { home: "6", away: "6", total: "6" },
    },
  };
}

function findStatValue(
  stats: SportApiStatisticsResponse,
  name: string,
  side: "home" | "away"
): number | null {
  for (const period of stats.statistics ?? []) {
    for (const group of period.groups ?? []) {
      for (const item of group.statisticsItems ?? []) {
        if (item.name.toLowerCase() === name.toLowerCase()) {
          const raw = side === "home" ? item.home : item.away;
          const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace("%", ""));
          return Number.isFinite(num) ? num : null;
        }
      }
    }
  }
  return null;
}

export function enrichTeamStatsFromMatchStatistics(
  stats: TeamStatistics,
  matchStats: SportApiStatisticsResponse,
  isHome: boolean
): TeamStatistics {
  const side = isHome ? "home" : "away";
  const possession = findStatValue(matchStats, "Ball possession", side);
  const shotsOn = findStatValue(matchStats, "Shots on target", side);
  const corners = findStatValue(matchStats, "Corner kicks", side);
  const fouls = findStatValue(matchStats, "Fouls", side);

  if (shotsOn !== null) {
    stats.shots.on.average[side] = String(shotsOn);
    stats.shots.on.average.total = String(shotsOn);
  }
  if (corners !== null) {
    stats.corners.average[side] = String(corners);
    stats.corners.average.total = String(corners);
  }
  if (fouls !== null) {
    stats.fouls.committed.average[side] = String(fouls);
    stats.fouls.committed.average.total = String(fouls);
  }
  if (possession !== null) {
    void possession;
  }
  return stats;
}

export function mapLineups(
  lineups: SportApiLineupsResponse,
  homeTeamId: number,
  awayTeamId: number,
  homeName: string,
  awayName: string
): FixtureLineup[] {
  const result: FixtureLineup[] = [];

  const mapSide = (
    side: SportApiLineupsResponse["home"],
    teamId: number,
    teamName: string
  ): FixtureLineup | null => {
    if (!side?.players?.length) return null;
    const starters = side.players.filter((p) => !p.substitute);
    const subs = side.players.filter((p) => p.substitute);
    return {
      team: { id: teamId, name: teamName },
      formation: side.formation ?? "4-3-3",
      startXI: starters.map((p, idx) => ({
        player: {
          id: p.player.id,
          name: p.player.name,
          number: Number(p.player.jerseyNumber) || idx + 1,
          pos: mapPosition(p.position ?? p.player.position),
          grid: null,
        },
      })),
      substitutes: subs.map((p, idx) => ({
        player: {
          id: p.player.id,
          name: p.player.name,
          number: Number(p.player.jerseyNumber) || idx + 12,
          pos: mapPosition(p.position ?? p.player.position),
          grid: null,
        },
      })),
    };
  };

  const home = mapSide(lineups.home, homeTeamId, homeName);
  const away = mapSide(lineups.away, awayTeamId, awayName);
  if (home) result.push(home);
  if (away) result.push(away);
  return result;
}

export function mapTopScorers(data: SportApiTopPlayersResponse): TopScorer[] {
  return (data.topPlayers ?? []).map((entry) => ({
    player: { id: entry.player.id, name: entry.player.name },
    statistics: [
      {
        team: { id: entry.team.id, name: entry.team.name },
        games: { appearences: entry.statistics.appearances ?? 10 },
        goals: { total: entry.statistics.goals ?? 0 },
      },
    ],
  }));
}

export function mapTeamInfo(
  teamId: number,
  teamName: string,
  city: string,
  venueName?: string
): TeamInfo {
  return {
    team: { id: teamId, name: teamName, country: "" },
    venue: {
      id: 0,
      name: venueName ?? `${teamName} Stadium`,
      address: "",
      city,
      capacity: 40000,
      surface: "grass",
      image: "",
    },
  };
}

export function parseSeasonYear(season?: { name?: string; year?: string }): number {
  if (season?.year) {
    const match = season.year.match(/(\d{4})/);
    if (match) return Number(match[1]);
  }
  if (season?.name) {
    const parts = season.name.split("/");
    const last = parts[parts.length - 1];
    const y = Number(last.length === 2 ? `20${last}` : last);
    if (Number.isFinite(y)) return y;
  }
  return new Date().getFullYear();
}

import { parseTeamStats } from "@/lib/api/football";
import type { TeamStatistics } from "@/lib/types/football";
import type { TeamStatAverages } from "@/lib/types/prediction";

function avgString(n: number): string {
  return String(n);
}

/** Rebuild TeamStatistics from stored metrics when full payload is missing. */
export function teamStatisticsFromMetrics(
  metrics: TeamStatAverages,
  team: { id: number; name: string },
  leagueId: number,
  season: number,
  isHomeSide: boolean
): TeamStatistics {
  const goalsForHome = isHomeSide ? metrics.goalsFor : metrics.goalsFor;
  const goalsForAway = isHomeSide ? metrics.goalsFor : metrics.goalsFor;
  const goalsAgainstHome = isHomeSide ? metrics.goalsAgainst : metrics.goalsAgainst;
  const goalsAgainstAway = isHomeSide ? metrics.goalsAgainst : metrics.goalsAgainst;

  return {
    team,
    league: { id: leagueId, season },
    form: "WWDLW",
    goals: {
      for: {
        average: {
          home: avgString(goalsForHome),
          away: avgString(goalsForAway),
          total: avgString(metrics.goalsFor),
        },
      },
      against: {
        average: {
          home: avgString(goalsAgainstHome),
          away: avgString(goalsAgainstAway),
          total: avgString(metrics.goalsAgainst),
        },
      },
    },
    cards: {
      yellow: {
        "0-15": { total: Math.round(metrics.yellowCards), percentage: null },
        "16-30": { total: 0, percentage: null },
        "31-45": { total: 0, percentage: null },
        "46-60": { total: 0, percentage: null },
        "61-75": { total: 0, percentage: null },
        "76-90": { total: 0, percentage: null },
      },
      red: {
        "0-15": { total: 0, percentage: null },
        "16-30": { total: 0, percentage: null },
        "31-45": { total: 0, percentage: null },
        "46-60": { total: 0, percentage: null },
        "61-75": { total: 0, percentage: null },
        "76-90": { total: Math.round(metrics.redCards), percentage: null },
      },
    },
    lineups: [{ formation: "4-3-3", played: 1 }],
    fouls: {
      drawn: {
        total: Math.round(metrics.fouls),
        average: {
          home: avgString(metrics.fouls),
          away: avgString(metrics.fouls),
          total: avgString(metrics.fouls),
        },
      },
      committed: {
        total: Math.round(metrics.fouls),
        average: {
          home: avgString(metrics.fouls),
          away: avgString(metrics.fouls),
          total: avgString(metrics.fouls),
        },
      },
    },
    shots: {
      on: {
        total: Math.round(metrics.shotsOnTarget),
        average: {
          home: avgString(metrics.shotsOnTarget),
          away: avgString(metrics.shotsOnTarget),
          total: avgString(metrics.shotsOnTarget),
        },
      },
    },
    corners: {
      total: Math.round(metrics.corners),
      average: {
        home: avgString(metrics.corners),
        away: avgString(metrics.corners),
        total: avgString(metrics.corners),
      },
    },
  };
}

export interface TeamStatisticsPayload {
  home: TeamStatistics;
  away: TeamStatistics;
}

export function buildTeamStatisticsPayload(
  home: TeamStatistics,
  away: TeamStatistics
): TeamStatisticsPayload {
  return { home, away };
}

export function teamStatisticsToMetrics(
  stats: TeamStatistics,
  isHomeSide: boolean
): TeamStatAverages {
  return parseTeamStats(stats, isHomeSide);
}

export function buildStoredTeamStatisticsRow(
  home: TeamStatistics,
  away: TeamStatistics
): {
  payload: TeamStatisticsPayload;
  metrics_home: TeamStatAverages;
  metrics_away: TeamStatAverages;
} {
  return {
    payload: buildTeamStatisticsPayload(home, away),
    metrics_home: teamStatisticsToMetrics(home, true),
    metrics_away: teamStatisticsToMetrics(away, false),
  };
}

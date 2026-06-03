import {
  getLeagueStrengthMultiplier,
  normalizeTeamStatsToPremierLeague,
} from "@/lib/prediction/league-benchmark";
import type { TeamStatistics } from "@/lib/types/football";
import type { TeamStatAverages } from "@/lib/types/prediction";
import type { EntityType } from "@/lib/types/football-lookup";

export interface ComparisonBundleInput {
  homeTeamId: number;
  awayTeamId: number;
  homeLeagueId: number;
  awayLeagueId: number;
  homeTeamName: string;
  awayTeamName: string;
  entityType?: EntityType;
  city: string;
  matchDate: string;
}

/** Scale parsed per-game averages to PL benchmark (re-export for callers). */
export function applyLeagueStrengthToAverages(
  averages: TeamStatAverages,
  leagueId: number
): TeamStatAverages {
  return normalizeTeamStatsToPremierLeague(averages, leagueId);
}

/** Scale goal averages on raw API statistics when teams come from different leagues. */
export function applyLeagueStrengthToStats(
  stats: TeamStatistics,
  leagueId: number
): TeamStatistics {
  const mult = getLeagueStrengthMultiplier(leagueId);
  if (mult >= 0.995) return stats;

  const attackScale = mult;
  const defenseScale = 1 / mult;
  const scaleAttack = (v: string) =>
    String(Math.round(parseFloat(v || "1") * attackScale * 100) / 100);
  const scaleDefense = (v: string) =>
    String(Math.round(parseFloat(v || "1") * defenseScale * 100) / 100);

  return {
    ...stats,
    goals: {
      for: {
        average: {
          home: scaleAttack(stats.goals.for.average.home),
          away: scaleAttack(stats.goals.for.average.away),
          total: scaleAttack(stats.goals.for.average.total),
        },
      },
      against: {
        average: {
          home: scaleDefense(stats.goals.against.average.home),
          away: scaleDefense(stats.goals.against.average.away),
          total: scaleDefense(stats.goals.against.average.total),
        },
      },
    },
  };
}

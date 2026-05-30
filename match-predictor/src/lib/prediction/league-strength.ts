import { getLeagueStrengthMultiplier } from "@/lib/data/football-reference";
import type { TeamStatistics } from "@/lib/types/football";
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

/** Scale goal averages when teams come from different league strengths. */
export function applyLeagueStrengthToStats(
  stats: TeamStatistics,
  leagueId: number
): TeamStatistics {
  const mult = getLeagueStrengthMultiplier(leagueId);
  if (mult >= 0.99) return stats;

  const scale = (v: string) => String(Math.round(parseFloat(v || "1") * mult * 100) / 100);

  return {
    ...stats,
    goals: {
      for: {
        average: {
          home: scale(stats.goals.for.average.home),
          away: scale(stats.goals.for.average.away),
          total: scale(stats.goals.for.average.total),
        },
      },
      against: stats.goals.against,
    },
  };
}

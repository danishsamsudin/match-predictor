import { getLeagueEntityType } from "@/lib/data/football-reference";
import { isNationalTeamId } from "@/lib/data/national-team-geography";
import {
  applyLeagueBenchmarkToPerformanceScore,
  computeLeagueStrengthMomentumEdge,
  getLeagueStrengthMultiplier,
  normalizeFormScoreToPremierLeague,
  normalizeTeamStatsToPremierLeague,
} from "@/lib/prediction/league-benchmark";
import {
  getFifaBenchmarkLabel,
  getFifaStrengthMultiplier,
  resolveNationalTeamForStrength,
} from "@/lib/prediction/fifa-team-strength";
import type { EntityType } from "@/lib/types/football-lookup";
import type { TeamStatAverages } from "@/lib/types/prediction";

export interface TeamStrengthContext {
  entityType?: EntityType;
  teamId: number;
  teamName?: string;
  leagueId: number;
}

export function isNationalStrengthContext(ctx: {
  entityType?: EntityType;
  leagueId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
}): boolean {
  if (ctx.entityType === "national") return true;
  if (ctx.leagueId != null && getLeagueEntityType(ctx.leagueId) === "national") {
    return true;
  }
  if (ctx.homeTeamId != null && isNationalTeamId(ctx.homeTeamId)) return true;
  if (ctx.awayTeamId != null && isNationalTeamId(ctx.awayTeamId)) return true;
  return false;
}

export function getTeamStrengthMultiplier(ctx: TeamStrengthContext): number {
  if (isNationalStrengthContext(ctx)) {
    const resolved = resolveNationalTeamForStrength(ctx.teamId, ctx.teamName);
    return getFifaStrengthMultiplier(resolved.teamId, resolved.teamName ?? ctx.teamName);
  }
  return getLeagueStrengthMultiplier(ctx.leagueId);
}

export function normalizeTeamStatsToBenchmark(
  stats: TeamStatAverages,
  ctx: TeamStrengthContext
): TeamStatAverages {
  const omega = getTeamStrengthMultiplier(ctx);
  if (omega >= 0.995) return stats;

  const attackScale = omega;
  const defenseScale = 1 / omega;
  const scale = (v: number, mult: number) => Math.round(v * mult * 1000) / 1000;

  return {
    goalsFor: scale(stats.goalsFor, attackScale),
    goalsAgainst: scale(stats.goalsAgainst, defenseScale),
    corners: scale(stats.corners, attackScale),
    fouls: stats.fouls,
    yellowCards: stats.yellowCards,
    redCards: stats.redCards,
    shotsOnTarget: scale(stats.shotsOnTarget, attackScale),
  };
}

export function normalizeFormScoreToBenchmark(
  formScore: number,
  ctx: TeamStrengthContext
): number {
  const omega = getTeamStrengthMultiplier(ctx);
  if (omega >= 0.995) return formScore;
  return formScore * omega + 0.5 * (1 - omega);
}

export function applyBenchmarkToPerformanceScore(
  score: number | null,
  ctx: TeamStrengthContext
): number | null {
  if (score == null || !Number.isFinite(score)) return null;

  const omega = getTeamStrengthMultiplier(ctx);
  if (omega >= 0.995) return Math.round(score);

  return Math.round(score * omega + 50 * (1 - omega));
}

export function computeStrengthMomentumEdge(
  home: TeamStrengthContext,
  away: TeamStrengthContext
): number {
  if (isNationalStrengthContext(home) || isNationalStrengthContext(away)) {
    const homeOmega = getTeamStrengthMultiplier(home);
    const awayOmega = getTeamStrengthMultiplier(away);
    return (homeOmega - awayOmega) * 0.18;
  }
  return computeLeagueStrengthMomentumEdge(home.leagueId, away.leagueId);
}

export function formatStrengthExplanationLine(
  homeName: string,
  awayName: string,
  homeOmega: number,
  awayOmega: number,
  ctx: { entityType?: EntityType; leagueId?: number }
): string {
  if (isNationalStrengthContext(ctx)) {
    const benchmark = getFifaBenchmarkLabel();
    return `National team strength vs FIFA #1 (${benchmark}, Ω) — ${homeName}: ${homeOmega.toFixed(2)}, ${awayName}: ${awayOmega.toFixed(2)}. Rates normalized to the top-ranked nation before xG.`;
  }
  return `League strength vs Premier League (Ω) — ${homeName}: ${homeOmega.toFixed(2)}, ${awayName}: ${awayOmega.toFixed(2)}. Team rates normalized to PL benchmark before xG.`;
}

/** @deprecated Use applyBenchmarkToPerformanceScore with full context. */
export function applyLeagueBenchmarkToPerformanceScoreCompat(
  score: number | null,
  leagueId: number | undefined,
  entityType?: EntityType,
  teamId?: number,
  teamName?: string
): number | null {
  if (leagueId == null && teamId == null) return score == null ? null : Math.round(score);
  return applyBenchmarkToPerformanceScore(score, {
    entityType,
    teamId: teamId ?? 0,
    teamName,
    leagueId: leagueId ?? 0,
  });
}

export {
  applyLeagueBenchmarkToPerformanceScore,
  normalizeTeamStatsToPremierLeague,
  normalizeFormScoreToPremierLeague,
};

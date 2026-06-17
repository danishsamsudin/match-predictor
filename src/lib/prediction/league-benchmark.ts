import type { TeamStatAverages } from "@/lib/types/prediction";

/** SofaScore / app league id for the benchmark competition. */
export const PREMIER_LEAGUE_ID = 39;

/**
 * Domestic league quality vs Premier League (Ω, 1.0 = PL).
 * Used to map production and player scores to a PL-comparable scale for cross-league use.
 *
 * Tiers reflect playing style and typical UEFA coefficient gap — PL is the anchor.
 */
export const LEAGUE_STRENGTH_VS_PREMIER_LEAGUE: Record<number, number> = {
  // Benchmark
  [PREMIER_LEAGUE_ID]: 1.0,

  // Top-five — below PL physical intensity; still elite
  140: 0.94, // La Liga — technical / possession
  78: 0.92, // Bundesliga — transition / counter
  135: 0.9, // Serie A — defensive / low-block
  61: 0.8, // Ligue 1 — weaker top tier (with Eredivisie below)

  // Netherlands top flight — weaker vs PL / Ligue 1
  88: 0.72, // Eredivisie

  // Continental cups (fallback when domestic id missing)
  2: 1.0, // UCL — resolved to domestic in predict flow
  3: 0.92,
  848: 0.88,

  // Second tiers
  40: 0.7, // Championship
  141: 0.65,
  79: 0.64,
  136: 0.62,
  62: 0.6,

  // Other synced leagues
  253: 0.72, // MLS
  307: 0.76, // Saudi Pro League

  // International
  1: 1.0,
  4: 1.0,
  5: 0.95,
  6: 0.95,
};

const DEFAULT_LEAGUE_STRENGTH = 0.75;

/** Ω_L — league quality relative to Premier League (1.0 = PL). */
export function getLeagueStrengthMultiplier(leagueId: number): number {
  return LEAGUE_STRENGTH_VS_PREMIER_LEAGUE[leagueId] ?? DEFAULT_LEAGUE_STRENGTH;
}

/**
 * Map per-game team rates from a domestic league to PL-equivalent values.
 * Weaker leagues inflate goal output and deflate conceded rates domestically.
 */
export function normalizeTeamStatsToPremierLeague(
  stats: TeamStatAverages,
  leagueId: number
): TeamStatAverages {
  const omega = getLeagueStrengthMultiplier(leagueId);
  if (omega >= 0.995) return stats;

  const attackScale = Math.pow(omega, 1);
  const defenseScale = Math.pow(1 / omega, 0.65);

  const scale = (v: number, mult: number) =>
    Math.round(v * mult * 1000) / 1000;

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

/** Pull form from weaker leagues toward neutral before cross-league momentum. */
export function normalizeFormScoreToPremierLeague(
  formScore: number,
  leagueId: number
): number {
  const omega = getLeagueStrengthMultiplier(leagueId);
  if (omega >= 0.995) return formScore;
  return formScore * omega + 0.5 * (1 - omega);
}

/**
 * Map a 0–100 performance score to PL-comparable display / squad ranking.
 * Elite raw scores in weaker leagues are discounted; PL unchanged at Ω=1.
 */
export function applyLeagueBenchmarkToPerformanceScore(
  score: number | null,
  leagueId: number | undefined
): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (leagueId == null) return Math.round(score);

  const omega = getLeagueStrengthMultiplier(leagueId);
  if (omega >= 0.995) return Math.round(score);

  return Math.round(score * omega + 50 * (1 - omega));
}

/** Signed edge for home side when leagues differ (used in momentum). */
export function computeLeagueStrengthMomentumEdge(
  homeLeagueId: number,
  awayLeagueId: number
): number {
  const home = getLeagueStrengthMultiplier(homeLeagueId);
  const away = getLeagueStrengthMultiplier(awayLeagueId);
  return (home - away) * 0.18;
}

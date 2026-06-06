import { getFifaRankingPoints, resolveNationalTeamForStrength } from "@/lib/prediction/fifa-team-strength";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { GRAHAM_XG_ELO_BASE_K } from "@/lib/world-cup/graham-model-config";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";

const DEFAULT_RATING = 1500;
const ELO_SCALE = 400;

export type XgEloMatchRow = InternationalFormMatch & {
  home_xgf?: number | null;
  home_xga?: number | null;
  away_xgf?: number | null;
  away_xga?: number | null;
};

function expectedXgDiff(homeR: number, awayR: number): number {
  const expHomeWin = 1 / (1 + Math.pow(10, (awayR - homeR) / ELO_SCALE));
  return (expHomeWin - 0.5) * 2.4;
}

function resolveTeamXg(m: InternationalFormMatch, teamId: string): { xgf: number; xga: number } | null {
  const isHome = m.home_team_id === teamId;
  const isAway = m.away_team_id === teamId;
  if (!isHome && !isAway) return null;

  const xgf =
    (isHome ? m.home_xg : m.away_xg) ??
    (isHome ? m.home_goals : m.away_goals);
  const xga =
    (isHome ? m.away_xg : m.home_xg) ??
    (isHome ? m.away_goals : m.home_goals);
  if (xgf == null || xga == null) return null;
  return { xgf, xga };
}

export function initialXgEloRating(teamId: number, teamName?: string): number {
  const resolved = resolveNationalTeamForStrength(teamId, teamName);
  const pts = getFifaRankingPoints(resolved.teamId, resolved.teamName ?? teamName);
  if (pts == null) return DEFAULT_RATING;
  return pts;
}

export function computeXgEloFromMatches(
  matches: InternationalFormMatch[],
  teamIds: number[],
  teamNames: Map<number, string>
): Map<number, number> {
  const ratings = new Map<number, number>();
  for (const id of teamIds) {
    ratings.set(id, initialXgEloRating(id, teamNames.get(id)));
  }

  const chronological = [...matches]
    .filter((m) => m.date && m.home_goals != null && m.away_goals != null)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  for (const m of chronological) {
    const homeId = Number(m.home_team_id);
    const awayId = Number(m.away_team_id);
    if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) continue;

    if (!ratings.has(homeId)) {
      ratings.set(homeId, initialXgEloRating(homeId, m.home_team_name));
    }
    if (!ratings.has(awayId)) {
      ratings.set(awayId, initialXgEloRating(awayId, m.away_team_name));
    }

    const homeR = ratings.get(homeId)!;
    const awayR = ratings.get(awayId)!;
    const tier = internationalMatchTierWeight(m.competition);
    const k = GRAHAM_XG_ELO_BASE_K * tier;

    const homeXg = m.home_xg ?? m.home_goals ?? 0;
    const awayXg = m.away_xg ?? m.away_goals ?? 0;
    const actualDiff = homeXg - awayXg;
    const expectedDiff = expectedXgDiff(homeR, awayR);
    const delta = k * (actualDiff - expectedDiff);

    ratings.set(homeId, homeR + delta);
    ratings.set(awayId, awayR - delta);
  }

  return ratings;
}

export function getXgEloRating(
  ratings: Map<number, number>,
  teamId: number,
  teamName?: string
): number {
  return ratings.get(teamId) ?? initialXgEloRating(teamId, teamName);
}

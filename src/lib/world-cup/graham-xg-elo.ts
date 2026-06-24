import { getLatestFifaRankingForTeamId } from "@/lib/data/fifa-rankings-store";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import {
  getFifaRankingPoints,
  resolveNationalTeamForStrength,
} from "@/lib/prediction/fifa-team-strength";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { GRAHAM_XG_ELO_BASE_K } from "@/lib/world-cup/graham-model-config";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";

export const XG_ELO_DEFAULT_RATING = 1500;
const ELO_SCALE = 400;
const ELO_RANK_STEP = 8;

export type XgEloMatchRow = InternationalFormMatch & {
  home_xgf?: number | null;
  home_xga?: number | null;
  away_xgf?: number | null;
  away_xga?: number | null;
};

export function expectedXgDiff(homeR: number, awayR: number): number {
  const expHomeWin = 1 / (1 + Math.pow(10, (awayR - homeR) / ELO_SCALE));
  return (expHomeWin - 0.5) * 2.4;
}

function matchXgTotals(m: InternationalFormMatch): { homeXg: number; awayXg: number } {
  return {
    homeXg: m.home_xg ?? m.home_goals ?? 0,
    awayXg: m.away_xg ?? m.away_goals ?? 0,
  };
}

/**
 * Map a form row side to a stable numeric Elo key (API id, or name hash for non-WC opponents).
 * FBref/Supabase rows often use UUID team ids — raw Number(uuid) is NaN and would skip updates.
 */
export function resolveEloParticipantId(
  teamId: string | null | undefined,
  teamName: string | null | undefined
): number | null {
  const apiId = resolveApiTeamId(teamId ?? "", teamName ?? "");
  if (apiId > 0) return apiId;

  const label = teamName?.trim() || teamId?.trim();
  if (!label) return null;

  const key = normalizeNationalTeamName(label);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  const pseudo = -Math.abs(hash || 1);
  return pseudo === 0 ? -1 : pseudo;
}

/** Shared chronological xG-Elo pass; callers supply init and per-match K. */
export function applyXgEloMatchUpdates(
  matches: InternationalFormMatch[],
  teamIds: number[],
  teamNames: Map<number, string>,
  options: {
    initialRating: (teamId: number, teamName?: string) => number;
    matchK: (match: InternationalFormMatch) => number;
  }
): Map<number, number> {
  const ratings = new Map<number, number>();
  for (const id of teamIds) {
    ratings.set(id, options.initialRating(id, teamNames.get(id)));
  }

  const chronological = [...matches]
    .filter((m) => m.date && m.home_goals != null && m.away_goals != null)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  for (const m of chronological) {
    const homeId = resolveEloParticipantId(m.home_team_id, m.home_team_name);
    const awayId = resolveEloParticipantId(m.away_team_id, m.away_team_name);
    if (homeId == null || awayId == null) continue;

    const k = options.matchK(m);
    if (k <= 0) continue;

    if (!ratings.has(homeId)) {
      ratings.set(homeId, options.initialRating(homeId, m.home_team_name ?? undefined));
    }
    if (!ratings.has(awayId)) {
      ratings.set(awayId, options.initialRating(awayId, m.away_team_name ?? undefined));
    }

    const homeR = ratings.get(homeId)!;
    const awayR = ratings.get(awayId)!;
    const { homeXg, awayXg } = matchXgTotals(m);
    const actualDiff = homeXg - awayXg;
    const expectedDiff = expectedXgDiff(homeR, awayR);
    const delta = k * (actualDiff - expectedDiff);

    ratings.set(homeId, homeR + delta);
    ratings.set(awayId, awayR - delta);
  }

  return ratings;
}

function estimateFifaRank(teamId: number, teamName?: string): number {
  const resolved = resolveNationalTeamForStrength(teamId, teamName);
  const fromDb = getLatestFifaRankingForTeamId(resolved.teamId, resolved.teamName);
  if (fromDb?.rank != null && fromDb.rank > 0) return fromDb.rank;

  const sorted = [...WORLD_CUP_2026_TEAMS]
    .map((t) => ({
      id: t.id,
      pts: getFifaRankingPoints(t.id, t.name) ?? 1400,
    }))
    .sort((a, b) => b.pts - a.pts);

  const idx = sorted.findIndex((t) => t.id === resolved.teamId);
  return idx >= 0 ? idx + 1 : Math.ceil(sorted.length / 2);
}

/** Elo-scale rating from FIFA rank (rank 1 ≈ 1500, wider spread than raw FIFA points). */
export function initialXgEloRating(teamId: number, teamName?: string): number {
  const rank = estimateFifaRank(teamId, teamName);
  return XG_ELO_DEFAULT_RATING - (rank - 1) * ELO_RANK_STEP;
}

export function computeXgEloFromMatches(
  matches: InternationalFormMatch[],
  teamIds: number[],
  teamNames: Map<number, string>
): Map<number, number> {
  return applyXgEloMatchUpdates(matches, teamIds, teamNames, {
    initialRating: initialXgEloRating,
    matchK: (m) => GRAHAM_XG_ELO_BASE_K * internationalMatchTierWeight(m.competition),
  });
}

export function getXgEloRating(
  ratings: Map<number, number>,
  teamId: number,
  teamName?: string
): number {
  return ratings.get(teamId) ?? initialXgEloRating(teamId, teamName);
}

import { isNationalTeamId } from "@/lib/data/national-team-geography";
import {
  getLatestFifaRankingForTeam,
  getLatestFifaRankingForTeamId,
  getMaxFifaPointsInLatestSnapshot,
  getTopFifaTeamInLatestSnapshot,
} from "@/lib/data/fifa-rankings-store";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";

/**
 * Static fallback when Supabase FIFA import is not loaded (Apr 2026 estimates + published
 * values where we had them). Replaced at runtime by Kaggle history (latest ≤ 2024 H2).
 */
export const FIFA_RANKING_POINTS_BY_TEAM_ID: Record<number, number> = {
  4481: 1877.32, // France
  4698: 1876.4, // Spain
  4819: 1874.81, // Argentina
  4713: 1825.97, // England
  4704: 1763.83, // Portugal
  4748: 1761.16, // Brazil
  4705: 1757.87, // Netherlands
  4778: 1755.87, // Morocco
  4717: 1734.71, // Belgium
  4711: 1730.37, // Germany
  4715: 1717.07, // Croatia
  4820: 1693.09, // Colombia
  4739: 1688.99, // Senegal
  4781: 1681.03, // Mexico
  4724: 1673.13, // USA
  4725: 1673.07, // Uruguay
  4770: 1660.43, // Japan
  4699: 1649.4, // Switzerland
  4475: 1640, // Norway (estimate)
  4718: 1635, // Austria (estimate)
  4741: 1630, // Australia (estimate)
  4688: 1618, // Sweden (estimate)
  4700: 1610, // Türkiye (estimate)
  4735: 1605, // South Korea (estimate)
  4736: 1585, // South Africa (estimate)
  4695: 1575, // Scotland (estimate)
  4729: 1565, // Tunisia (estimate)
  4757: 1555, // Ecuador (estimate)
  4789: 1545, // Paraguay (estimate)
  4766: 1535, // Iran (estimate)
  4834: 1525, // Saudi Arabia (estimate)
  4792: 1515, // Qatar (estimate)
  4758: 1505, // Egypt (estimate)
  4691: 1495, // Algeria (estimate)
  4764: 1485, // Ghana (estimate)
  4752: 1475, // Canada (estimate)
  5164: 1465, // Panama (estimate)
  4767: 1455, // Iraq (estimate)
  4771: 1445, // Jordan (estimate)
  4823: 1435, // DR Congo (estimate)
  4479: 1425, // Bosnia & Herzegovina (estimate)
  4714: 1415, // Czechia (estimate)
  4753: 1385, // Cabo Verde (estimate)
  4784: 1375, // New Zealand (estimate)
  4723: 1365, // Uzbekistan (estimate)
  55827: 1320, // Curaçao (estimate)
  7229: 1280, // Haiti (estimate)
};

const POINTS_BY_NORMALIZED_NAME: Record<string, number> = Object.fromEntries(
  WORLD_CUP_2026_TEAMS.map((t) => [
    normalizeNationalTeamName(t.name),
    FIFA_RANKING_POINTS_BY_TEAM_ID[t.id] ?? 1400,
  ])
);

const STATIC_MAX_FIFA_POINTS = Math.max(...Object.values(FIFA_RANKING_POINTS_BY_TEAM_ID));
const DEFAULT_FIFA_POINTS = 1400;

function resolvePoints(teamId: number, teamName?: string): number {
  const fromDb = teamName?.trim()
    ? (getLatestFifaRankingForTeamId(teamId, teamName)?.points ??
      getLatestFifaRankingForTeam(teamName)?.points)
    : getLatestFifaRankingForTeamId(teamId)?.points ?? null;
  if (fromDb != null) return fromDb;

  let points = FIFA_RANKING_POINTS_BY_TEAM_ID[teamId];
  if (points == null && teamName?.trim()) {
    points = POINTS_BY_NORMALIZED_NAME[normalizeNationalTeamName(teamName)];
  }
  return points ?? DEFAULT_FIFA_POINTS;
}

function maxFifaPoints(): number {
  return getMaxFifaPointsInLatestSnapshot() ?? STATIC_MAX_FIFA_POINTS;
}

/** Ω — national team quality vs the top FIFA-ranked side in our dataset (1.0 = best). */
export function getFifaStrengthMultiplier(teamId: number, teamName?: string): number {
  const effective = resolvePoints(teamId, teamName);
  return Math.round((effective / maxFifaPoints()) * 1000) / 1000;
}

export function getFifaRankingPoints(teamId: number, teamName?: string): number | null {
  const fromDb = teamName?.trim()
    ? (getLatestFifaRankingForTeamId(teamId, teamName)?.points ??
      getLatestFifaRankingForTeam(teamName)?.points)
    : getLatestFifaRankingForTeamId(teamId)?.points ?? null;
  if (fromDb != null) return fromDb;

  let points = FIFA_RANKING_POINTS_BY_TEAM_ID[teamId];
  if (points == null && teamName?.trim()) {
    points = POINTS_BY_NORMALIZED_NAME[normalizeNationalTeamName(teamName)];
  }
  return points ?? null;
}

export function getFifaBenchmarkLabel(): string {
  const topDb = getTopFifaTeamInLatestSnapshot();
  if (topDb) return topDb.teamName;
  const max = maxFifaPoints();
  const fromDb = getLatestFifaRankingForTeam("Argentina");
  if (fromDb && Math.abs(fromDb.points - max) < 0.01) {
    return fromDb.teamName;
  }
  const topTeam = WORLD_CUP_2026_TEAMS.find(
    (t) => FIFA_RANKING_POINTS_BY_TEAM_ID[t.id] === STATIC_MAX_FIFA_POINTS
  );
  return topTeam?.name ?? "top FIFA-ranked side";
}

export function resolveNationalTeamForStrength(
  teamId: number,
  teamName?: string
): { teamId: number; teamName?: string } {
  if (isNationalTeamId(teamId) || FIFA_RANKING_POINTS_BY_TEAM_ID[teamId] != null) {
    return { teamId, teamName };
  }
  if (teamName?.trim()) {
    const key = normalizeNationalTeamName(teamName);
    const match = WORLD_CUP_2026_TEAMS.find(
      (t) => normalizeNationalTeamName(t.name) === key
    );
    if (match) return { teamId: match.id, teamName: match.name };
  }
  return { teamId, teamName };
}

import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";

/** Combined WC + NL Sofascore catalogs for national ID resolution. */
const NATIONAL_TEAM_CATALOG = [...WORLD_CUP_2026_TEAMS, ...NATIONS_LEAGUE_2026_TEAMS];

const BY_NORMALIZED_NAME = new Map<string, number>();
const BY_ID = new Set<number>();

for (const team of NATIONAL_TEAM_CATALOG) {
  BY_ID.add(team.id);
  const key = normalizeNationalTeamName(team.name);
  if (!BY_NORMALIZED_NAME.has(key)) {
    BY_NORMALIZED_NAME.set(key, team.id);
  }
}

export function resolveApiTeamId(teamId: string, teamName: string): number {
  if (teamName?.trim()) {
    const key = normalizeNationalTeamName(teamName);
    const byName = BY_NORMALIZED_NAME.get(key);
    if (byName != null) return byName;
  }
  const numeric = Number(teamId);
  if (Number.isFinite(numeric) && numeric > 0 && BY_ID.has(numeric)) {
    return numeric;
  }
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return 0;
}

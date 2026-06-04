import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";

export function resolveApiTeamId(teamId: string, teamName: string): number {
  const key = normalizeNationalTeamName(teamName);
  const byName = WORLD_CUP_2026_TEAMS.find(
    (t) => normalizeNationalTeamName(t.name) === key
  );
  if (byName) return byName.id;
  const numeric = Number(teamId);
  return Number.isFinite(numeric) ? numeric : 0;
}

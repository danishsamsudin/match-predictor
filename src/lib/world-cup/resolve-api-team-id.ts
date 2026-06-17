import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";

export function resolveApiTeamId(teamId: string, teamName: string): number {
  if (teamName?.trim()) {
    const key = normalizeNationalTeamName(teamName);
    const byName = WORLD_CUP_2026_TEAMS.find(
      (t) => normalizeNationalTeamName(t.name) === key
    );
    if (byName) return byName.id;
  }
  const numeric = Number(teamId);
  if (Number.isFinite(numeric) && numeric > 0) {
    const byId = WORLD_CUP_2026_TEAMS.find((t) => t.id === numeric);
    if (byId) return byId.id;
  }
  return 0;
}

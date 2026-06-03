import type { TeamOption } from "@/lib/types/football-lookup";
import type { SportApiStandingsResponse } from "@/lib/types/sportapi";

export function collectTeamsFromStandings(standings: SportApiStandingsResponse): TeamOption[] {
  const byId = new Map<number, TeamOption>();
  for (const group of standings.standings ?? []) {
    for (const row of group.rows ?? []) {
      if (!row.team?.id || !row.team?.name) continue;
      byId.set(row.team.id, {
        id: row.team.id,
        name: row.team.name,
        shortName: row.team.shortName?.trim() || undefined,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

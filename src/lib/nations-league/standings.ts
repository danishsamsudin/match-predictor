import type { WcMatchRow, GroupStandingRow } from "@/lib/world-cup/standings";
import { loadNlGroupDraw, leagueTierFromGroupCode } from "@/lib/nations-league/group-draw";

export type { WcMatchRow as NlMatchRow, GroupStandingRow };

function applyResult(
  table: Map<string, GroupStandingRow>,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
  names: Map<string, string>
) {
  const home = table.get(homeId);
  const away = table.get(awayId);
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.goalsFor += homeGoals;
  home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals;
  away.goalsAgainst += homeGoals;

  if (homeGoals > awayGoals) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
  } else if (homeGoals < awayGoals) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }

  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;
  home.teamName = names.get(homeId) ?? home.teamName;
  away.teamName = names.get(awayId) ?? away.teamName;
}

function rankTable(rows: GroupStandingRow[]): GroupStandingRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

function emptyRow(teamId: string, teamName: string): GroupStandingRow {
  return {
    teamId,
    teamName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    rank: 0,
  };
}

/**
 * Compute standings for every NL mini-group (A1…D2) from finished matches.
 */
export function computeAllNlGroupStandings(
  matches: WcMatchRow[],
  teamNames: Map<string, string>
): Record<string, GroupStandingRow[]> {
  const draw = loadNlGroupDraw();
  const result: Record<string, GroupStandingRow[]> = {};

  for (const [groupCode, names] of Object.entries(draw)) {
    const table = new Map<string, GroupStandingRow>();
    for (const name of names) {
      let teamId: string | null = null;
      for (const [id, n] of teamNames) {
        if (n === name || n.toLowerCase() === name.toLowerCase()) {
          teamId = id;
          break;
        }
      }
      // Also match by numeric api id string
      if (!teamId) {
        for (const [id, n] of teamNames) {
          if (n.includes(name) || name.includes(n)) {
            teamId = id;
            break;
          }
        }
      }
      const id = teamId ?? `name:${name}`;
      table.set(id, emptyRow(id, name));
      teamNames.set(id, name);
    }

    for (const m of matches) {
      if (m.status !== "finished") continue;
      if ((m.group_code ?? "").toUpperCase() !== groupCode.toUpperCase()) continue;
      if (m.home_team_id == null || m.away_team_id == null) continue;
      if (m.home_goals == null || m.away_goals == null) continue;
      if (!table.has(m.home_team_id)) {
        table.set(
          m.home_team_id,
          emptyRow(m.home_team_id, teamNames.get(m.home_team_id) ?? m.home_team_name ?? "Home")
        );
      }
      if (!table.has(m.away_team_id)) {
        table.set(
          m.away_team_id,
          emptyRow(m.away_team_id, teamNames.get(m.away_team_id) ?? m.away_team_name ?? "Away")
        );
      }
      applyResult(
        table,
        m.home_team_id,
        m.away_team_id,
        m.home_goals,
        m.away_goals,
        teamNames
      );
    }

    result[groupCode] = rankTable([...table.values()]);
  }

  return result;
}

export function groupStandingsByLeagueTier(
  all: Record<string, GroupStandingRow[]>
): Record<string, Record<string, GroupStandingRow[]>> {
  const out: Record<string, Record<string, GroupStandingRow[]>> = {
    A: {},
    B: {},
    C: {},
    D: {},
  };
  for (const [code, rows] of Object.entries(all)) {
    const tier = leagueTierFromGroupCode(code);
    if (!tier) continue;
    out[tier][code] = rows;
  }
  return out;
}

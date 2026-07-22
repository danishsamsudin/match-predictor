/**
 * Pure league-table computation from finished GLPM match rows.
 */

import type { GlpmStandingRow } from "@/lib/glpm/hub-types";

export type StandingMatchInput = {
  homeTeamSmId: number;
  awayTeamSmId: number;
  homeScore: number;
  awayScore: number;
  /** Prefer kickoff for chronological form; fall back to match_date. */
  sortKey: string;
};

export type StandingTeamSeed = {
  teamSmId: number;
  teamName: string;
};

type Acc = {
  teamSmId: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  formChronological: Array<"W" | "D" | "L">;
};

function emptyAcc(teamSmId: number, teamName: string): Acc {
  return {
    teamSmId,
    teamName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    formChronological: [],
  };
}

function applyResult(acc: Acc, scored: number, conceded: number): void {
  acc.played += 1;
  acc.goalsFor += scored;
  acc.goalsAgainst += conceded;
  if (scored > conceded) {
    acc.won += 1;
    acc.formChronological.push("W");
  } else if (scored < conceded) {
    acc.lost += 1;
    acc.formChronological.push("L");
  } else {
    acc.drawn += 1;
    acc.formChronological.push("D");
  }
}

/**
 * Build a sorted league table. Seeds ensure teams with 0 played still appear
 * when they are known for the season (vectors / all fixtures).
 */
export function computeStandings(
  matches: StandingMatchInput[],
  seeds: StandingTeamSeed[] = []
): GlpmStandingRow[] {
  const byTeam = new Map<number, Acc>();

  for (const seed of seeds) {
    if (!byTeam.has(seed.teamSmId)) {
      byTeam.set(seed.teamSmId, emptyAcc(seed.teamSmId, seed.teamName));
    }
  }

  const ordered = [...matches].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  for (const m of ordered) {
    const home =
      byTeam.get(m.homeTeamSmId) ??
      emptyAcc(m.homeTeamSmId, `Team ${m.homeTeamSmId}`);
    const away =
      byTeam.get(m.awayTeamSmId) ??
      emptyAcc(m.awayTeamSmId, `Team ${m.awayTeamSmId}`);
    if (!byTeam.has(m.homeTeamSmId)) byTeam.set(m.homeTeamSmId, home);
    if (!byTeam.has(m.awayTeamSmId)) byTeam.set(m.awayTeamSmId, away);

    applyResult(home, m.homeScore, m.awayScore);
    applyResult(away, m.awayScore, m.homeScore);
  }

  const rows: GlpmStandingRow[] = [...byTeam.values()].map((acc) => {
    const goalDifference = acc.goalsFor - acc.goalsAgainst;
    const points = acc.won * 3 + acc.drawn;
    const form = [...acc.formChronological].reverse().slice(0, 5);
    return {
      rank: 0,
      teamSmId: acc.teamSmId,
      teamName: acc.teamName,
      played: acc.played,
      won: acc.won,
      drawn: acc.drawn,
      lost: acc.lost,
      goalsFor: acc.goalsFor,
      goalsAgainst: acc.goalsAgainst,
      goalDifference,
      points,
      form,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

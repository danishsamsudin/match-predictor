import "server-only";

import type { SofascoreFifaRankingRow } from "@/lib/data/parse-sofascore-fifa-html";
import bundledSnapshot from "../../../data/imports/fifa/fifa-rankings-2026.json";

export interface OfficialFifaRankingsSnapshotFile {
  rankingYear: number;
  semester: 1 | 2;
  dataSource: "fifa";
  updatedAt: string;
  rows: Array<{
    rank: number;
    teamName: string;
    normalizedTeamName: string;
    totalPoints: number;
    previousPoints: number | null;
    pointsDiff: number | null;
    acronym: string | null;
    sofascoreTeamId: number | null;
  }>;
}

/** Official FIFA men's ranking (2026) — bundled for production; not read from Supabase. */
export function loadOfficialFifaRankingsRows(): SofascoreFifaRankingRow[] {
  const file = bundledSnapshot as OfficialFifaRankingsSnapshotFile;
  return file.rows.map((row) => ({
    rankingYear: file.rankingYear,
    semester: file.semester,
    rank: row.rank,
    teamName: row.teamName,
    normalizedTeamName: row.normalizedTeamName,
    totalPoints: row.totalPoints,
    previousPoints: row.previousPoints,
    pointsDiff: row.pointsDiff,
    acronym: row.acronym,
    sofascoreTeamId: row.sofascoreTeamId,
    dataSource: "fifa" as const,
  }));
}

/**
 * Season xG totals from Understat teams-normalized JSON (EPL / Serie A / Bundesliga).
 */

import {
  SM_SEASON_2025_26,
  SM_SEASON_2026_27,
} from "@/lib/sportmonks/constants";
import type { SeasonXgAgg } from "@/lib/glpm/xg-table";

import epl2526 from "../../../data/understat/epl-2025-26/teams-normalized.json";
import epl2627 from "../../../data/understat/epl-2026-27/teams-normalized.json";
import pl2526 from "../../../data/understat/pl-2025-26/teams-normalized.json";
import serieA2526 from "../../../data/understat/serie-a-2025-26/teams-normalized.json";
import serieA2627 from "../../../data/understat/serie-a-2026-27/teams-normalized.json";
import bundesliga2526 from "../../../data/understat/bundesliga-2025-26/teams-normalized.json";
import bundesliga2627 from "../../../data/understat/bundesliga-2026-27/teams-normalized.json";

export type UnderstatSeasonXgRow = {
  teamSmId: number;
  teamName: string;
  matches: number;
  xgf: number;
  xga: number;
  goalsFor: number;
  goalsAgainst: number;
};

type NormalizedTeam = {
  team_sm_id?: number | null;
  glpm_team?: string | null;
  matches?: number | null;
  xg?: number | null;
  xga?: number | null;
  goals_for?: number | null;
  goals_against?: number | null;
};

const UNDERSTAT_BY_SEASON: Record<number, NormalizedTeam[]> = {
  // Prefer epl-* normalized exports; pl-2025-26 is the same season (sm 25583).
  [SM_SEASON_2025_26.PREMIER_LEAGUE]: (epl2526.length ? epl2526 : pl2526) as NormalizedTeam[],
  [SM_SEASON_2025_26.SERIE_A]: serieA2526 as NormalizedTeam[],
  [SM_SEASON_2025_26.BUNDESLIGA]: bundesliga2526 as NormalizedTeam[],
  [SM_SEASON_2026_27.PREMIER_LEAGUE]: epl2627 as NormalizedTeam[],
  [SM_SEASON_2026_27.SERIE_A]: serieA2627 as NormalizedTeam[],
  [SM_SEASON_2026_27.BUNDESLIGA]: bundesliga2627 as NormalizedTeam[],
};

export function understatSeasonXgAvailable(seasonId: number): boolean {
  return seasonId in UNDERSTAT_BY_SEASON;
}

export function loadUnderstatSeasonXgRows(
  seasonId: number
): UnderstatSeasonXgRow[] {
  const raw = UNDERSTAT_BY_SEASON[seasonId];
  if (!raw?.length) return [];
  const out: UnderstatSeasonXgRow[] = [];
  for (const row of raw) {
    const teamSmId = Number(row.team_sm_id);
    const xgf = Number(row.xg);
    const xga = Number(row.xga);
    if (!Number.isFinite(teamSmId) || teamSmId <= 0) continue;
    if (!Number.isFinite(xgf) || !Number.isFinite(xga)) continue;
    out.push({
      teamSmId,
      teamName: String(row.glpm_team ?? `Team ${teamSmId}`),
      matches: Number(row.matches) || 0,
      xgf,
      xga,
      goalsFor: Number(row.goals_for) || 0,
      goalsAgainst: Number(row.goals_against) || 0,
    });
  }
  return out;
}

/** Convert Understat season rows to xG aggregates (provider-grade). */
export function understatRowsToSeasonXgAgg(
  rows: UnderstatSeasonXgRow[]
): Map<number, SeasonXgAgg> {
  const map = new Map<number, SeasonXgAgg>();
  for (const row of rows) {
    map.set(row.teamSmId, {
      teamSmId: row.teamSmId,
      xgf: row.xgf,
      xga: row.xga,
      providerN: Math.max(1, row.matches),
      proxyN: 0,
    });
  }
  return map;
}

/**
 * Prefer Understat when it covers enough of the season vs live standings played.
 * Avoids swapping in a 2-match Understat snapshot over a deep SM season.
 */
export function shouldPreferUnderstatSeasonXg(
  understatRows: UnderstatSeasonXgRow[],
  standingsPlayedMedian: number
): boolean {
  if (!understatRows.length) return false;
  const matches = understatRows.map((r) => r.matches).filter((n) => n > 0);
  if (!matches.length) return false;
  const usMedian = [...matches].sort((a, b) => a - b)[
    Math.floor(matches.length / 2)
  ]!;
  if (standingsPlayedMedian <= 0) return usMedian > 0;
  return usMedian + 2 >= standingsPlayedMedian * 0.6;
}

export function medianPlayed(played: number[]): number {
  const vals = played
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return 0;
  return vals[Math.floor(vals.length / 2)]!;
}

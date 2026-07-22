/**
 * Pure helpers for mapping stored GLPM prediction history → hub card markets.
 */

export type HubCardPrediction = {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeXg: number;
  awayXg: number;
  over25: number;
  bttsYes: number;
};

function readOver25(overUnder: unknown): number {
  if (!overUnder || typeof overUnder !== "object") return 0;
  const line = (overUnder as Record<string, { over?: number }>)["2.5"];
  const over = line?.over;
  return typeof over === "number" && Number.isFinite(over) ? over : 0;
}

export function hubPredictionFromHistoryRow(row: {
  home_win_pct: number | string;
  draw_pct: number | string;
  away_win_pct: number | string;
  home_xg: number | string;
  away_xg: number | string;
  btts_yes_pct?: number | string | null;
  over_under?: unknown;
}): HubCardPrediction {
  return {
    homeWin: Number(row.home_win_pct),
    draw: Number(row.draw_pct),
    awayWin: Number(row.away_win_pct),
    homeXg: Number(row.home_xg),
    awayXg: Number(row.away_xg),
    over25: readOver25(row.over_under),
    bttsYes: row.btts_yes_pct != null ? Number(row.btts_yes_pct) : 0,
  };
}

export function fairOddsFromProb(p: number): number | null {
  if (!Number.isFinite(p) || p <= 0) return null;
  return Math.round((1 / p) * 100) / 100;
}

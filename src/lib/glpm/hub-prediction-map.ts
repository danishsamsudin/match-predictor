/**
 * Pure helpers for mapping stored GLPM prediction history → hub card markets.
 */

import type { GlpmHubPredictionSource } from "@/lib/glpm/hub-types";

export type HubCardPrediction = {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeXg: number;
  awayXg: number;
  over25: number;
  bttsYes: number;
};

export type HubHistoryMarketRow = {
  home_win_pct: number | string;
  draw_pct: number | string;
  away_win_pct: number | string;
  home_xg: number | string;
  away_xg: number | string;
  btts_yes_pct?: number | string | null;
  over_under?: unknown;
};

function readOver25(overUnder: unknown): number {
  if (!overUnder || typeof overUnder !== "object") return 0;
  const line = (overUnder as Record<string, { over?: number }>)["2.5"];
  const over = line?.over;
  return typeof over === "number" && Number.isFinite(over) ? over : 0;
}

export function hubPredictionFromHistoryRow(row: HubHistoryMarketRow): HubCardPrediction {
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

/**
 * Upcoming hub cards should match the Predict page (GLPM-CX).
 * Prefer a fixture-scoped CX snapshot, then a live vector recompute, then
 * a leftover base-GLPM history row.
 */
export function resolveUpcomingCardPrediction(args: {
  cxRow?: HubHistoryMarketRow | null;
  live?: HubCardPrediction | null;
  liveSource?: GlpmHubPredictionSource | null;
  baseRow?: HubHistoryMarketRow | null;
}): {
  prediction: HubCardPrediction | null;
  predictionSource: GlpmHubPredictionSource | null;
} {
  if (args.cxRow) {
    return {
      prediction: hubPredictionFromHistoryRow(args.cxRow),
      predictionSource: "cx",
    };
  }
  if (args.live) {
    return {
      prediction: args.live,
      predictionSource: args.liveSource ?? "live",
    };
  }
  if (args.baseRow) {
    return {
      prediction: hubPredictionFromHistoryRow(args.baseRow),
      predictionSource: "stored",
    };
  }
  return { prediction: null, predictionSource: null };
}

/** "2026/2027" or "2026/27" -> "26/27". */
export function shortGlpmSeasonLabel(
  name: string | null | undefined,
  seasonId?: number | null
): string {
  const raw = (name ?? "").trim();
  const four = raw.match(/(\d{4})\s*[/-]\s*(\d{2,4})/);
  if (four) {
    const start = four[1].slice(-2);
    const end = four[2].slice(-2);
    return `${start}/${end}`;
  }
  if (seasonId != null) return String(seasonId);
  return raw || "-";
}

export function buildGlpmCompareHref(
  match: { homeTeamSmId: number; awayTeamSmId: number; matchSmId: number },
  seasonId?: number | null
): string {
  const params = new URLSearchParams({
    entity: "club",
    mode: "compare",
    home: String(match.homeTeamSmId),
    away: String(match.awayTeamSmId),
    matchSmId: String(match.matchSmId),
  });
  if (seasonId != null) {
    params.set("seasonId", String(seasonId));
  }
  return `/predict?${params.toString()}`;
}

/**
 * Score locked GLPM-CX predictions into market evaluation rows for confidence learning.
 * Row shape matches extractMarketConfidenceRows (shared with Nations League).
 */

import {
  deriveMarketsFromScoreMatrix,
  type DerivedMarkets,
} from "@/lib/glpm-cx/derived-markets";
import { settleDerivedMarketHits } from "@/lib/nations-league/evaluate-derived-markets";
import { brierScore } from "@/lib/world-cup/market-models/stacking";
import type { CxShotMarketsEstimate } from "@/lib/glpm-cx/satellites/shot-markets";

export type GlpmMarketEvalRow = {
  matchSmId: number;
  leagueSmId: number;
  marketId: string;
  marketKey: string;
  predicted: Record<string, unknown>;
  actual: Record<string, unknown>;
  lossMetric: "brier";
  lossValue: number;
  modelVersion: string;
  matchDate: string | null;
};

function ehTag(line: number): string {
  return line > 0 ? `+${line}` : String(line);
}

function binaryRow(
  base: Pick<GlpmMarketEvalRow, "matchSmId" | "leagueSmId" | "modelVersion" | "matchDate">,
  marketId: string,
  marketKey: string,
  prob: number,
  hit: boolean
): GlpmMarketEvalRow {
  const p = Number.isFinite(prob) ? Math.max(0, Math.min(1, prob)) : 0;
  return {
    ...base,
    marketId,
    marketKey,
    predicted: { prob: p },
    actual: { hit },
    lossMetric: "brier",
    lossValue: brierScore(p, hit),
  };
}

function parseScoreMatrix(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (!Array.isArray(raw[0])) return null;
  return raw as number[][];
}

function parseOverUnder(
  raw: unknown
): Record<string, { over: number; under: number }> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, { over: number; under: number }> = {};
  for (const [line, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as { over?: unknown; under?: unknown };
    const over = Number(o.over);
    const under = Number(o.under);
    if (!Number.isFinite(over) || !Number.isFinite(under)) continue;
    out[line] = { over, under };
  }
  return out;
}

export type LockedShotMarkets = Pick<
  CxShotMarketsEstimate,
  "shotsOverUnder" | "sotOver" | "totalShots" | "totalSot"
>;

export function shotMarketsFromBreakdown(breakdown: unknown): LockedShotMarkets | null {
  if (!breakdown || typeof breakdown !== "object") return null;
  const shot = (breakdown as { shotMarkets?: unknown }).shotMarkets;
  if (!shot || typeof shot !== "object") return null;
  const s = shot as Partial<CxShotMarketsEstimate>;
  if (!Array.isArray(s.shotsOverUnder) && !Array.isArray(s.sotOver)) return null;
  return {
    shotsOverUnder: Array.isArray(s.shotsOverUnder) ? s.shotsOverUnder : [],
    sotOver: Array.isArray(s.sotOver) ? s.sotOver : [],
    totalShots: Number(s.totalShots) || 0,
    totalSot: Number(s.totalSot) || 0,
  };
}

/** Half-line Asian handicap: home covers when (home - away) > -line. */
export function asianHomeCovered(homeGoals: number, awayGoals: number, line: number): boolean {
  return homeGoals - awayGoals > -line;
}

export function evaluateGlpmMarketsForMatch(input: {
  matchSmId: number;
  leagueSmId: number;
  matchDate: string | null;
  modelVersion: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  overUnder: Record<string, { over: number; under: number }>;
  scoreMatrix: number[][];
  actualHome: number;
  actualAway: number;
  actualTotalShots?: number | null;
  actualTotalSot?: number | null;
  shotMarkets?: LockedShotMarkets | null;
}): GlpmMarketEvalRow[] {
  const base = {
    matchSmId: input.matchSmId,
    leagueSmId: input.leagueSmId,
    modelVersion: input.modelVersion,
    matchDate: input.matchDate,
  };
  const out: GlpmMarketEvalRow[] = [];
  const outcome =
    input.actualHome > input.actualAway
      ? "home"
      : input.actualHome === input.actualAway
        ? "draw"
        : "away";
  const totalGoals = input.actualHome + input.actualAway;
  const bttsYesHit = input.actualHome > 0 && input.actualAway > 0;

  const home = Number.isFinite(input.homeWin) ? input.homeWin : 0;
  const draw = Number.isFinite(input.draw) ? input.draw : 0;
  const away = Number.isFinite(input.awayWin) ? input.awayWin : 0;
  const outcomeProb = outcome === "home" ? home : outcome === "draw" ? draw : away;
  out.push({
    ...base,
    marketId: "win_probability",
    marketKey: "",
    predicted: { home, draw, away },
    actual: { outcome },
    lossMetric: "brier",
    lossValue: brierScore(outcomeProb, true),
  });

  out.push({
    ...base,
    marketId: "btts",
    marketKey: "",
    predicted: { yesPct: input.bttsYes * 100, prob: input.bttsYes },
    actual: { yes: bttsYesHit },
    lossMetric: "brier",
    lossValue: brierScore(input.bttsYes, bttsYesHit),
  });

  for (const [line, ou] of Object.entries(input.overUnder)) {
    const overHit = totalGoals > Number(line);
    out.push({
      ...base,
      marketId: "goals_over_under",
      marketKey: String(line),
      predicted: { line: Number(line), overPct: ou.over * 100, prob: ou.over },
      actual: { over: overHit },
      lossMetric: "brier",
      lossValue: brierScore(ou.over, overHit),
    });
  }

  const derived: DerivedMarkets = deriveMarketsFromScoreMatrix({
    scoreMatrix: input.scoreMatrix,
    homeWin: input.homeWin,
    draw: input.draw,
    awayWin: input.awayWin,
    bttsYes: input.bttsYes,
    bttsNo: input.bttsNo,
    overUnder: input.overUnder,
  });
  const settled = settleDerivedMarketHits(input.actualHome, input.actualAway);

  out.push(
    binaryRow(base, "double_chance", "1x", derived.doubleChance.homeOrDraw, settled.doubleChance["1x"]),
    binaryRow(base, "double_chance", "12", derived.doubleChance.homeOrAway, settled.doubleChance["12"]),
    binaryRow(base, "double_chance", "x2", derived.doubleChance.drawOrAway, settled.doubleChance.x2)
  );

  for (const band of settled.matchRange) {
    const predBand = derived.goalRanges.match.find((b) => b.label === band.label);
    out.push(binaryRow(base, "goal_range_match", band.label, predBand?.probability ?? 0, band.hit));
  }
  for (const band of settled.homeRange) {
    const predBand = derived.goalRanges.home.find((b) => b.label === band.label);
    out.push(binaryRow(base, "goal_range_home", band.label, predBand?.probability ?? 0, band.hit));
  }
  for (const band of settled.awayRange) {
    const predBand = derived.goalRanges.away.find((b) => b.label === band.label);
    out.push(binaryRow(base, "goal_range_away", band.label, predBand?.probability ?? 0, band.hit));
  }

  for (const eh of derived.europeanHandicap) {
    const actual = settled.europeanHandicap.find((s) => s.line === eh.line);
    const tag = ehTag(eh.line);
    out.push(
      binaryRow(base, "european_handicap", `${tag}_home`, eh.home, actual?.side === "home"),
      binaryRow(base, "european_handicap", `${tag}_draw`, eh.draw, actual?.side === "draw"),
      binaryRow(base, "european_handicap", `${tag}_away`, eh.away, actual?.side === "away")
    );
  }

  for (const line of derived.teamTotals) {
    const actual = settled.teamTotals.find((t) => t.line === line.line);
    out.push(
      binaryRow(base, "team_total", `home_over_${line.line}`, line.homeOver, actual?.homeOver ?? false),
      binaryRow(base, "team_total", `home_under_${line.line}`, line.homeUnder, actual?.homeUnder ?? false),
      binaryRow(base, "team_total", `away_over_${line.line}`, line.awayOver, actual?.awayOver ?? false),
      binaryRow(base, "team_total", `away_under_${line.line}`, line.awayUnder, actual?.awayUnder ?? false)
    );
  }

  for (const ah of derived.asianHandicap) {
    const homeHit = asianHomeCovered(input.actualHome, input.actualAway, ah.line);
    out.push(
      binaryRow(base, "asian_handicap", `home_${ah.line}`, ah.homeCover, homeHit),
      binaryRow(base, "asian_handicap", `away_${ah.line}`, ah.awayCover, !homeHit)
    );
  }

  const shots = input.shotMarkets;
  if (shots && input.actualTotalShots != null && Number.isFinite(input.actualTotalShots)) {
    const totalShots = input.actualTotalShots;
    for (const line of shots.shotsOverUnder) {
      const overHit = totalShots > line.line;
      out.push(
        binaryRow(base, "shots_ou", `over_${line.line}`, line.over, overHit),
        binaryRow(base, "shots_ou", `under_${line.line}`, line.under, !overHit)
      );
    }
  }
  if (shots && input.actualTotalSot != null && Number.isFinite(input.actualTotalSot)) {
    const totalSot = input.actualTotalSot;
    for (const line of shots.sotOver) {
      out.push(binaryRow(base, "sot_over", String(line.line), line.over, totalSot > line.line));
    }
  }

  return out;
}

/** Build eval rows from a locked CX history row + match result. */
export function evaluateFromCxHistoryRow(input: {
  matchSmId: number;
  leagueSmId: number;
  matchDate: string | null;
  history: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    btts_yes_pct: number;
    btts_no_pct: number;
    over_under: unknown;
    score_matrix: unknown;
    breakdown: unknown;
    model_version: string;
  };
  actualHome: number;
  actualAway: number;
  actualTotalShots?: number | null;
  actualTotalSot?: number | null;
}): GlpmMarketEvalRow[] | null {
  const matrix = parseScoreMatrix(input.history.score_matrix);
  if (!matrix) return null;
  return evaluateGlpmMarketsForMatch({
    matchSmId: input.matchSmId,
    leagueSmId: input.leagueSmId,
    matchDate: input.matchDate,
    modelVersion: String(input.history.model_version ?? "glpm_cx"),
    homeWin: Number(input.history.home_win_pct),
    draw: Number(input.history.draw_pct),
    awayWin: Number(input.history.away_win_pct),
    bttsYes: Number(input.history.btts_yes_pct),
    bttsNo: Number(input.history.btts_no_pct),
    overUnder: parseOverUnder(input.history.over_under),
    scoreMatrix: matrix,
    actualHome: input.actualHome,
    actualAway: input.actualAway,
    actualTotalShots: input.actualTotalShots,
    actualTotalSot: input.actualTotalSot,
    shotMarkets: shotMarketsFromBreakdown(input.history.breakdown),
  });
}

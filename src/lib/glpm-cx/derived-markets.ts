/**
 * Markets derived from a Dixon–Coles score matrix (presentation layer only).
 */

import {
  asianHomeCoverEffective,
  buildMarginHistogram,
} from "@/lib/prediction/handicap-probabilities";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";

export type EuropeanHandicapLine = {
  line: number;
  home: number;
  draw: number;
  away: number;
};

export type GoalRangeBucket = {
  label: string;
  lo: number;
  /** Inclusive upper bound; Infinity for open-ended buckets like 6+. */
  hi: number;
  probability: number;
};

export type GoalRanges = {
  match: GoalRangeBucket[];
  home: GoalRangeBucket[];
  away: GoalRangeBucket[];
};

export type DerivedMarkets = {
  doubleChance: {
    homeOrDraw: number;
    homeOrAway: number;
    drawOrAway: number;
  };
  asianHandicap: Array<{
    line: number;
    homeCover: number;
    awayCover: number;
  }>;
  europeanHandicap: EuropeanHandicapLine[];
  goalRanges: GoalRanges;
  teamTotals: Array<{
    line: number;
    homeOver: number;
    homeUnder: number;
    awayOver: number;
    awayUnder: number;
  }>;
  topScorelines: Array<{ home: number; away: number; probability: number }>;
  fairOdds: {
    homeWin: number | null;
    draw: number | null;
    awayWin: number | null;
    bttsYes: number | null;
    bttsNo: number | null;
    over25: number | null;
    under25: number | null;
  };
};

const AH_LINES = [-1.5, -0.5, 0.5, 1.5] as const;
const TEAM_TOTAL_LINES = [0.5, 1.5, 2.5] as const;
export const EUROPEAN_HANDICAP_LINES = [-3, -2, -1, 1, 2, 3] as const;
/** Match total goal bands (partition). */
export const MATCH_GOAL_RANGE_BANDS = [
  { label: "0-1", lo: 0, hi: 1 },
  { label: "2-3", lo: 2, hi: 3 },
  { label: "4-5", lo: 4, hi: 5 },
  { label: "6+", lo: 6, hi: Number.POSITIVE_INFINITY },
] as const;
/** Per-team Toto goal bands (overlapping markets). */
export const TEAM_GOAL_RANGE_BANDS = [
  { label: "0", lo: 0, hi: 0 },
  { label: "1-2", lo: 1, hi: 2 },
  { label: "1-3", lo: 1, hi: 3 },
  { label: "2-3", lo: 2, hi: 3 },
  { label: "4+", lo: 4, hi: Number.POSITIVE_INFINITY },
] as const;

function matrixToScoreCells(matrix: number[][]): Array<{
  home: number;
  away: number;
  probability: number;
}> {
  const cells: Array<{ home: number; away: number; probability: number }> = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      cells.push({ home: h, away: a, probability: matrix[h][a] });
    }
  }
  return cells;
}

function teamOverProb(matrix: number[][], side: "home" | "away", line: number): number {
  let p = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      const goals = side === "home" ? h : a;
      if (goals > line) p += matrix[h][a];
    }
  }
  return p;
}

function inGoalRange(goals: number, lo: number, hi: number): boolean {
  return goals >= lo && goals <= hi;
}

/** Toto-style 3-way European handicap from the home perspective. */
export function europeanHandicapFromMatrix(
  matrix: number[][],
  line: number
): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      const p = matrix[h][a] ?? 0;
      const margin = h - a + line;
      if (margin > 0) home += p;
      else if (margin === 0) draw += p;
      else away += p;
    }
  }
  return { home, draw, away };
}

export function goalRangesFromMatrix(matrix: number[][]): GoalRanges {
  const sumBand = (
    scope: "match" | "home" | "away",
    lo: number,
    hi: number
  ): number => {
    let probability = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
        const goals = scope === "match" ? h + a : scope === "home" ? h : a;
        if (inGoalRange(goals, lo, hi)) {
          probability += matrix[h][a] ?? 0;
        }
      }
    }
    return probability;
  };

  return {
    match: MATCH_GOAL_RANGE_BANDS.map((band) => ({
      label: band.label,
      lo: band.lo,
      hi: band.hi,
      probability: sumBand("match", band.lo, band.hi),
    })),
    home: TEAM_GOAL_RANGE_BANDS.map((band) => ({
      label: band.label,
      lo: band.lo,
      hi: band.hi,
      probability: sumBand("home", band.lo, band.hi),
    })),
    away: TEAM_GOAL_RANGE_BANDS.map((band) => ({
      label: band.label,
      lo: band.lo,
      hi: band.hi,
      probability: sumBand("away", band.lo, band.hi),
    })),
  };
}

export function deriveMarketsFromScoreMatrix(args: {
  scoreMatrix: number[][];
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  overUnder: Record<string, { over: number; under: number }>;
}): DerivedMarkets {
  const { scoreMatrix: matrix } = args;
  const cells = matrixToScoreCells(matrix);
  const histogram = buildMarginHistogram(cells);

  const topScorelines = [...cells]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8)
    .map((c) => ({
      home: c.home,
      away: c.away,
      probability: c.probability,
    }));

  const ou25 = args.overUnder["2.5"];

  return {
    doubleChance: {
      homeOrDraw: args.homeWin + args.draw,
      homeOrAway: args.homeWin + args.awayWin,
      drawOrAway: args.draw + args.awayWin,
    },
    asianHandicap: AH_LINES.map((line) => {
      const homeCover = asianHomeCoverEffective(histogram, line);
      return {
        line,
        homeCover,
        awayCover: 1 - homeCover,
      };
    }),
    europeanHandicap: EUROPEAN_HANDICAP_LINES.map((line) => ({
      line,
      ...europeanHandicapFromMatrix(matrix, line),
    })),
    goalRanges: goalRangesFromMatrix(matrix),
    teamTotals: TEAM_TOTAL_LINES.map((line) => {
      const homeOver = teamOverProb(matrix, "home", line);
      const awayOver = teamOverProb(matrix, "away", line);
      return {
        line,
        homeOver,
        homeUnder: 1 - homeOver,
        awayOver,
        awayUnder: 1 - awayOver,
      };
    }),
    topScorelines,
    fairOdds: {
      homeWin: fairOddsFromProb(args.homeWin),
      draw: fairOddsFromProb(args.draw),
      awayWin: fairOddsFromProb(args.awayWin),
      bttsYes: fairOddsFromProb(args.bttsYes),
      bttsNo: fairOddsFromProb(args.bttsNo),
      over25: fairOddsFromProb(ou25?.over ?? 0),
      under25: fairOddsFromProb(ou25?.under ?? 0),
    },
  };
}

export const SCORE_HEATMAP_MAX_GOALS = 4;

export function sliceScoreMatrix(
  matrix: number[][],
  maxGoals = SCORE_HEATMAP_MAX_GOALS
): { grid: number[][]; tailMass: number } {
  const grid: number[][] = [];
  let tailMass = 0;
  for (let h = 0; h < matrix.length; h++) {
    const row = matrix[h] ?? [];
    if (h <= maxGoals) {
      const sliced: number[] = [];
      for (let a = 0; a <= maxGoals; a++) {
        sliced.push(row[a] ?? 0);
      }
      grid.push(sliced);
    }
    for (let a = 0; a < row.length; a++) {
      if (h > maxGoals || a > maxGoals) tailMass += row[a] ?? 0;
    }
  }
  while (grid.length <= maxGoals) {
    grid.push(Array.from({ length: maxGoals + 1 }, () => 0));
  }
  return { grid, tailMass };
}

export function inferStyleLabels(args: {
  labels: string[];
  ratings: Record<string, number>;
  avgPossession: number | null;
  avgPpda: number | null;
}): string[] {
  const existing = args.labels.filter((l) => l && l !== "balanced");
  if (existing.length) return existing;

  const out: string[] = [];
  const poss = args.avgPossession;
  const ppda = args.avgPpda;
  const pressR = args.ratings.pressing;
  const possR = args.ratings.possession;
  const buildR = args.ratings.build_up;
  const atkR = args.ratings.attack;

  if (poss != null) {
    if (poss >= 55) out.push("high_possession");
    else if (poss <= 42) out.push("low_possession");
  } else if (Number.isFinite(possR)) {
    if (possR >= 65) out.push("high_possession");
    else if (possR <= 50) out.push("low_possession");
  }

  if (ppda != null) {
    if (ppda <= 9) out.push("high_press");
    else if (ppda > 14) out.push("low_block");
    else out.push("mid_block");
  } else if (Number.isFinite(pressR)) {
    if (pressR >= 65) out.push("high_press");
    else if (pressR <= 50) out.push("low_block");
  }

  if (Number.isFinite(buildR) && buildR >= 65) out.push("build_up_play");
  if (
    Number.isFinite(atkR) &&
    Number.isFinite(possR) &&
    atkR - possR >= 8
  ) {
    out.push("counter_attacking");
  }

  return out.length ? [...new Set(out)] : ["balanced"];
}

export function styleMatchupBadges(
  homeLabels: string[],
  awayLabels: string[]
): Array<{ home: string; away: string; label: string }> {
  const pairs: Array<{ homeNeed: string; awayNeed: string; label: string }> = [
    { homeNeed: "high_press", awayNeed: "low_block", label: "High press vs Low block" },
    { homeNeed: "low_block", awayNeed: "high_press", label: "Low block vs High press" },
    {
      homeNeed: "counter_attacking",
      awayNeed: "high_possession",
      label: "Transition threat vs Possession",
    },
    {
      homeNeed: "high_possession",
      awayNeed: "counter_attacking",
      label: "Possession vs Transition threat",
    },
    {
      homeNeed: "set_piece_reliant",
      awayNeed: "low_block",
      label: "Set-piece attack vs Compact defence",
    },
    {
      homeNeed: "direct_play",
      awayNeed: "high_press",
      label: "Direct play vs High press",
    },
    {
      homeNeed: "high_press",
      awayNeed: "direct_play",
      label: "High press vs Direct play",
    },
    {
      homeNeed: "build_up_play",
      awayNeed: "high_press",
      label: "Build-up vs High press",
    },
    {
      homeNeed: "high_press",
      awayNeed: "build_up_play",
      label: "High press vs Build-up",
    },
    {
      homeNeed: "high_possession",
      awayNeed: "low_block",
      label: "Possession vs Low block",
    },
    {
      homeNeed: "low_block",
      awayNeed: "high_possession",
      label: "Low block vs Possession",
    },
  ];

  const out: Array<{ home: string; away: string; label: string }> = [];
  const homeSet = new Set(homeLabels);
  const awaySet = new Set(awayLabels);

  for (const p of pairs) {
    if (homeSet.has(p.homeNeed) && awaySet.has(p.awayNeed)) {
      out.push({ home: p.homeNeed, away: p.awayNeed, label: p.label });
    }
  }

  if (!out.length) {
    const h = homeLabels[0] ?? "balanced";
    const a = awayLabels[0] ?? "balanced";
    out.push({
      home: h,
      away: a,
      label: `${formatStyle(h)} vs ${formatStyle(a)}`,
    });
  }
  return out;
}

function formatStyle(raw: string): string {
  return raw.replace(/_/g, " ");
}

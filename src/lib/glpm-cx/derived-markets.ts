/**
 * Markets derived from a Dixon–Coles score matrix (presentation layer only).
 */

import {
  asianHomeCoverEffective,
  buildMarginHistogram,
} from "@/lib/prediction/handicap-probabilities";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";

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
      homeNeed: "build_up_play",
      awayNeed: "high_press",
      label: "Build-up vs High press",
    },
  ];

  const out: Array<{ home: string; away: string; label: string }> = [];
  const homeSet = new Set(homeLabels);
  const awaySet = new Set(awayLabels);

  for (const p of pairs) {
    if (homeSet.has(p.homeNeed) && awaySet.has(p.awayNeed)) {
      out.push({ home: p.homeNeed, away: p.awayNeed, label: p.label });
    }
    // Also check swapped orientation with flipped label already listed
  }

  // Away-attacking variants covered by mirrored pair rows above.
  if (!out.length && (homeLabels.length || awayLabels.length)) {
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

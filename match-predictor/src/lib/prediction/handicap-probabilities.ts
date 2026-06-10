/** Winning margin and Asian Handicap probabilities from a Poisson score matrix. */

import type {
  AsianHandicapLine,
  HandicapMarkets,
  ScoreCell,
  WinningMarginLine,
} from "@/lib/types/prediction";

export const ASIAN_HANDICAP_LINES = [
  -1.75, -1.5, -1.25, -1, -0.5, -0.25, 0.25, 0.5, 0.75, 1, 1.25, 1.5,
] as const;

export const WINNING_MARGIN_LEVELS = [1, 2, 3] as const;

function roundPct(percent: number): number {
  return Math.round(percent * 10) / 10;
}

export function buildMarginHistogram(matrix: ScoreCell[]): Map<number, number> {
  const histogram = new Map<number, number>();
  for (const cell of matrix) {
    const margin = cell.home - cell.away;
    histogram.set(margin, (histogram.get(margin) ?? 0) + cell.probability);
  }
  return histogram;
}

function marginProb(histogram: Map<number, number>, margin: number): number {
  return histogram.get(margin) ?? 0;
}

function probMarginGreaterThan(histogram: Map<number, number>, threshold: number): number {
  let total = 0;
  for (const [margin, prob] of histogram) {
    if (margin > threshold) total += prob;
  }
  return total;
}

/** Effective home cover probability for Asian Handicap line L (home perspective). */
export function asianHomeCoverEffective(histogram: Map<number, number>, line: number): number {
  const quarterRemainder = Math.round((line * 4) % 2);
  if (quarterRemainder !== 0) {
    return (
      0.5 * asianHomeCoverEffective(histogram, line - 0.25) +
      0.5 * asianHomeCoverEffective(histogram, line + 0.25)
    );
  }

  const isHalfLine = Math.abs(line * 2) % 2 === 1;
  const pushMargin = -line;

  if (isHalfLine) {
    return probMarginGreaterThan(histogram, -line);
  }

  const fullWin = probMarginGreaterThan(histogram, pushMargin);
  const push = marginProb(histogram, pushMargin);
  return fullWin + 0.5 * push;
}

export function asianHomePushProb(histogram: Map<number, number>, line: number): number | undefined {
  const quarterRemainder = Math.round((line * 4) % 2);
  if (quarterRemainder !== 0) return undefined;

  const isHalfLine = Math.abs(line * 2) % 2 === 1;
  if (isHalfLine) return undefined;

  return marginProb(histogram, -line);
}

export function computeWinningMargins(histogram: Map<number, number>): WinningMarginLine[] {
  const lines: WinningMarginLine[] = [];
  for (const margin of WINNING_MARGIN_LEVELS) {
    lines.push({
      side: "home",
      margin,
      probabilityPct: roundPct(marginProb(histogram, margin) * 100),
    });
    lines.push({
      side: "away",
      margin,
      probabilityPct: roundPct(marginProb(histogram, -margin) * 100),
    });
  }
  return lines;
}

export function computeAsianHandicapLines(histogram: Map<number, number>): AsianHandicapLine[] {
  return ASIAN_HANDICAP_LINES.map((line) => {
    const homeCoverPct = roundPct(asianHomeCoverEffective(histogram, line) * 100);
    const pushProb = asianHomePushProb(histogram, line);
    const pushPct = pushProb != null ? roundPct(pushProb * 100) : undefined;
    return {
      line,
      homeCoverPct,
      awayCoverPct: roundPct(100 - homeCoverPct),
      pushPct,
    };
  });
}

export function computeHandicapMarkets(matrix: ScoreCell[]): HandicapMarkets {
  const histogram = buildMarginHistogram(matrix);
  return {
    winningMargins: computeWinningMargins(histogram),
    asianHandicap: computeAsianHandicapLines(histogram),
  };
}

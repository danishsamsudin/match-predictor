import {
  buildScoreMatrix,
  computeOutcomeProbabilities,
} from "@/lib/prediction/market-probabilities";

export interface TournamentMatchSpec {
  homeTeamId: number;
  awayTeamId: number;
  homeXg: number;
  awayXg: number;
  neutral?: boolean;
}

export interface TournamentSimInput {
  matches: TournamentMatchSpec[];
  iterations?: number;
  correlation?: number;
}

export interface TournamentSimResult {
  iterations: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  sampledHomeWins: number;
  sampledDraws: number;
  sampledAwayWins: number;
}

function sampleFromMatrix(
  matrix: ReturnType<typeof buildScoreMatrix>
): "home" | "draw" | "away" {
  const r = Math.random();
  let cumulative = 0;
  let home = 0;
  let draw = 0;
  let away = 0;

  for (const cell of matrix) {
    cumulative += cell.probability;
    if (r <= cumulative) {
      if (cell.home > cell.away) return "home";
      if (cell.home < cell.away) return "away";
      return "draw";
    }
    if (cell.home > cell.away) home += cell.probability;
    else if (cell.home < cell.away) away += cell.probability;
    else draw += cell.probability;
  }

  if (home >= draw && home >= away) return "home";
  if (away >= draw) return "away";
  return "draw";
}

/** Lightweight Monte Carlo kernel from resolved xG (no bundle fetch). */
export function simulateMatchOutcome(
  homeXg: number,
  awayXg: number,
  options?: { correlation?: number; maxGoals?: number }
): "home" | "draw" | "away" {
  const maxGoals = options?.maxGoals ?? 8;
  const matrix = buildScoreMatrix(homeXg, awayXg, maxGoals, {
    correlation: options?.correlation ?? 0,
  });
  return sampleFromMatrix(matrix);
}

export function runTournamentMatchSim(input: TournamentSimInput): TournamentSimResult {
  const iterations = Math.min(10_000, Math.max(1, input.iterations ?? 1000));
  const match = input.matches[0];
  if (!match) {
    return {
      iterations: 0,
      homeWinPct: 0,
      drawPct: 0,
      awayWinPct: 0,
      sampledHomeWins: 0,
      sampledDraws: 0,
      sampledAwayWins: 0,
    };
  }

  let sampledHomeWins = 0;
  let sampledDraws = 0;
  let sampledAwayWins = 0;

  for (let i = 0; i < iterations; i++) {
    const outcome = simulateMatchOutcome(match.homeXg, match.awayXg, {
      correlation: input.correlation,
    });
    if (outcome === "home") sampledHomeWins += 1;
    else if (outcome === "draw") sampledDraws += 1;
    else sampledAwayWins += 1;
  }

  return {
    iterations,
    homeWinPct: (sampledHomeWins / iterations) * 100,
    drawPct: (sampledDraws / iterations) * 100,
    awayWinPct: (sampledAwayWins / iterations) * 100,
    sampledHomeWins,
    sampledDraws,
    sampledAwayWins,
  };
}

/** Closed-form 1X2 from Poisson grid (single pass, no sampling). */
export function resolveMatchProbsFromXg(
  homeXg: number,
  awayXg: number,
  correlation = 0
): { homeWin: number; draw: number; awayWin: number } {
  return computeOutcomeProbabilities(homeXg, awayXg, 8, { correlation });
}

/** Highest-probability scoreline from a Poisson/Dixon-Coles grid (deterministic). */
export function mostLikelyScoreFromXg(
  homeXg: number,
  awayXg: number,
  options?: { correlation?: number; maxGoals?: number; avoidDraw?: boolean }
): { home: number; away: number } {
  const maxGoals = options?.maxGoals ?? 8;
  const matrix = buildScoreMatrix(homeXg, awayXg, maxGoals, {
    correlation: options?.correlation ?? 0,
  });

  const pickBest = (cells: typeof matrix) => {
    let best = cells[0]!;
    for (const cell of cells) {
      if (cell.probability > best.probability) best = cell;
    }
    return best;
  };

  const best = pickBest(matrix);
  if (!options?.avoidDraw || best.home !== best.away) {
    return { home: best.home, away: best.away };
  }

  const homeWins = matrix.filter((cell) => cell.home > cell.away);
  const awayWins = matrix.filter((cell) => cell.away > cell.home);
  const bestHomeWin = homeWins.length > 0 ? pickBest(homeWins) : best;
  const bestAwayWin = awayWins.length > 0 ? pickBest(awayWins) : best;

  if (homeXg > awayXg) {
    return { home: bestHomeWin.home, away: bestHomeWin.away };
  }
  if (awayXg > homeXg) {
    return { home: bestAwayWin.home, away: bestAwayWin.away };
  }

  const favored = bestHomeWin.probability >= bestAwayWin.probability ? bestHomeWin : bestAwayWin;
  return { home: favored.home, away: favored.away };
}

/** Sample an exact scoreline from a Poisson/Dixon-Coles grid. */
export function sampleScoreFromXg(
  homeXg: number,
  awayXg: number,
  options?: { correlation?: number; maxGoals?: number }
): { home: number; away: number } {
  const maxGoals = options?.maxGoals ?? 8;
  const matrix = buildScoreMatrix(homeXg, awayXg, maxGoals, {
    correlation: options?.correlation ?? 0,
  });
  const r = Math.random();
  let cumulative = 0;
  for (const cell of matrix) {
    cumulative += cell.probability;
    if (r <= cumulative) {
      return { home: cell.home, away: cell.away };
    }
  }
  const last = matrix[matrix.length - 1];
  return { home: last?.home ?? 0, away: last?.away ?? 0 };
}

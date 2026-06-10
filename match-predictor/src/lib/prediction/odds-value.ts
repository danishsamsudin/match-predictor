export type DeVigMethod = "mpto" | "raw" | "invalid";

export interface OutcomeOdds {
  home: number;
  draw: number;
  away: number;
}

export interface FairImpliedResult {
  homePct: number;
  drawPct: number;
  awayPct: number;
  method: DeVigMethod;
  warning?: string;
  totalRawImpliedPct: number;
}

export interface ValueEdgeResult {
  homeEdgePct: number;
  drawEdgePct: number;
  awayEdgePct: number;
  fair: FairImpliedResult;
}

function isValidDecimalOdds(odds: number): boolean {
  return Number.isFinite(odds) && odds > 1;
}

export function decimalToImpliedPct(odds: number): number | null {
  if (!isValidDecimalOdds(odds)) return null;
  return 100 / odds;
}

export function rawImpliedProportions(odds: OutcomeOdds): FairImpliedResult | null {
  const homeRaw = decimalToImpliedPct(odds.home);
  const drawRaw = decimalToImpliedPct(odds.draw);
  const awayRaw = decimalToImpliedPct(odds.away);
  if (homeRaw == null || drawRaw == null || awayRaw == null) {
    return {
      homePct: 0,
      drawPct: 0,
      awayPct: 0,
      method: "invalid",
      warning: "Enter valid decimal odds greater than 1.00 for home, draw, and away.",
      totalRawImpliedPct: 0,
    };
  }

  const total = homeRaw + drawRaw + awayRaw;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      homePct: 0,
      drawPct: 0,
      awayPct: 0,
      method: "invalid",
      warning: "Could not compute implied probabilities.",
      totalRawImpliedPct: total,
    };
  }

  return {
    homePct: (homeRaw / total) * 100,
    drawPct: (drawRaw / total) * 100,
    awayPct: (awayRaw / total) * 100,
    method: "raw",
    totalRawImpliedPct: total,
  };
}

/**
 * Margin proportional to odds (MPTO) de-vig.
 * Falls back to raw proportional implied when overround ≤ 0 or invalid.
 */
export function removeOverroundMpto(odds: OutcomeOdds): FairImpliedResult {
  const homeRaw = decimalToImpliedPct(odds.home);
  const drawRaw = decimalToImpliedPct(odds.draw);
  const awayRaw = decimalToImpliedPct(odds.away);
  if (homeRaw == null || drawRaw == null || awayRaw == null) {
    return rawImpliedProportions(odds)!;
  }
  const totalRaw = homeRaw + drawRaw + awayRaw;

  if (!Number.isFinite(totalRaw) || totalRaw <= 100) {
    const fallback = rawImpliedProportions(odds)!;
    return {
      ...fallback,
      method: totalRaw <= 100 ? "raw" : "invalid",
      warning:
        totalRaw <= 100
          ? "Market implied probability ≤ 100% (arbitrage or invalid odds) — showing normalized raw implied %."
          : fallback.warning,
      totalRawImpliedPct: totalRaw,
    };
  }

  const margin = totalRaw - 100;
  const homeOdds = odds.home;
  const drawOdds = odds.draw;
  const awayOdds = odds.away;

  const denom =
    homeRaw * homeOdds + drawRaw * drawOdds + awayRaw * awayOdds;
  if (!Number.isFinite(denom) || denom <= 0) {
    return rawImpliedProportions(odds)!;
  }

  const fairHome = Math.max(0, homeRaw - (margin * (homeRaw * homeOdds)) / denom);
  const fairDraw = Math.max(0, drawRaw - (margin * (drawRaw * drawOdds)) / denom);
  const fairAway = Math.max(0, awayRaw - (margin * (awayRaw * awayOdds)) / denom);
  const fairTotal = fairHome + fairDraw + fairAway;

  if (fairTotal <= 0) {
    return rawImpliedProportions(odds)!;
  }

  return {
    homePct: (fairHome / fairTotal) * 100,
    drawPct: (fairDraw / fairTotal) * 100,
    awayPct: (fairAway / fairTotal) * 100,
    method: "mpto",
    totalRawImpliedPct: totalRaw,
  };
}

export function computeFairImplied(odds: OutcomeOdds): FairImpliedResult {
  const homeRaw = decimalToImpliedPct(odds.home);
  const drawRaw = decimalToImpliedPct(odds.draw);
  const awayRaw = decimalToImpliedPct(odds.away);

  if (homeRaw == null || drawRaw == null || awayRaw == null) {
    return rawImpliedProportions(odds)!;
  }

  const totalImpliedProb = homeRaw + drawRaw + awayRaw;
  if (!Number.isFinite(totalImpliedProb) || totalImpliedProb <= 100) {
    return removeOverroundMpto(odds);
  }

  return removeOverroundMpto(odds);
}

export function computeValueEdges(
  model: { homeWinPct: number; drawPct: number; awayWinPct: number },
  odds: OutcomeOdds
): ValueEdgeResult {
  const fair = computeFairImplied(odds);
  return {
    homeEdgePct: model.homeWinPct - fair.homePct,
    drawEdgePct: model.drawPct - fair.drawPct,
    awayEdgePct: model.awayWinPct - fair.awayPct,
    fair,
  };
}

export interface TwoWayOdds {
  home: number;
  away: number;
}

export interface TwoWayFairImplied {
  homePct: number;
  awayPct: number;
  method: DeVigMethod;
  warning?: string;
  totalRawImpliedPct: number;
}

export interface TwoWayEdgeResult {
  homeEdgePct: number;
  awayEdgePct: number;
  fair: TwoWayFairImplied;
}

function rawTwoWayImplied(odds: TwoWayOdds): TwoWayFairImplied | null {
  const homeRaw = decimalToImpliedPct(odds.home);
  const awayRaw = decimalToImpliedPct(odds.away);
  if (homeRaw == null || awayRaw == null) {
    return {
      homePct: 0,
      awayPct: 0,
      method: "invalid",
      warning: "Enter valid decimal odds greater than 1.00 for both sides.",
      totalRawImpliedPct: 0,
    };
  }

  const total = homeRaw + awayRaw;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      homePct: 0,
      awayPct: 0,
      method: "invalid",
      warning: "Could not compute implied probabilities.",
      totalRawImpliedPct: total,
    };
  }

  return {
    homePct: (homeRaw / total) * 100,
    awayPct: (awayRaw / total) * 100,
    method: "raw",
    totalRawImpliedPct: total,
  };
}

/** MPTO de-vig for two-outcome markets (handicap cover / not cover). */
export function removeTwoWayOverroundMpto(odds: TwoWayOdds): TwoWayFairImplied {
  const homeRaw = decimalToImpliedPct(odds.home);
  const awayRaw = decimalToImpliedPct(odds.away);
  if (homeRaw == null || awayRaw == null) {
    return rawTwoWayImplied(odds)!;
  }

  const totalRaw = homeRaw + awayRaw;
  if (!Number.isFinite(totalRaw) || totalRaw <= 100) {
    const fallback = rawTwoWayImplied(odds)!;
    return {
      ...fallback,
      method: totalRaw <= 100 ? "raw" : "invalid",
      warning:
        totalRaw <= 100
          ? "Market implied probability ≤ 100% (arbitrage or invalid odds) — showing normalized raw implied %."
          : fallback.warning,
      totalRawImpliedPct: totalRaw,
    };
  }

  const margin = totalRaw - 100;
  const denom = homeRaw * odds.home + awayRaw * odds.away;
  if (!Number.isFinite(denom) || denom <= 0) {
    return rawTwoWayImplied(odds)!;
  }

  const fairHome = Math.max(0, homeRaw - (margin * (homeRaw * odds.home)) / denom);
  const fairAway = Math.max(0, awayRaw - (margin * (awayRaw * odds.away)) / denom);
  const fairTotal = fairHome + fairAway;
  if (fairTotal <= 0) {
    return rawTwoWayImplied(odds)!;
  }

  return {
    homePct: (fairHome / fairTotal) * 100,
    awayPct: (fairAway / fairTotal) * 100,
    method: "mpto",
    totalRawImpliedPct: totalRaw,
  };
}

export function computeTwoWayFairImplied(odds: TwoWayOdds): TwoWayFairImplied {
  const homeRaw = decimalToImpliedPct(odds.home);
  const awayRaw = decimalToImpliedPct(odds.away);
  if (homeRaw == null || awayRaw == null) {
    return rawTwoWayImplied(odds)!;
  }
  return removeTwoWayOverroundMpto(odds);
}

export function computeTwoWayEdge(
  modelHomeCoverPct: number,
  odds: TwoWayOdds
): TwoWayEdgeResult {
  const fair = computeTwoWayFairImplied(odds);
  return {
    homeEdgePct: modelHomeCoverPct - fair.homePct,
    awayEdgePct: 100 - modelHomeCoverPct - fair.awayPct,
    fair,
  };
}

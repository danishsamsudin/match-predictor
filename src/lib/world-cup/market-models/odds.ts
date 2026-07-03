/** European (decimal) odds helpers — shared across all betting markets. */

export function probabilityToEuropeanOdds(probability: number): number {
  const p = Math.max(probability, 0.001);
  return Math.round((1 / p) * 100) / 100;
}

export function europeanOddsToImpliedPct(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 1) return 0;
  return Math.round((100 / odds) * 10) / 10;
}

export function impliedPctToEuropeanOdds(pct: number): number {
  return probabilityToEuropeanOdds(pct / 100);
}

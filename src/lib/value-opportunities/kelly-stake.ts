import {
  type ConfidenceLookup,
  type ConfidenceTier,
} from "@/lib/value-opportunities/confidence-layer";

export const KELLY_FRACTION_BY_TIER: Record<ConfidenceTier, number> = {
  strong: 0.25,
  moderate: 0.125,
  weak: 0.05,
  none: 0,
};

export const KELLY_MAX_STAKE_FRACTION = 0.025;
export const KELLY_MIN_EDGE = 0.01;
export const KELLY_SHRINK_PRIOR = 20;

export type KellyStakeInput = {
  modelProb: number;
  decimalOdds: number;
  confidence: ConfidenceLookup;
  bankroll?: number;
};

export type KellyStakeResult = {
  fullKelly: number;
  fraction: number;
  units: number;
  pUsed: number;
  edge: number;
  /** Lowest decimal odds that clear the min-edge bar for this shrunk p. */
  minBookOdds: number | null;
  reason: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Confidence-shrunk p: blend empirical hit rate with model %, then cap at Wilson low for Strong/Moderate. */
export function shrunkProbability(
  modelProb: number,
  confidence: ConfidenceLookup
): number {
  const model = clamp01(modelProb);
  if (confidence.n <= 0) return model;
  const w = confidence.n / (confidence.n + KELLY_SHRINK_PRIOR);
  const blended = w * confidence.historicalHitRate + (1 - w) * model;
  if (confidence.tier === "strong" || confidence.tier === "moderate") {
    return clamp01(Math.min(blended, confidence.wilsonLow));
  }
  return clamp01(blended);
}

export function fullKellyFraction(p: number, decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const q = 1 - p;
  return (b * p - q) / b;
}

/** Minimum decimal odds needed for `p` to clear KELLY_MIN_EDGE. */
export function minBookOddsForEdge(p: number, minEdge = KELLY_MIN_EDGE): number | null {
  const target = clamp01(p) - minEdge;
  if (target <= 0.01) return null;
  return 1 / target;
}

export function suggestKellyStake(input: KellyStakeInput): KellyStakeResult {
  const bankroll =
    Number.isFinite(input.bankroll) && (input.bankroll ?? 0) > 0
      ? (input.bankroll as number)
      : 100;
  const odds = input.decimalOdds;
  const empty = (
    reason: string,
    pUsed = clamp01(input.modelProb)
  ): KellyStakeResult => ({
    fullKelly: 0,
    fraction: 0,
    units: 0,
    pUsed,
    edge: 0,
    minBookOdds: minBookOddsForEdge(pUsed),
    reason,
  });

  if (input.confidence.tier === "none") {
    return empty("Not enough history in this probability band for a stake.");
  }
  if (!Number.isFinite(odds) || odds <= 1) {
    return empty("Enter decimal odds above 1.00 to size a stake.");
  }

  const pUsed = shrunkProbability(input.modelProb, input.confidence);
  const minBook = minBookOddsForEdge(pUsed);
  const implied = 1 / odds;
  const edge = pUsed - implied;
  const full = fullKellyFraction(pUsed, odds);
  if (edge < KELLY_MIN_EDGE || full <= 0) {
    const need =
      minBook != null ? ` Need book ≥ ${minBook.toFixed(2)} vs ${(pUsed * 100).toFixed(0)}% hist.` : "";
    return {
      fullKelly: Math.max(0, full),
      fraction: 0,
      units: 0,
      pUsed,
      edge,
      minBookOdds: minBook,
      reason: `No edge vs historical hit rate.${need}`,
    };
  }

  const multiplier = KELLY_FRACTION_BY_TIER[input.confidence.tier];
  const fraction = Math.min(KELLY_MAX_STAKE_FRACTION, full * multiplier);
  return {
    fullKelly: full,
    fraction,
    units: fraction * bankroll,
    pUsed,
    edge,
    minBookOdds: minBook,
    reason: `${input.confidence.tier} fractional Kelly on ${(pUsed * 100).toFixed(0)}% hist rate, capped at 2.5% of bankroll.`,
  };
}

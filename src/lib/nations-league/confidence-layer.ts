/**
 * History-based confidence layer for Nations League Value Opportunities.
 * Bins locked pre-match probabilities vs actual hits and assigns Strong / Moderate / Weak / None.
 */

export type ConfidenceTier = "strong" | "moderate" | "weak" | "none";

export type ConfidenceEvalRow = {
  marketKey: string;
  predictedProb: number;
  hit: boolean;
  matchDate?: string | null;
};

export type ConfidenceBinDef = {
  label: string;
  lo: number;
  hi: number;
};

export const CONFIDENCE_BINS: ConfidenceBinDef[] = [
  { label: "0-40", lo: 0, hi: 0.4 },
  { label: "40-50", lo: 0.4, hi: 0.5 },
  { label: "50-60", lo: 0.5, hi: 0.6 },
  { label: "60-70", lo: 0.6, hi: 0.7 },
  { label: "70-80", lo: 0.7, hi: 0.8 },
  { label: "80-90", lo: 0.8, hi: 0.9 },
  { label: "90-100", lo: 0.9, hi: 1.0001 },
];

export type ConfidenceBinSnapshot = {
  label: string;
  lo: number;
  hi: number;
  n: number;
  hits: number;
  avgPred: number;
  hitRate: number;
  wilsonLow: number;
  gap: number;
  tier: ConfidenceTier;
};

export type MarketConfidenceSnapshot = {
  marketKey: string;
  n: number;
  bins: ConfidenceBinSnapshot[];
  strongFloor: number | null;
  moderateFloor: number | null;
  weakFloor: number | null;
};

export type ConfidenceLayerConfig = {
  version: string;
  computedAt: string;
  trainN: number;
  holdoutN: number;
  markets: Record<string, MarketConfidenceSnapshot>;
};

export const EMPTY_CONFIDENCE_LAYER: ConfidenceLayerConfig = {
  version: "nl-confidence-empty",
  computedAt: "",
  trainN: 0,
  holdoutN: 0,
  markets: {},
};

/**
 * Outcome-hit guardrails on the historical hit rate in each model-% bin.
 * - Strong / Moderate: history says the outcome hits often enough to act as a guardrail.
 * - Weak: enough sample to size vs the book using the empirical rate (even if the model % is optimistic).
 */
export const TIER_RULES: Record<
  Exclude<ConfidenceTier, "none">,
  { wilsonLow: number; minN: number; maxGap: number }
> = {
  strong: { wilsonLow: 0.65, minN: 20, maxGap: 0.12 },
  moderate: { wilsonLow: 0.55, minN: 12, maxGap: 0.18 },
  /** Sample-size gate only - empirical rate can be low; Kelly will still refuse negative edge. */
  weak: { wilsonLow: 0, minN: 8, maxGap: 1 },
};

export const STRONG_HOLDOUT_WILSON_MIN = 0.6;
export const STRONG_HOLDOUT_MIN_N = 8;
export const FLOOR_BLEND_STEP = 0.25;

const TIER_RANK: Record<ConfidenceTier, number> = {
  none: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

export function wilsonLower(hits: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, Math.min(1, (centre - margin) / denom));
}

export function binForProb(prob: number): ConfidenceBinDef {
  const p = Number.isFinite(prob) ? Math.max(0, Math.min(1, prob)) : 0;
  for (const bin of CONFIDENCE_BINS) {
    if (p >= bin.lo && p < bin.hi) return bin;
  }
  return CONFIDENCE_BINS[CONFIDENCE_BINS.length - 1]!;
}

export function assignBinTier(bin: {
  n: number;
  hitRate: number;
  wilsonLow: number;
  gap: number;
}): ConfidenceTier {
  if (
    bin.n >= TIER_RULES.strong.minN &&
    bin.wilsonLow >= TIER_RULES.strong.wilsonLow &&
    bin.gap <= TIER_RULES.strong.maxGap
  ) {
    return "strong";
  }
  if (
    bin.n >= TIER_RULES.moderate.minN &&
    bin.wilsonLow >= TIER_RULES.moderate.wilsonLow &&
    bin.gap <= TIER_RULES.moderate.maxGap
  ) {
    return "moderate";
  }
  if (bin.n >= TIER_RULES.weak.minN && bin.wilsonLow >= TIER_RULES.weak.wilsonLow) {
    return "weak";
  }
  return "none";
}

function floorForTier(bins: ConfidenceBinSnapshot[], tier: ConfidenceTier): number | null {
  const matching = bins.filter((b) => b.n > 0 && TIER_RANK[b.tier] >= TIER_RANK[tier]);
  if (!matching.length) return null;
  return Math.min(...matching.map((b) => b.lo));
}

export function buildMarketConfidence(
  marketKey: string,
  rows: ConfidenceEvalRow[]
): MarketConfidenceSnapshot {
  const bins: ConfidenceBinSnapshot[] = CONFIDENCE_BINS.map((def) => {
    const inBin = rows.filter((r) => {
      const b = binForProb(r.predictedProb);
      return b.label === def.label;
    });
    const n = inBin.length;
    const hits = inBin.filter((r) => r.hit).length;
    const avgPred = n ? inBin.reduce((s, r) => s + r.predictedProb, 0) / n : 0;
    const hitRate = n ? hits / n : 0;
    const wilsonLow = wilsonLower(hits, n);
    const gap = avgPred - hitRate;
    const stats = { n, hitRate, wilsonLow, gap };
    return {
      label: def.label,
      lo: def.lo,
      hi: def.hi,
      n,
      hits,
      avgPred,
      hitRate,
      wilsonLow,
      gap,
      tier: assignBinTier(stats),
    };
  });

  return {
    marketKey,
    n: rows.length,
    bins,
    strongFloor: floorForTier(bins, "strong"),
    moderateFloor: floorForTier(bins, "moderate"),
    weakFloor: floorForTier(bins, "weak"),
  };
}

export function buildConfidenceCurves(
  rows: ConfidenceEvalRow[]
): Record<string, MarketConfidenceSnapshot> {
  const byMarket = new Map<string, ConfidenceEvalRow[]>();
  for (const row of rows) {
    const list = byMarket.get(row.marketKey) ?? [];
    list.push(row);
    byMarket.set(row.marketKey, list);
  }
  const out: Record<string, MarketConfidenceSnapshot> = {};
  for (const [key, list] of byMarket) {
    out[key] = buildMarketConfidence(key, list);
  }
  return out;
}

function holdoutBinStats(
  rows: ConfidenceEvalRow[],
  label: string
): { n: number; hits: number; wilsonLow: number } {
  const inBin = rows.filter((r) => binForProb(r.predictedProb).label === label);
  const n = inBin.length;
  const hits = inBin.filter((r) => r.hit).length;
  return { n, hits, wilsonLow: wilsonLower(hits, n) };
}

/** Demote Strong bins that fail the recent holdout guard. */
export function applyHoldoutGuard(
  train: MarketConfidenceSnapshot,
  holdoutRows: ConfidenceEvalRow[]
): MarketConfidenceSnapshot {
  const bins = train.bins.map((bin) => {
    if (bin.tier !== "strong") return bin;
    const hold = holdoutBinStats(holdoutRows, bin.label);
    if (hold.n < STRONG_HOLDOUT_MIN_N || hold.wilsonLow < STRONG_HOLDOUT_WILSON_MIN) {
      const demoted: ConfidenceBinSnapshot = {
        ...bin,
        tier: assignBinTier({
          n: bin.n,
          hitRate: bin.hitRate,
          wilsonLow: Math.min(bin.wilsonLow, TIER_RULES.moderate.wilsonLow),
          gap: bin.gap,
        }) === "strong"
          ? "moderate"
          : assignBinTier({
              n: bin.n,
              hitRate: bin.hitRate,
              wilsonLow: Math.min(bin.wilsonLow, TIER_RULES.moderate.wilsonLow),
              gap: bin.gap,
            }),
      };
      if (demoted.tier === "strong") {
        return { ...demoted, tier: "moderate" as const };
      }
      return demoted;
    }
    return bin;
  });
  return {
    ...train,
    bins,
    strongFloor: floorForTier(bins, "strong"),
    moderateFloor: floorForTier(bins, "moderate"),
    weakFloor: floorForTier(bins, "weak"),
  };
}

export function blendFloor(
  previous: number | null | undefined,
  next: number | null,
  step = FLOOR_BLEND_STEP
): number | null {
  if (next == null) return previous ?? null;
  if (previous == null || !Number.isFinite(previous)) return next;
  return previous + step * (next - previous);
}

export function blendMarketFloors(
  previous: MarketConfidenceSnapshot | undefined,
  next: MarketConfidenceSnapshot
): MarketConfidenceSnapshot {
  return {
    ...next,
    strongFloor: blendFloor(previous?.strongFloor, next.strongFloor),
    moderateFloor: blendFloor(previous?.moderateFloor, next.moderateFloor),
    weakFloor: blendFloor(previous?.weakFloor, next.weakFloor),
  };
}

export function splitTrainHoldout(
  rows: ConfidenceEvalRow[],
  holdoutFraction = 0.3
): { train: ConfidenceEvalRow[]; holdout: ConfidenceEvalRow[] } {
  if (rows.length < 8) return { train: rows, holdout: [] };
  const dated = [...rows].sort((a, b) =>
    String(a.matchDate ?? "").localeCompare(String(b.matchDate ?? ""))
  );
  const holdN = Math.max(1, Math.round(dated.length * holdoutFraction));
  const cut = Math.max(1, dated.length - holdN);
  return { train: dated.slice(0, cut), holdout: dated.slice(cut) };
}

export type ConfidenceLookup = {
  marketKey: string;
  tier: ConfidenceTier;
  historicalHitRate: number;
  n: number;
  avgPred: number;
  wilsonLow: number;
  binLabel: string;
};

export function lookupConfidence(
  marketKey: string,
  modelProb: number,
  layer: ConfidenceLayerConfig | null | undefined
): ConfidenceLookup {
  const bin = binForProb(modelProb);
  const market = layer?.markets[marketKey];
  const snap = market?.bins.find((b) => b.label === bin.label);
  if (!snap || snap.n === 0) {
    return {
      marketKey,
      tier: "none",
      historicalHitRate: 0,
      n: 0,
      avgPred: modelProb,
      wilsonLow: 0,
      binLabel: bin.label,
    };
  }
  return {
    marketKey,
    tier: snap.tier,
    historicalHitRate: snap.hitRate,
    n: snap.n,
    avgPred: snap.avgPred,
    wilsonLow: snap.wilsonLow,
    binLabel: snap.label,
  };
}

export function calibrateConfidenceLayer(input: {
  rows: ConfidenceEvalRow[];
  previous?: ConfidenceLayerConfig | null;
  now?: Date;
}): ConfidenceLayerConfig {
  const { train, holdout } = splitTrainHoldout(input.rows);
  // Weak / Moderate need the full sample; holdout only guards Strong promotions.
  const fullCurves = buildConfidenceCurves(input.rows);
  const holdoutByMarket = new Map<string, ConfidenceEvalRow[]>();
  for (const row of holdout) {
    const list = holdoutByMarket.get(row.marketKey) ?? [];
    list.push(row);
    holdoutByMarket.set(row.marketKey, list);
  }

  const markets: Record<string, MarketConfidenceSnapshot> = {};
  for (const [key, trained] of Object.entries(fullCurves)) {
    const guarded = applyHoldoutGuard(trained, holdoutByMarket.get(key) ?? []);
    markets[key] = blendMarketFloors(input.previous?.markets[key], guarded);
  }

  return {
    version: `nl-confidence-${input.rows.length}-${(input.now ?? new Date()).getTime()}`,
    computedAt: (input.now ?? new Date()).toISOString(),
    trainN: train.length || input.rows.length,
    holdoutN: holdout.length,
    markets,
  };
}

export function mergeConfidenceLayer(
  raw: Partial<ConfidenceLayerConfig> | null | undefined
): ConfidenceLayerConfig {
  if (!raw) return { ...EMPTY_CONFIDENCE_LAYER, markets: {} };
  return {
    version: String(raw.version ?? EMPTY_CONFIDENCE_LAYER.version),
    computedAt: String(raw.computedAt ?? ""),
    trainN: Number(raw.trainN ?? 0),
    holdoutN: Number(raw.holdoutN ?? 0),
    markets: (raw.markets as Record<string, MarketConfidenceSnapshot>) ?? {},
  };
}

/** Map Value Opportunities row ids to confidence market keys. */
export function valueRowIdToMarketKey(rowId: string): string | null {
  if (rowId === "1x2-home") return "win_probability:home";
  if (rowId === "1x2-draw") return "win_probability:draw";
  if (rowId === "1x2-away") return "win_probability:away";
  if (rowId === "btts-yes") return "btts:yes";
  if (rowId === "btts-no") return "btts:no";

  const ou = rowId.match(/^ou-(over|under)-(\d+(?:\.\d+)?)$/);
  if (ou) return `goals_over_under:${ou[1]}_${ou[2]}`;

  if (rowId === "dc-1x") return "double_chance:1x";
  if (rowId === "dc-12") return "double_chance:12";
  if (rowId === "dc-x2") return "double_chance:x2";

  const range = rowId.match(/^range-(match|home|away)-(.+)$/);
  if (range) return `goal_range_${range[1]}:${range[2]}`;

  const eh = rowId.match(/^eh-(-?\d+)-([hda])$/);
  if (eh) {
    const side = eh[2] === "h" ? "home" : eh[2] === "d" ? "draw" : "away";
    const line = Number(eh[1]);
    const tag = line > 0 ? `+${line}` : String(line);
    return `european_handicap:${tag}_${side}`;
  }

  const tt = rowId.match(/^tt-(home|away)-(over|under)-(\d+(?:\.\d+)?)$/);
  if (tt) return `team_total:${tt[1]}_${tt[2]}_${tt[3]}`;

  return null;
}

export function formatConfidenceTier(tier: ConfidenceTier): string {
  if (tier === "strong") return "Strong";
  if (tier === "moderate") return "Moderate";
  if (tier === "weak") return "Weak";
  return "None";
}

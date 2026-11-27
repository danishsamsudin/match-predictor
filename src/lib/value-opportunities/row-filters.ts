import type { ConfidenceTier } from "@/lib/value-opportunities/confidence-layer";

export type ValueSignalPreset =
  | "positive_model_edge"
  | "positive_hist_edge"
  | "has_history"
  | "kelly_positive";

export type HistEdgePreset = "any" | "gt0" | "gte3" | "gte5" | "gte8";

export type ValueOpportunityFiltersState = {
  /** Empty = all tiers. OR within selection. */
  tiers: ConfidenceTier[];
  histEdge: HistEdgePreset;
  modelOddsMin: string;
  modelOddsMax: string;
  fairOddsMin: string;
  fairOddsMax: string;
  marketOddsMin: string;
  marketOddsMax: string;
  requireBookOdds: boolean;
  /** Empty = no signal constraint. OR within selection (row must match at least one). */
  signals: ValueSignalPreset[];
};

export const DEFAULT_VALUE_FILTERS: ValueOpportunityFiltersState = {
  tiers: [],
  histEdge: "any",
  modelOddsMin: "",
  modelOddsMax: "",
  fairOddsMin: "",
  fairOddsMax: "",
  marketOddsMin: "",
  marketOddsMax: "",
  requireBookOdds: false,
  signals: [],
};

export type FilterableValueRow = {
  modelProb: number;
  fairOdds: number | null;
  bookOdds: number | null;
  modelEdgePct: number | null;
  histEdgePct: number | null;
  confidence?: { tier: ConfidenceTier; n: number } | null;
  kelly?: { fraction: number } | null;
};

function parseBound(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function inRange(
  value: number | null,
  minRaw: string,
  maxRaw: string
): boolean {
  const min = parseBound(minRaw);
  const max = parseBound(maxRaw);
  if (min == null && max == null) return true;
  if (value == null || !Number.isFinite(value)) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function matchesHistEdge(
  histEdgePct: number | null,
  preset: HistEdgePreset
): boolean {
  if (preset === "any") return true;
  if (histEdgePct == null || !Number.isFinite(histEdgePct)) return false;
  if (preset === "gt0") return histEdgePct > 0;
  if (preset === "gte3") return histEdgePct >= 3;
  if (preset === "gte5") return histEdgePct >= 5;
  return histEdgePct >= 8;
}

function matchesSignal(
  row: FilterableValueRow,
  signal: ValueSignalPreset
): boolean {
  if (signal === "positive_model_edge") {
    return row.modelEdgePct != null && row.modelEdgePct > 0;
  }
  if (signal === "positive_hist_edge") {
    return row.histEdgePct != null && row.histEdgePct > 0;
  }
  if (signal === "has_history") {
    return (row.confidence?.n ?? 0) > 0;
  }
  return (row.kelly?.fraction ?? 0) > 0;
}

export function modelOddsFromProb(modelProb: number): number | null {
  if (!Number.isFinite(modelProb) || modelProb <= 0) return null;
  return 1 / modelProb;
}

/** AND across dimensions; OR within multi-select tiers/signals. */
export function rowMatchesFilters(
  row: FilterableValueRow,
  filters: ValueOpportunityFiltersState
): boolean {
  if (filters.tiers.length) {
    const tier = row.confidence?.tier ?? "none";
    if (!filters.tiers.includes(tier)) return false;
  }

  if (!matchesHistEdge(row.histEdgePct, filters.histEdge)) return false;

  const modelOdds = modelOddsFromProb(row.modelProb);
  if (!inRange(modelOdds, filters.modelOddsMin, filters.modelOddsMax)) {
    return false;
  }
  if (!inRange(row.fairOdds, filters.fairOddsMin, filters.fairOddsMax)) {
    return false;
  }

  if (filters.requireBookOdds && row.bookOdds == null) return false;
  if (!inRange(row.bookOdds, filters.marketOddsMin, filters.marketOddsMax)) {
    return false;
  }

  if (filters.signals.length) {
    const any = filters.signals.some((s) => matchesSignal(row, s));
    if (!any) return false;
  }

  return true;
}

export function valueFiltersActive(filters: ValueOpportunityFiltersState): boolean {
  return (
    filters.tiers.length > 0 ||
    filters.histEdge !== "any" ||
    Boolean(filters.modelOddsMin.trim()) ||
    Boolean(filters.modelOddsMax.trim()) ||
    Boolean(filters.fairOddsMin.trim()) ||
    Boolean(filters.fairOddsMax.trim()) ||
    Boolean(filters.marketOddsMin.trim()) ||
    Boolean(filters.marketOddsMax.trim()) ||
    filters.requireBookOdds ||
    filters.signals.length > 0
  );
}

export function valueFiltersEmptyMessage(
  filters: ValueOpportunityFiltersState
): string {
  if (!valueFiltersActive(filters)) return "No markets to show.";
  return "No rows match these filters - clear one or more.";
}

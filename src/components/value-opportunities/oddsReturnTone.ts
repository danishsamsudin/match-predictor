/**
 * Book-odds return bands for Value Opportunities.
 * Short prices pay little; longer prices are easier to scan as worth considering.
 */
export type OddsReturnTone = "low" | "mid" | "high" | "empty";

export function oddsReturnTone(odds: number | null | undefined): OddsReturnTone {
  if (odds == null || !Number.isFinite(odds) || odds <= 1) return "empty";
  if (odds < 1.4) return "low";
  if (odds <= 1.75) return "mid";
  return "high";
}

/** Text + soft ring classes for book-odds inputs. */
export function oddsReturnInputClass(tone: OddsReturnTone): string {
  switch (tone) {
    case "low":
      return "border-rose-400/60 text-rose-700 ring-1 ring-inset ring-rose-400/35 dark:border-rose-500/50 dark:text-rose-300 dark:ring-rose-500/30";
    case "mid":
      return "border-amber-400/60 text-amber-800 ring-1 ring-inset ring-amber-400/35 dark:border-amber-500/50 dark:text-amber-300 dark:ring-amber-500/30";
    case "high":
      return "border-emerald-400/60 text-emerald-700 ring-1 ring-inset ring-emerald-400/35 dark:border-emerald-500/50 dark:text-emerald-300 dark:ring-emerald-500/30";
    default:
      return "border-glass-border text-foreground";
  }
}

export function oddsReturnDotClass(tone: Exclude<OddsReturnTone, "empty">): string {
  switch (tone) {
    case "low":
      return "bg-rose-500";
    case "mid":
      return "bg-amber-500";
    case "high":
      return "bg-emerald-500";
  }
}

import type { ConfidenceLookup } from "@/lib/value-opportunities/confidence-layer";
import type { KellyStakeResult } from "@/lib/value-opportunities/kelly-stake";

/**
 * One shared action policy for every Value Opportunities market.
 *
 * Markets already specialize through the confidence layer (per-market reliability
 * bins). Re-deriving a separate BTTS / 1X2 / O/U heuristic would drift and fight
 * that layer. Keep this as a thin, fixed mapping of shared signals:
 * confidence tier + hist edge + Kelly stake (+ optional model edge as a Watch hint).
 *
 * Adaptation over time should come from recalibrating confidence / hit rates on
 * postmatch - not from rewriting per-market action formulas. Threshold constants
 * below can later be tuned from Pass/Watch/Bet P/L if we log recommendations.
 */

export type ValueAction = "pass" | "watch" | "bet";

export type ValueActionResult = {
  action: ValueAction;
  label: string;
  reason: string;
};

/** Model edge (%) that can promote a history-fail row to Watch (price to chase). */
export const VALUE_ACTION_MODEL_WATCH_EDGE_PCT = 3;

export function formatValueAction(action: ValueAction): string {
  if (action === "bet") return "Bet";
  if (action === "watch") return "Watch";
  return "Pass";
}

export function suggestValueAction(input: {
  bookOdds: number | null;
  confidence?: ConfidenceLookup;
  kelly?: KellyStakeResult;
  modelEdgePct: number | null;
  histEdgePct: number | null;
}): ValueActionResult {
  const { bookOdds, confidence, kelly, modelEdgePct, histEdgePct } = input;

  if (bookOdds == null) {
    return {
      action: "pass",
      label: formatValueAction("pass"),
      reason: "Enter book odds before deciding.",
    };
  }

  if (!confidence || confidence.tier === "none") {
    return {
      action: "pass",
      label: formatValueAction("pass"),
      reason: "Not enough locked history in this model-% band.",
    };
  }

  if (kelly && kelly.fraction > 0) {
    if (confidence.tier === "strong" || confidence.tier === "moderate") {
      return {
        action: "bet",
        label: formatValueAction("bet"),
        reason: `${formatValueAction("bet")}: ${confidence.tier} history plus a Kelly stake at this book.`,
      };
    }
    return {
      action: "watch",
      label: formatValueAction("watch"),
      reason:
        "Weak history clears a small Kelly stake - optional only; wait for a better price or stronger band if unsure.",
    };
  }

  if (histEdgePct != null && histEdgePct > 0) {
    return {
      action: "watch",
      label: formatValueAction("watch"),
      reason:
        "History is slightly positive but below the Kelly bar - watch for a longer book.",
    };
  }

  if (
    modelEdgePct != null &&
    modelEdgePct >= VALUE_ACTION_MODEL_WATCH_EDGE_PCT &&
    (histEdgePct == null || histEdgePct <= 0)
  ) {
    return {
      action: "watch",
      label: formatValueAction("watch"),
      reason:
        "Model likes the price; history does not yet. Watch for a longer book or more sample.",
    };
  }

  return {
    action: "pass",
    label: formatValueAction("pass"),
    reason:
      kelly?.minBookOdds != null
        ? `No historical edge at this price. Need book ≥ ${kelly.minBookOdds.toFixed(2)}.`
        : "No historical edge at this price.",
  };
}

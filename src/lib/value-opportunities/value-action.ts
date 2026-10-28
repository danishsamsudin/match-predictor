import type { ConfidenceLookup } from "@/lib/value-opportunities/confidence-layer";
import type { KellyStakeResult } from "@/lib/value-opportunities/kelly-stake";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";

/**
 * One shared action policy for every Value Opportunities market.
 *
 * Markets already specialize through the confidence layer (per-market reliability
 * bins). A thin market-family gate sits in front so Goal Range / extreme Unders
 * and weak away sides cannot clear Bet on raw model edge alone.
 */

export type ValueAction = "pass" | "watch" | "bet";

export type ValueActionResult = {
  action: ValueAction;
  label: string;
  reason: string;
};

export type ValueActionGate = "prefer" | "haircut" | "block" | "neutral";

/** Model edge (%) that can promote a history-fail row to Watch (price to chase). */
export const VALUE_ACTION_MODEL_WATCH_EDGE_PCT = 3;

const HAIRCUT_LEAGUE_IDS = new Set<number>([
  SM_LEAGUE.CHAMPIONSHIP,
  SM_LEAGUE.BUNDESLIGA,
]);

export function formatValueAction(action: ValueAction): string {
  if (action === "bet") return "Bet";
  if (action === "watch") return "Watch";
  return "Pass";
}

/**
 * Classify a Value Opportunities row for the handicap-focused gate.
 * `marketKey` is the confidence key from `valueRowIdToMarketKey`.
 */
export function classifyValueActionGate(input: {
  marketKey?: string | null;
  leagueSmId?: number | null;
}): ValueActionGate {
  const key = (input.marketKey ?? "").toLowerCase();
  if (!key) return "neutral";

  if (
    key.startsWith("goal_range_") ||
    key === "team_total:home_under_0.5" ||
    key === "team_total:away_under_0.5" ||
    key === "goals_over_under:under_1.5"
  ) {
    return "block";
  }

  const leagueHaircut =
    input.leagueSmId != null && HAIRCUT_LEAGUE_IDS.has(Number(input.leagueSmId));

  if (
    key === "asian_handicap:away_-0.5" ||
    key === "asian_handicap:away_0.5" ||
    key === "asian_handicap:away_+0.5" ||
    key === "double_chance:x2" ||
    key === "win_probability:away"
  ) {
    return "haircut";
  }

  if (leagueHaircut) return "haircut";

  if (
    key.startsWith("european_handicap:") &&
    (key.includes("-1_") || key.includes("+1_")) &&
    (key.endsWith("_home") || key.endsWith("_draw"))
  ) {
    return "prefer";
  }
  if (
    key === "asian_handicap:home_-0.5" ||
    key === "asian_handicap:home_0.5" ||
    key === "asian_handicap:home_+0.5" ||
    key === "asian_handicap:home_1.5" ||
    key === "asian_handicap:home_+1.5" ||
    key === "double_chance:1x" ||
    key === "win_probability:home" ||
    key === "win_probability:draw"
  ) {
    return "prefer";
  }

  return "neutral";
}

export function suggestValueAction(input: {
  bookOdds: number | null;
  confidence?: ConfidenceLookup;
  kelly?: KellyStakeResult;
  modelEdgePct: number | null;
  histEdgePct: number | null;
  /** Confidence market key (e.g. `asian_handicap:home_-0.5`). */
  marketKey?: string | null;
  leagueSmId?: number | null;
}): ValueActionResult {
  const { bookOdds, confidence, kelly, modelEdgePct, histEdgePct } = input;
  const gate = classifyValueActionGate({
    marketKey: input.marketKey ?? confidence?.marketKey,
    leagueSmId: input.leagueSmId,
  });

  if (bookOdds == null) {
    return {
      action: "pass",
      label: formatValueAction("pass"),
      reason: "Enter book odds before deciding.",
    };
  }

  if (gate === "block") {
    return {
      action: "pass",
      label: formatValueAction("pass"),
      reason:
        "Blocked market family (goal range / extreme under). Focus on AH, EH, DC, and 1X2 home/draw.",
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
    if (gate === "haircut") {
      if (confidence.tier === "strong") {
        return {
          action: "bet",
          label: formatValueAction("bet"),
          reason: `${formatValueAction("bet")}: haircut side/league cleared Strong history plus Kelly.`,
        };
      }
      return {
        action: "watch",
        label: formatValueAction("watch"),
        reason:
          "Haircut side or league - need Strong history before Bet; Watch only for now.",
      };
    }

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
    (histEdgePct == null || histEdgePct <= 0) &&
    gate !== "haircut"
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

"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatConfidenceTier,
  type ConfidenceLookup,
  type ConfidenceTier,
} from "@/lib/value-opportunities/confidence-layer";
import type { KellyStakeResult } from "@/lib/value-opportunities/kelly-stake";
import {
  formatValueAction,
  type ValueAction,
  type ValueActionResult,
} from "@/lib/value-opportunities/value-action";

export const TIER_STYLES: Record<
  ConfidenceTier,
  { badge: string; dot: string; label: string }
> = {
  strong: {
    badge: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "Decision-ready",
  },
  moderate: {
    badge: "bg-sky-500/15 text-sky-900 ring-sky-500/25 dark:text-sky-300",
    dot: "bg-sky-500",
    label: "Useful signal",
  },
  weak: {
    badge: "bg-amber-500/15 text-amber-900 ring-amber-500/25 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Thin / optimistic model",
  },
  none: {
    badge: "bg-rose-500/10 text-rose-800 ring-rose-500/20 dark:text-rose-300",
    dot: "bg-rose-500",
    label: "Do not rely",
  },
};

const ACTION_STYLES: Record<
  ValueAction,
  { badge: string; blurb: string }
> = {
  pass: {
    badge: "bg-rose-500/10 text-rose-800 ring-rose-500/20 dark:text-rose-300",
    blurb: "Skip this price",
  },
  watch: {
    badge: "bg-amber-500/15 text-amber-900 ring-amber-500/25 dark:text-amber-300",
    blurb: "Interesting - do not force",
  },
  bet: {
    badge: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300",
    blurb: "History + price align",
  },
};

function confidenceTierBlurb(tier: ConfidenceTier): string {
  if (tier === "strong") {
    return "History backs this band well enough to treat as a decision-ready signal.";
  }
  if (tier === "moderate") {
    return "Useful history - treat as a guardrail, not a guarantee.";
  }
  if (tier === "weak") {
    return "Enough history to size a small stake from the hit rate, but the model % may still be optimistic.";
  }
  return "Not enough reliable history in this band - stake stays €0.00.";
}

function formatStakeEuros(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

function ConfidencePopup({ lookup }: { lookup: ConfidenceLookup }) {
  const tier = lookup.tier;
  const hitPct = (lookup.historicalHitRate * 100).toFixed(0);
  const hasHistory = lookup.n > 0;

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Confidence
        </p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">
          {formatConfidenceTier(tier)}
          <span className="font-medium text-muted"> - {TIER_STYLES[tier].label}</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">
          {confidenceTierBlurb(tier)}
        </p>
      </div>

      {hasHistory ? (
        <div className="space-y-2 border-t border-glass-border pt-2.5">
          <div>
            <p className="text-[11px] font-semibold text-foreground">Hit {hitPct}%</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              When the model showed a similar % on this market before, the outcome
              actually won in {hitPct}% of those locked predictions. Stake sizing
              uses this rate, not the raw model %.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-foreground">n = {lookup.n}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Sample size: how many past cases that hit rate is based on. Larger n
              means the % is more trustworthy; small n means it can swing a lot.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            What this tells you: compare book odds to the hit rate. If the book is
            shorter than ~{hitPct}% implied, history says there is no edge - even
            if the model % looks higher.
          </p>
        </div>
      ) : (
        <p className="border-t border-glass-border pt-2.5 text-xs leading-relaxed text-muted">
          No locked predictions in this model-% band yet, so we cannot check how
          often this price actually hit.
        </p>
      )}
    </div>
  );
}

export function ConfidenceCell({
  lookup,
  compact = false,
}: {
  lookup: ConfidenceLookup;
  /** Single-line badge for compact Value Opportunities rows. */
  compact?: boolean;
}) {
  const tier = lookup.tier;
  const style = TIER_STYLES[tier];
  const ariaLabel =
    lookup.n > 0
      ? `${formatConfidenceTier(tier)} confidence: hit ${(lookup.historicalHitRate * 100).toFixed(0)}% in ${lookup.n} past games. Tap for explanation.`
      : `${formatConfidenceTier(tier)} confidence: no history yet. Tap for explanation.`;

  return (
    <div className={compact ? undefined : "min-w-[7.5rem]"}>
      <Tooltip
        label="Confidence explained"
        content={<ConfidencePopup lookup={lookup} />}
        side="top"
      >
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-flex max-w-full cursor-help rounded-md px-2 py-1 text-left ring-1 ring-inset transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${style.badge} ${
            compact
              ? "items-center gap-1.5"
              : "flex-col items-start gap-1"
          }`}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
            {formatConfidenceTier(tier)}
          </span>
          {!compact && lookup.n > 0 ? (
            <span className="text-[11px] font-medium leading-snug opacity-80">
              Hit{" "}
              <span className="tabular-nums">
                {(lookup.historicalHitRate * 100).toFixed(0)}%
              </span>
              {" · "}
              <span className="tabular-nums">{lookup.n}</span> games
            </span>
          ) : null}
          {!compact && lookup.n <= 0 ? (
            <span className="text-[11px] font-medium leading-snug opacity-80">
              No history yet
            </span>
          ) : null}
          {compact && lookup.n > 0 ? (
            <span className="text-[11px] font-medium tabular-nums opacity-80">
              {(lookup.historicalHitRate * 100).toFixed(0)}%
            </span>
          ) : null}
        </button>
      </Tooltip>
    </div>
  );
}

export function StakeCell({
  bookOdds,
  kelly,
  confidenceTier,
  compact = false,
}: {
  bookOdds: number | null;
  kelly?: KellyStakeResult;
  confidenceTier?: ConfidenceLookup["tier"];
  /** Inline single-line stake for compact Value Opportunities rows. */
  compact?: boolean;
}) {
  if (bookOdds == null) {
    return <span className="text-muted">-</span>;
  }
  if (kelly && kelly.fraction > 0) {
    if (compact) {
      return (
        <span
          title={kelly.reason}
          className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
        >
          {formatStakeEuros(kelly.units)}
          <span className="ml-1 font-medium text-muted">
            ({(kelly.fraction * 100).toFixed(1)}%)
          </span>
        </span>
      );
    }
    return (
      <div title={kelly.reason}>
        <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatStakeEuros(kelly.units)}
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          {(kelly.fraction * 100).toFixed(1)}% of bankroll
        </p>
      </div>
    );
  }
  if (confidenceTier === "none") {
    if (compact) {
      return (
        <span
          title={kelly?.reason ?? "Not enough history for a stake."}
          className="font-medium tabular-nums text-muted"
        >
          {formatStakeEuros(0)} · no history
        </span>
      );
    }
    return (
      <div title={kelly?.reason ?? "Not enough history for a stake."}>
        <p className="text-xs font-medium tabular-nums text-muted">
          {formatStakeEuros(0)}
        </p>
        <p className="text-[11px] leading-snug text-muted">No history</p>
      </div>
    );
  }
  if (kelly?.minBookOdds != null) {
    if (compact) {
      return (
        <span title={kelly.reason} className="font-medium text-amber-800 dark:text-amber-300">
          Need ≥ <span className="tabular-nums">{kelly.minBookOdds.toFixed(2)}</span>
        </span>
      );
    }
    return (
      <div title={kelly.reason}>
        <p className="text-xs font-medium tabular-nums text-muted">
          {formatStakeEuros(0)}
        </p>
        <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
          Need ≥ <span className="tabular-nums">{kelly.minBookOdds.toFixed(2)}</span>
        </p>
      </div>
    );
  }
  if (compact) {
    return (
      <span title={kelly?.reason ?? "No stake"} className="font-medium tabular-nums text-muted">
        {formatStakeEuros(0)}
      </span>
    );
  }
  return (
    <div title={kelly?.reason ?? "No stake"}>
      <p className="text-xs font-medium tabular-nums text-muted">
        {formatStakeEuros(0)}
      </p>
      <p className="text-[11px] leading-snug text-muted">No stake</p>
    </div>
  );
}

export function ActionCell({ decision }: { decision: ValueActionResult }) {
  const style = ACTION_STYLES[decision.action];
  return (
    <Tooltip
      label={`${formatValueAction(decision.action)} explained`}
      content={
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">
            {decision.label}
            <span className="font-medium text-muted"> - {style.blurb}</span>
          </p>
          <p className="text-xs leading-relaxed text-muted">{decision.reason}</p>
          <p className="text-xs leading-relaxed text-muted">
            Same rule for every market: confidence tier, historical edge, and Kelly
            stake. Markets already specialize through their own hit-rate history.
          </p>
        </div>
      }
      side="top"
    >
      <button
        type="button"
        aria-label={`${decision.label}: ${decision.reason}`}
        className={`inline-flex cursor-help items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${style.badge}`}
      >
        {decision.label}
      </button>
    </Tooltip>
  );
}

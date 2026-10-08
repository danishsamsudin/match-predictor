"use client";

import type { ValueAction } from "@/lib/value-opportunities/value-action";
import { formatValueAction } from "@/lib/value-opportunities/value-action";
import { oddsReturnDotClass } from "@/components/value-opportunities/oddsReturnTone";

export type ValueActionFilter = "all" | ValueAction;

const FILTER_OPTIONS: ValueActionFilter[] = ["all", "bet", "watch", "pass"];

export function OddsReturnLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
      <span className="font-medium text-foreground/80">Book return</span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${oddsReturnDotClass("low")}`} />
        <span className="text-rose-700 dark:text-rose-300">&lt; 1.40</span>
      </span>
      <span className="hidden text-muted/50 sm:inline" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${oddsReturnDotClass("mid")}`} />
        <span className="text-amber-800 dark:text-amber-300">1.40 - 1.75</span>
      </span>
      <span className="hidden text-muted/50 sm:inline" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${oddsReturnDotClass("high")}`} />
        <span className="text-emerald-700 dark:text-emerald-300">&gt; 1.75</span>
      </span>
    </div>
  );
}

export function ValueOpportunityFilters({
  value,
  onChange,
  showActionFilters,
}: {
  value: ValueActionFilter;
  onChange: (next: ValueActionFilter) => void;
  /** When false, only All is shown (no confidence / action yet). */
  showActionFilters: boolean;
}) {
  if (!showActionFilters) {
    return <OddsReturnLegend />;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="tablist"
        aria-label="Filter by action"
        className="grid w-full grid-cols-4 gap-1 rounded-lg border border-glass-border bg-surface/60 p-1 sm:inline-flex sm:w-auto"
      >
        {FILTER_OPTIONS.map((option) => {
          const selected = value === option;
          const label = option === "all" ? "All" : formatValueAction(option);
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(option)}
              className={`min-h-9 rounded-md px-2 py-2 text-xs font-semibold transition sm:min-h-0 sm:px-2.5 sm:py-1 ${
                selected
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <OddsReturnLegend />
    </div>
  );
}

export function valueActionFilterEmptyMessage(filter: ValueActionFilter): string {
  if (filter === "all") return "No markets to show.";
  return `No ${formatValueAction(filter)} opportunities yet - fill book odds or try All.`;
}

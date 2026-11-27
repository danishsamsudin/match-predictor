"use client";

import { useState } from "react";
import { TIER_STYLES } from "@/components/value-opportunities/ValueOpportunityCells";
import { oddsReturnDotClass } from "@/components/value-opportunities/oddsReturnTone";
import { InfoTip } from "@/components/ui/InfoTip";
import type { ConfidenceTier } from "@/lib/value-opportunities/confidence-layer";
import { formatConfidenceTier } from "@/lib/value-opportunities/confidence-layer";
import {
  DEFAULT_VALUE_FILTERS,
  type HistEdgePreset,
  type ValueOpportunityFiltersState,
  type ValueSignalPreset,
  valueFiltersActive,
  valueFiltersEmptyMessage,
} from "@/lib/value-opportunities/row-filters";

export { valueFiltersEmptyMessage };

export type { ValueOpportunityFiltersState };

const TIER_OPTIONS: ConfidenceTier[] = ["strong", "moderate", "weak", "none"];

const HIST_EDGE_OPTIONS: { id: HistEdgePreset; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "gt0", label: "> 0%" },
  { id: "gte3", label: "≥ 3%" },
  { id: "gte5", label: "≥ 5%" },
  { id: "gte8", label: "≥ 8%" },
];

const SIGNAL_OPTIONS: { id: ValueSignalPreset; label: string }[] = [
  { id: "positive_model_edge", label: "+Model edge" },
  { id: "positive_hist_edge", label: "+Hist edge" },
  { id: "has_history", label: "Has history" },
  { id: "kelly_positive", label: "Kelly > 0" },
];

function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${
        active
          ? "bg-foreground text-background"
          : "border border-glass-border bg-background text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function OddsBoundInputs({
  label,
  minValue,
  maxValue,
  onChange,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="type-meta font-semibold uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={1.01}
          max={50}
          step={0.01}
          placeholder="Min"
          value={minValue}
          aria-label={`${label} minimum`}
          className="h-9 w-full min-w-0 rounded-lg border border-glass-border bg-background px-2.5 text-sm tabular-nums text-foreground placeholder:text-muted"
          onChange={(e) => onChange(e.target.value, maxValue)}
        />
        <span className="type-meta shrink-0">to</span>
        <input
          type="number"
          inputMode="decimal"
          min={1.01}
          max={50}
          step={0.01}
          placeholder="Max"
          value={maxValue}
          aria-label={`${label} maximum`}
          className="h-9 w-full min-w-0 rounded-lg border border-glass-border bg-background px-2.5 text-sm tabular-nums text-foreground placeholder:text-muted"
          onChange={(e) => onChange(minValue, e.target.value)}
        />
      </div>
    </div>
  );
}

function ConfidenceFormulaTip() {
  return (
    <div className="max-w-xs space-y-2 text-xs leading-relaxed">
      <p>
        Each market is binned by model probability. Tier comes from that bin&apos;s
        locked history:
      </p>
      <ul className="list-disc space-y-1 pl-4">
        <li>
          <strong>Strong</strong>: n ≥ 20, Wilson lower ≥ 65%, gap ≤ 12%
        </li>
        <li>
          <strong>Moderate</strong>: n ≥ 12, Wilson lower ≥ 55%, gap ≤ 18%
        </li>
        <li>
          <strong>Weak</strong>: n ≥ 8 only
        </li>
        <li>
          <strong>None</strong>: n &lt; 8
        </li>
      </ul>
    </div>
  );
}

function summarizeFilters(value: ValueOpportunityFiltersState): string {
  const parts: string[] = [];
  if (value.tiers.length) {
    parts.push(value.tiers.map(formatConfidenceTier).join("/"));
  }
  if (value.histEdge !== "any") {
    parts.push(
      HIST_EDGE_OPTIONS.find((o) => o.id === value.histEdge)?.label ?? value.histEdge
    );
  }
  if (value.signals.length) parts.push(`${value.signals.length} signal`);
  if (value.requireBookOdds) parts.push("Has odds");
  if (
    value.modelOddsMin ||
    value.modelOddsMax ||
    value.fairOddsMin ||
    value.fairOddsMax ||
    value.marketOddsMin ||
    value.marketOddsMax
  ) {
    parts.push("Odds range");
  }
  return parts.length ? parts.join(" · ") : "No filters";
}

export function ValueOpportunityFilters({
  value,
  onChange,
  showConfidence,
  shownCount,
  totalCount,
}: {
  value: ValueOpportunityFiltersState;
  onChange: (next: ValueOpportunityFiltersState) => void;
  showConfidence: boolean;
  shownCount?: number;
  totalCount?: number;
}) {
  const active = valueFiltersActive(value);
  const [open, setOpen] = useState(active);
  const patch = (partial: Partial<ValueOpportunityFiltersState>) =>
    onChange({ ...value, ...partial });
  const showCount =
    typeof shownCount === "number" &&
    typeof totalCount === "number" &&
    Number.isFinite(shownCount) &&
    Number.isFinite(totalCount);

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-glass-border bg-background px-3.5 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            Filters
            {active ? (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                On
              </span>
            ) : null}
            <span className="text-muted" aria-hidden>
              {open ? "▴" : "▾"}
            </span>
          </button>
          {!open ? (
            <p className="type-meta">{summarizeFilters(value)}</p>
          ) : null}
          {showConfidence ? (
            <InfoTip label="How confidence tiers are calculated" size="sm">
              <ConfidenceFormulaTip />
            </InfoTip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showCount ? (
            <p className="type-body tabular-nums">
              Showing{" "}
              <span className="font-semibold">{shownCount}</span>
              {" of "}
              <span className="font-semibold">{totalCount}</span>
            </p>
          ) : null}
          {active ? (
            <button
              type="button"
              className="type-meta font-semibold text-primary hover:underline"
              onClick={() => {
                onChange(DEFAULT_VALUE_FILTERS);
                setOpen(false);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="space-y-4 rounded-2xl border border-glass-border bg-background p-4">
          {showConfidence ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <p className="type-meta font-semibold uppercase tracking-wide">
                  Confidence
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TIER_OPTIONS.map((tier) => {
                    const selected = value.tiers.includes(tier);
                    return (
                      <Chip
                        key={tier}
                        active={selected}
                        onClick={() =>
                          patch({ tiers: toggleInList(value.tiers, tier) })
                        }
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${TIER_STYLES[tier].dot}`}
                          aria-hidden
                        />
                        {formatConfidenceTier(tier)}
                      </Chip>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="type-meta font-semibold uppercase tracking-wide">
                  Hist edge
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {HIST_EDGE_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      active={value.histEdge === opt.id}
                      onClick={() => patch({ histEdge: opt.id })}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="type-meta font-semibold uppercase tracking-wide">
              Signals
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SIGNAL_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  active={value.signals.includes(opt.id)}
                  onClick={() =>
                    patch({ signals: toggleInList(value.signals, opt.id) })
                  }
                >
                  {opt.label}
                </Chip>
              ))}
              <Chip
                active={value.requireBookOdds}
                onClick={() => patch({ requireBookOdds: !value.requireBookOdds })}
              >
                Has market odds
              </Chip>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <OddsBoundInputs
              label="Model odds"
              minValue={value.modelOddsMin}
              maxValue={value.modelOddsMax}
              onChange={(min, max) =>
                patch({ modelOddsMin: min, modelOddsMax: max })
              }
            />
            <OddsBoundInputs
              label="Fair odds"
              minValue={value.fairOddsMin}
              maxValue={value.fairOddsMax}
              onChange={(min, max) =>
                patch({ fairOddsMin: min, fairOddsMax: max })
              }
            />
            <OddsBoundInputs
              label="Market odds"
              minValue={value.marketOddsMin}
              maxValue={value.marketOddsMax}
              onChange={(min, max) =>
                patch({ marketOddsMin: min, marketOddsMax: max })
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-meta">
            <span className="font-medium text-foreground/80">Book return</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${oddsReturnDotClass("low")}`} />
              <span className="text-rose-700 dark:text-rose-300">&lt; 1.40</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${oddsReturnDotClass("mid")}`} />
              <span className="text-amber-800 dark:text-amber-300">1.40 - 1.75</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${oddsReturnDotClass("high")}`} />
              <span className="text-emerald-700 dark:text-emerald-300">&gt; 1.75</span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

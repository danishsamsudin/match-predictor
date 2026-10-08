"use client";

import { BookSourceBadge } from "@/components/value-opportunities/BookSourceBadge";
import {
  ActionCell,
  ConfidenceCell,
  StakeCell,
} from "@/components/value-opportunities/ValueOpportunityCells";
import {
  oddsReturnInputClass,
  oddsReturnTone,
} from "@/components/value-opportunities/oddsReturnTone";
import type { OddsBookSource } from "@/lib/odds-api/types";
import type { ConfidenceLookup } from "@/lib/value-opportunities/confidence-layer";
import type { KellyStakeResult } from "@/lib/value-opportunities/kelly-stake";
import type { ValueActionResult } from "@/lib/value-opportunities/value-action";

function pct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

export type ValueOpportunityRowData = {
  id: string;
  market: string;
  modelProb: number;
  fairOdds: number | null;
  bookOdds: number | null;
  modelEdgePct: number | null;
  histEdgePct: number | null;
  confidence?: ConfidenceLookup;
  kelly?: KellyStakeResult;
  action?: ValueActionResult;
};

export function ValueOpportunityRow({
  row,
  bookValue,
  bookSource,
  showConfidence,
  edgePct,
  onBookChange,
}: {
  row: ValueOpportunityRowData;
  bookValue: string;
  bookSource?: OddsBookSource | null;
  showConfidence: boolean;
  edgePct: number | null;
  onBookChange: (id: string, value: string) => void;
}) {
  const tone = oddsReturnTone(row.bookOdds);
  const inputToneClass = oddsReturnInputClass(tone);
  const edgeClass =
    edgePct == null
      ? "text-muted"
      : edgePct >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";
  const edgeLabel =
    edgePct == null
      ? "-"
      : `${edgePct >= 0 ? "+" : ""}${edgePct.toFixed(1)}%`;

  return (
    <div className="border-b border-glass-border/60 py-3 last:border-b-0">
      {/* Market + action */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
          {row.market}
        </p>
        {showConfidence ? (
          row.action ? (
            <div className="shrink-0">
              <ActionCell decision={row.action} />
            </div>
          ) : (
            <span className="shrink-0 text-xs text-muted">-</span>
          )
        ) : null}
      </div>

      {/* Book odds + edge - fixed two-zone row, no wrap chaos */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Book
          </p>
          <div className="flex items-center gap-1.5">
            <input
              className={`h-9 w-[5.25rem] rounded-lg border bg-surface px-2.5 text-sm font-semibold tabular-nums ${inputToneClass}`}
              inputMode="decimal"
              placeholder="2.10"
              value={bookValue}
              onChange={(e) => onBookChange(row.id, e.target.value)}
              aria-label={`Book odds for ${row.market}`}
            />
            {bookSource ? (
              <BookSourceBadge
                source={bookSource}
                unibetPreferred={bookSource === "unibet"}
              />
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {showConfidence ? "Hist edge" : "Edge"}
          </p>
          <p className={`text-base font-semibold tabular-nums leading-9 ${edgeClass}`}>
            {edgeLabel}
          </p>
        </div>
      </div>

      {/* Secondary metrics - 2x2 on phone, inline on larger */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-muted sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5">
        <div>
          <span className="text-muted">Model </span>
          <span className="font-medium tabular-nums text-foreground/85">
            {pct(row.modelProb)}
          </span>
        </div>
        <div>
          <span className="text-muted">Fair </span>
          <span className="font-medium tabular-nums text-foreground/85">
            {row.fairOdds?.toFixed(2) ?? "-"}
          </span>
        </div>
        {showConfidence ? (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              {row.confidence ? (
                <ConfidenceCell lookup={row.confidence} compact />
              ) : (
                <span>Confidence -</span>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="shrink-0">Stake</span>
              <StakeCell
                bookOdds={row.bookOdds}
                kelly={row.kelly}
                confidenceTier={row.confidence?.tier}
                compact
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

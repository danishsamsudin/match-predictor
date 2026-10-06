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

  return (
    <div className="border-b border-glass-border/60 py-2.5 transition hover:bg-surface/40">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
          {row.market}
        </p>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex items-center gap-1.5">
            <input
              className={`w-[4.75rem] rounded-lg border bg-surface px-2 py-1 text-sm font-semibold tabular-nums ${inputToneClass}`}
              inputMode="decimal"
              placeholder="e.g. 2.10"
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

          <span
            className={`min-w-[3.25rem] text-right text-sm font-semibold tabular-nums ${
              edgePct == null
                ? "text-muted"
                : edgePct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {edgePct == null
              ? "-"
              : `${edgePct >= 0 ? "+" : ""}${edgePct.toFixed(1)}%`}
          </span>

          {showConfidence ? (
            row.action ? (
              <ActionCell decision={row.action} />
            ) : (
              <span className="text-xs text-muted">-</span>
            )
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
        <span>
          Model{" "}
          <span className="tabular-nums text-foreground/80">{pct(row.modelProb)}</span>
        </span>
        <span className="text-muted/40" aria-hidden>
          ·
        </span>
        <span>
          Fair{" "}
          <span className="tabular-nums text-foreground/80">
            {row.fairOdds?.toFixed(2) ?? "-"}
          </span>
        </span>
        {showConfidence ? (
          <>
            <span className="text-muted/40" aria-hidden>
              ·
            </span>
            {row.confidence ? (
              <ConfidenceCell lookup={row.confidence} compact />
            ) : (
              <span>Confidence -</span>
            )}
            <span className="text-muted/40" aria-hidden>
              ·
            </span>
            <div className="inline-flex items-center gap-1.5">
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

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
import {
  VALUE_BOARD_COLS_BASIC,
  VALUE_BOARD_COLS_CONF,
  VALUE_BOARD_ROW,
} from "@/components/value-opportunities/value-board-layout";
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
  bookSourceLabel,
  showConfidence,
  edgePct,
  bankroll,
  onBookChange,
}: {
  row: ValueOpportunityRowData;
  bankroll?: number;
  bookValue: string;
  bookSource?: OddsBookSource | null;
  bookSourceLabel?: string | null;
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

  const bookControl = (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        className={`h-8 w-[4.75rem] shrink-0 rounded-md border bg-surface px-2 text-sm font-semibold tabular-nums ${inputToneClass}`}
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
          labelOverride={bookSourceLabel}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <div
        className={`${VALUE_BOARD_ROW} ${
          showConfidence ? VALUE_BOARD_COLS_CONF : VALUE_BOARD_COLS_BASIC
        }`}
      >
        <p className="type-label min-w-0 truncate pr-1">{row.market}</p>
        <p className="text-right text-sm tabular-nums text-foreground/90">
          {pct(row.modelProb)}
        </p>
        <p className="text-right text-sm tabular-nums text-foreground/90">
          {row.fairOdds?.toFixed(2) ?? "-"}
        </p>
        <div className="min-w-0">{bookControl}</div>
        {showConfidence ? (
          <>
            <div className="min-w-0 justify-self-center">
              {row.confidence ? (
                <ConfidenceCell lookup={row.confidence} compact />
              ) : (
                <span className="type-meta">-</span>
              )}
            </div>
            <p className={`text-right text-sm font-semibold tabular-nums ${edgeClass}`}>
              {edgeLabel}
            </p>
            <div className="min-w-0 justify-self-start">
              <StakeCell
                bookOdds={row.bookOdds}
                kelly={row.kelly}
                confidenceTier={row.confidence?.tier}
                bankroll={bankroll}
                compact
              />
            </div>
            <div className="justify-self-center">
              {row.action ? (
                <ActionCell decision={row.action} />
              ) : (
                <span className="type-meta">-</span>
              )}
            </div>
          </>
        ) : (
          <p className={`text-right text-sm font-semibold tabular-nums ${edgeClass}`}>
            {edgeLabel}
          </p>
        )}
      </div>

      <div className="border-b border-glass-border/60 py-3 last:border-b-0 lg:hidden">
        <div className="flex items-start justify-between gap-2">
          <p className="type-label min-w-0 flex-1">{row.market}</p>
          {showConfidence ? (
            row.action ? (
              <ActionCell decision={row.action} />
            ) : (
              <span className="type-meta">-</span>
            )
          ) : null}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="type-meta mb-1 font-semibold uppercase tracking-wide">Book</p>
            {bookControl}
          </div>
          <div className="shrink-0 text-right">
            <p className="type-meta mb-1 font-semibold uppercase tracking-wide">
              {showConfidence ? "Hist edge" : "Edge"}
            </p>
            <p className={`text-base font-semibold tabular-nums ${edgeClass}`}>
              {edgeLabel}
            </p>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 type-meta sm:flex sm:flex-wrap sm:gap-x-4">
          <div>
            Model{" "}
            <span className="font-medium tabular-nums text-foreground/85">
              {pct(row.modelProb)}
            </span>
          </div>
          <div>
            Fair{" "}
            <span className="font-medium tabular-nums text-foreground/85">
              {row.fairOdds?.toFixed(2) ?? "-"}
            </span>
          </div>
          {showConfidence ? (
            <>
              <div className="flex items-center gap-1.5">
                {row.confidence ? (
                  <ConfidenceCell lookup={row.confidence} compact />
                ) : (
                  <span>Confidence -</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span>Stake</span>
                <StakeCell
                  bookOdds={row.bookOdds}
                  kelly={row.kelly}
                  confidenceTier={row.confidence?.tier}
                  bankroll={bankroll}
                  compact
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

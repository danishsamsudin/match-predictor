"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  GLPM_CX_GLOSSARY,
  type GlossaryEntry,
  type GlossaryKey,
  glossaryTipBody,
} from "@/lib/glpm-cx/glossary";

function GlossaryTipContent({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="max-w-xs space-y-2.5 text-xs leading-relaxed">
      <p className="text-foreground/95">{entry.what}</p>
      <p>
        <span className="font-semibold text-foreground">How it works</span>
        <span className="text-muted"> - {entry.how}</span>
      </p>
      {entry.caveat ? (
        <p className="rounded-lg bg-foreground/5 px-2.5 py-2 text-muted">
          {entry.caveat}
        </p>
      ) : null}
    </div>
  );
}

/** Title row with circular info tip only - no prose under the title. */
export function SectionTip({
  title,
  glossaryKey,
  tipLabel,
  tipBody,
  badge,
  className = "",
}: {
  title: string;
  glossaryKey?: GlossaryKey;
  tipLabel?: string;
  tipBody?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  const entry = glossaryKey ? GLPM_CX_GLOSSARY[glossaryKey] : null;
  const label = tipLabel ?? entry?.label ?? title;
  const body =
    tipBody ??
    (entry ? <GlossaryTipContent entry={entry} /> : null) ??
    (glossaryKey ? glossaryTipBody(glossaryKey) : null);

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="type-meta font-semibold uppercase tracking-wide text-muted">
          {title}
        </h3>
        {badge}
      </div>
      {body ? (
        <InfoTip label={label} size="sm">
          {body}
        </InfoTip>
      ) : null}
    </div>
  );
}

/** Home | label | away with dual mirror bars. */
export function CompareRow({
  label,
  home,
  away,
  homeDisplay,
  awayDisplay,
  max,
  detail,
  edge,
  lowerIsBetter = false,
}: {
  label: string;
  home: number;
  away: number;
  homeDisplay?: string;
  awayDisplay?: string;
  max?: number;
  detail?: string;
  edge?: string;
  /** When true, lower values win the edge chip color. */
  lowerIsBetter?: boolean;
}) {
  const span = max ?? Math.max(Math.abs(home), Math.abs(away), 0.01);
  const homeW = Math.min(100, (Math.abs(home) / span) * 100);
  const awayW = Math.min(100, (Math.abs(away) / span) * 100);
  const homeLeads = lowerIsBetter ? home < away : home > away;
  const tied = Math.abs(home - away) < 1e-6;

  return (
    <div className="border-b border-glass-border/50 py-2.5 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-wide text-foreground">
            {label}
          </p>
          {detail ? <p className="type-meta truncate">{detail}</p> : null}
        </div>
        {edge && !tied ? (
          <span
            className={`shrink-0 text-[10px] font-semibold tabular-nums ${
              homeLeads ? "text-primary" : "text-accent"
            }`}
          >
            {edge}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
        <span className="font-semibold text-primary">
          {homeDisplay ?? home.toFixed(1)}
        </span>
        <span className="font-semibold text-accent">
          {awayDisplay ?? away.toFixed(1)}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-foreground/10">
          <div
            className="h-full rounded-l-full bg-primary"
            style={{ width: `${homeW}%` }}
          />
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-r-full bg-foreground/10">
          <div
            className="h-full rounded-r-full bg-accent"
            style={{ width: `${awayW}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function MetricStrip({
  items,
  columns = 6,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    hint?: string;
    accent?: "primary" | "accent" | "neutral";
  }>;
  columns?: 3 | 4 | 6;
}) {
  const colClass =
    columns === 3
      ? "grid-cols-3"
      : columns === 4
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6";

  return (
    <div className={`grid gap-x-4 gap-y-3 ${colClass}`}>
      {items.map((item) => {
        const color =
          item.accent === "primary"
            ? "text-primary"
            : item.accent === "accent"
              ? "text-accent"
              : "text-foreground";
        return (
          <div key={item.label} className="min-w-0">
            <p className="type-meta truncate">{item.label}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>
              {item.value}
            </p>
            {item.hint ? (
              <p className="type-meta mt-0.5 truncate">{item.hint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const DATA_TABLE_CLASS =
  "w-full text-sm [&_th]:border-b [&_th]:border-glass-border [&_th]:py-2 [&_th]:type-meta [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_td]:border-b [&_td]:border-glass-border/50 [&_td]:py-2 [&_td]:tabular-nums";

export function DataTable({
  children,
  className = "",
  minWidth,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className="table-h-scroll">
      <table
        className={`${DATA_TABLE_CLASS} ${className}`}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

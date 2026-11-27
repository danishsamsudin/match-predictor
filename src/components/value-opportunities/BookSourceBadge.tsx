"use client";

import type { OddsBookSource } from "@/lib/odds-api/types";

const SOURCE_STYLES: Record<
  OddsBookSource,
  { label: string; className: string }
> = {
  pinnacle: {
    label: "Pinnacle",
    className:
      "bg-slate-800/90 text-slate-50 ring-slate-600/40 dark:bg-slate-200 dark:text-slate-900 dark:ring-slate-400/30",
  },
  unibet: {
    label: "Unibet",
    className:
      "bg-emerald-600/90 text-white ring-emerald-500/35 dark:bg-emerald-500/25 dark:text-emerald-200 dark:ring-emerald-400/30",
  },
  upload: {
    label: "Uploaded",
    className:
      "bg-indigo-600/90 text-white ring-indigo-500/35 dark:bg-indigo-500/25 dark:text-indigo-200 dark:ring-indigo-400/30",
  },
};

/** Badge showing the bookmaker with full platform name. */
export function BookSourceBadge({
  source,
  unibetPreferred,
  labelOverride,
}: {
  source: OddsBookSource | null | undefined;
  /** When true, Unibet beat Pinnacle on this selection. */
  unibetPreferred?: boolean;
  /** Detected company name from uploaded HTML/MHTML (e.g. Unibet). */
  labelOverride?: string | null;
}) {
  if (!source) return null;
  const style = SOURCE_STYLES[source];
  const label =
    (labelOverride?.trim() || null) ??
    (source === "upload" ? "Uploaded" : style.label);
  const title =
    source === "upload"
      ? `Filled from uploaded ${label} page (session only - not stored)`
      : source === "unibet" && unibetPreferred
        ? "Unibet longer than Pinnacle - using Unibet"
        : source === "pinnacle"
          ? "Pinnacle (preferred unless Unibet is longer)"
          : "Unibet";

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ring-inset ${style.className}`}
    >
      {label}
    </span>
  );
}

export function OddsSourceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
      <span className="font-medium text-foreground/80">Book source</span>
      <span className="inline-flex items-center gap-1">
        <BookSourceBadge source="pinnacle" />
        <span>(default)</span>
      </span>
      <span className="text-muted/50">·</span>
      <span className="inline-flex items-center gap-1">
        <BookSourceBadge source="unibet" unibetPreferred />
        <span>when longer</span>
      </span>
    </div>
  );
}

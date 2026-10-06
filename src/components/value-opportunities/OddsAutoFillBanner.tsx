"use client";

import type { OddsAutoFillState } from "@/components/value-opportunities/useOddsAutoFill";
import { OddsSourceLegend } from "@/components/value-opportunities/BookSourceBadge";

export function OddsAutoFillBanner({ state }: { state: OddsAutoFillState }) {
  const { status, result, error, refresh } = state;

  if (status === "idle") return null;

  const tone =
    status === "ready"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : status === "loading"
        ? "border-glass-border bg-surface/60"
        : "border-amber-500/35 bg-amber-500/5";

  return (
    <div className={`mb-3 space-y-2 rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-foreground/90">
          {status === "loading"
            ? "Pulling Pinnacle / Unibet odds…"
            : status === "ready"
              ? `Auto-filled from ${result?.homeTeam ?? "home"} vs ${result?.awayTeam ?? "away"}${
                  result?.fromCache ? " (cached)" : ""
                }.`
              : status === "empty"
                ? (error ?? "No book prices matched this fixture yet.")
                : (error ?? "Could not load odds.")}
        </p>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-foreground ring-1 ring-inset ring-glass-border transition hover:bg-surface"
        >
          Refresh odds
        </button>
      </div>
      {status === "ready" ? <OddsSourceLegend /> : null}
      {status === "ready" && result?.requestsRemaining != null ? (
        <p className="text-[10px] text-muted">
          Odds API credits left this month: {result.requestsRemaining}
          {result.creditsUsedThisCall > 0
            ? ` · this load used ${result.creditsUsedThisCall}`
            : " · this load used 0 (cache)"}
        </p>
      ) : null}
    </div>
  );
}

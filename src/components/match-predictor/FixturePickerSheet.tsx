"use client";

import type { FixtureOption } from "@/lib/types/football-lookup";
import { formatFixtureKickoffLocal } from "@/lib/utils/kickoff-display";
import { SheetOverlay } from "./SheetOverlay";

export function FixturePickerSheet({
  open,
  onClose,
  fixtures,
  selectedFixtureId,
  loading,
  onSelect,
  tournamentName,
}: {
  open: boolean;
  onClose: () => void;
  fixtures: FixtureOption[];
  selectedFixtureId: string;
  loading?: boolean;
  onSelect: (fixtureId: string) => void;
  tournamentName?: string;
}) {
  const title = tournamentName
    ? `Upcoming ${tournamentName} matches`
    : "Upcoming matches";

  return (
    <SheetOverlay open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading fixtures">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-700/50"
              />
            ))}
          </div>
        ) : fixtures.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No upcoming matches for this tournament yet. Try another tournament or
            switch to Compare.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" role="listbox">
            {fixtures.map((fixture) => {
              const id = String(fixture.id);
              const selected = id === selectedFixtureId;
              const kickoff = formatFixtureKickoffLocal(fixture.date);
              const meta = [kickoff, fixture.venueCity?.trim()].filter(Boolean).join(" · ");
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onSelect(id);
                      onClose();
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-indigo-400 bg-indigo-50/80 dark:border-cyan-500/60 dark:bg-cyan-950/40"
                        : "border-slate-200/80 bg-white/50 hover:border-slate-300 hover:bg-white/80 dark:border-slate-700/70 dark:bg-slate-900/40 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {fixture.home.name} vs {fixture.away.name}
                    </span>
                    {meta ? (
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        {meta}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SheetOverlay>
  );
}

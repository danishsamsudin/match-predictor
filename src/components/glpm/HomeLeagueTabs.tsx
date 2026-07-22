"use client";

export type HomeLeagueTab = {
  id: string;
  label: string;
};

export function HomeLeagueTabs({
  leagues,
  activeId,
  onSelect,
  ariaLabel,
}: {
  leagues: HomeLeagueTab[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {leagues.map((league) => {
        const active = league.id === activeId;
        return (
          <button
            key={league.id}
            type="button"
            role="tab"
            aria-selected={active}
            id={`league-tab-${ariaLabel.replace(/\s+/g, "-").toLowerCase()}-${league.id}`}
            onClick={() => onSelect(league.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              active
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "border border-glass-border bg-surface/70 text-slate-600 hover:bg-surface dark:text-slate-300"
            }`}
          >
            {league.label}
          </button>
        );
      })}
    </div>
  );
}

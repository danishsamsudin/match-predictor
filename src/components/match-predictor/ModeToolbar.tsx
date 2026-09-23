"use client";

import type { EntityType, LeagueOption } from "@/lib/types/football-lookup";
import { Tooltip } from "@/components/ui/Tooltip";

const ENTITY_TIPS = {
  club: (
    <>
      Pick <strong>club</strong> teams from GLPM competitions (Premier League, Eredivisie, etc.).
      Forecasts use the seven-dimensional rating vector, interaction xG, and Dixon-Coles markets.
    </>
  ),
  national: (
    <>
      Pick <strong>national</strong> teams for international tournaments. Choose a tournament
      below (defaults to <strong>UEFA Nations League</strong>), then use{" "}
      <strong>Fixture</strong> to pick an upcoming match or <strong>Compare</strong> any two
      sides.
    </>
  ),
} as const;

const MODE_TIPS = {
  fixture: {
    national: (
      <>
        <strong>Fixture</strong> loads upcoming matches for the selected tournament. Pick a
        match to fill both nations, kickoff, venue, and suggested XIs automatically.
      </>
    ),
    club: (
      <>
        <strong>Fixture</strong> mode is reserved for scheduled club flows. Club forecasts use
        GLPM <strong>Compare</strong> with ingested rating vectors.
      </>
    ),
  },
  compare: {
    national: (
      <>
        <strong>Compare</strong> any two nations in the selected tournament without needing a
        scheduled fixture.
      </>
    ),
    club: (
      <>
        <strong>Compare</strong> any two clubs that have GLPM rating vectors for the selected
        season. No scheduled fixture is required.
      </>
    ),
  },
} as const;

const TOURNAMENT_TIP = (
  <>
    Sets the competition for both nations. <strong>Nations League</strong> is the active cycle;{" "}
    <strong>World Cup</strong> remains available for archived 2026 finals matchups.
  </>
);

type SegmentOption = {
  label: string;
  value: string;
  tip: React.ReactNode;
  disabled?: boolean;
};

function shortTournamentLabel(name: string): string {
  if (/nations league/i.test(name)) return "Nations League";
  if (/world cup/i.test(name)) return "World Cup";
  if (/euro/i.test(name)) return "Euro";
  if (/copa/i.test(name)) return "Copa América";
  return name;
}

function SlidingSegmentGroup({
  label,
  options,
  value,
  onSelect,
  compact,
}: {
  label: string;
  options: readonly SegmentOption[];
  value: string;
  onSelect: (value: string) => void;
  compact?: boolean;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const count = options.length;

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div
        className="liquid-glass-pill relative flex w-full items-center rounded-full p-1"
        role="group"
        aria-label={label}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-slate-950 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-white"
          style={{
            width: `calc((100% - 0.5rem) / ${count})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Tooltip
              key={option.value}
              label={option.label}
              content={option.tip}
              side="bottom"
              clickToPin={false}
            >
              <button
                type="button"
                disabled={option.disabled}
                aria-pressed={active}
                onClick={() => onSelect(option.value)}
                className={`relative z-10 min-h-10 flex-1 rounded-full text-center font-semibold transition-colors duration-300 ${
                  compact ? "px-2 py-2 text-xs sm:px-3 sm:text-sm" : "px-3.5 py-2 text-sm"
                } ${
                  active
                    ? "text-white dark:text-slate-950"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400`}
              >
                {option.label}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export function ModeToolbar({
  entityType,
  onEntityTypeChange,
  inputMode,
  onInputModeChange,
  nationalTournaments,
  nationalTournamentId,
  onNationalTournamentChange,
}: {
  entityType: EntityType;
  onEntityTypeChange: (v: EntityType) => void;
  inputMode: "fixture" | "compare";
  onInputModeChange: (v: "fixture" | "compare") => void;
  nationalTournaments?: LeagueOption[];
  nationalTournamentId?: string;
  onNationalTournamentChange?: (leagueId: string) => void;
}) {
  const fixtureDisabled = entityType === "club";
  const modeKey = entityType === "national" ? "national" : "club";

  const showTournament =
    entityType === "national" &&
    Boolean(nationalTournaments?.length) &&
    Boolean(onNationalTournamentChange);

  const tournamentOptions: SegmentOption[] = (nationalTournaments ?? []).map((league) => ({
    label: shortTournamentLabel(league.name),
    value: String(league.id),
    tip: (
      <>
        {TOURNAMENT_TIP} Selected: <strong>{league.name}</strong>.
      </>
    ),
  }));

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <SlidingSegmentGroup
          label="Teams"
          value={entityType}
          onSelect={(v) => onEntityTypeChange(v as EntityType)}
          options={[
            { label: "Clubs", value: "club", tip: ENTITY_TIPS.club },
            { label: "National", value: "national", tip: ENTITY_TIPS.national },
          ]}
        />

        <SlidingSegmentGroup
          label="Mode"
          value={inputMode}
          onSelect={(v) => onInputModeChange(v as "fixture" | "compare")}
          options={[
            {
              label: "Fixture",
              value: "fixture",
              tip: MODE_TIPS.fixture[modeKey],
              disabled: fixtureDisabled,
            },
            { label: "Compare", value: "compare", tip: MODE_TIPS.compare[modeKey] },
          ]}
        />
      </div>

      {showTournament && nationalTournamentId ? (
        <SlidingSegmentGroup
          label="Tournament"
          value={nationalTournamentId}
          onSelect={onNationalTournamentChange!}
          options={tournamentOptions}
          compact={tournamentOptions.length > 2}
        />
      ) : null}
    </div>
  );
}

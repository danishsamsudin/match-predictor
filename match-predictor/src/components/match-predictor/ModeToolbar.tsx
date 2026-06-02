"use client";

import type { EntityType } from "@/lib/types/football-lookup";
import { Tooltip } from "@/components/ui/Tooltip";

const ENTITY_TIPS = {
  club: (
    <>
      Pick <strong>club</strong> teams from domestic leagues (Premier League, La Liga, etc.). Use
      the team badges below to choose home and away sides.
    </>
  ),
  national: (
    <>
      Pick <strong>national</strong> teams for international tournaments (World Cup, Euros, Nations
      League). Fixture mode is not available for national sides.
    </>
  ),
} as const;

const MODE_TIPS = {
  fixture: (
    <>
      <strong>Fixture</strong> mode uses a real upcoming match from our database. Choose both clubs,
      then use &quot;Find a match&quot; to load kickoff, venue, and synced stats. Only available
      for club teams when fixtures exist in the selected league.
    </>
  ),
  compare: (
    <>
      <strong>Compare</strong> mode builds a hypothetical match between any two clubs (even across
      leagues). No scheduled fixture is required - set location, date, and time yourself.
    </>
  ),
} as const;

function Segment({
  label,
  value,
  current,
  onSelect,
  disabled,
  tip,
}: {
  label: string;
  value: string;
  current: string;
  onSelect: (v: string) => void;
  disabled?: boolean;
  tip: React.ReactNode;
}) {
  const active = current === value;

  return (
    <Tooltip label={label} content={tip} side="bottom" clickToPin={false}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(value)}
        className={`min-h-9 flex-1 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide transition-colors sm:text-sm ${
          active
            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            : "text-slate-600 hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-800/80"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {label}
      </button>
    </Tooltip>
  );
}

export function ModeToolbar({
  entityType,
  onEntityTypeChange,
  inputMode,
  onInputModeChange,
}: {
  entityType: EntityType;
  onEntityTypeChange: (v: EntityType) => void;
  inputMode: "fixture" | "compare";
  onInputModeChange: (v: "fixture" | "compare") => void;
}) {
  const fixtureTip =
    entityType === "national" ? (
      <>
        <strong>Fixture</strong> is disabled for national teams. Switch to <strong>Clubs</strong> or
        use <strong>Compare</strong> for international sides.
      </>
    ) : (
      MODE_TIPS.fixture
    );

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
      <div
        className="flex w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/80"
        role="group"
        aria-label="Team type"
      >
        <Segment
          label="Clubs"
          value="club"
          current={entityType}
          onSelect={(v) => onEntityTypeChange(v as EntityType)}
          tip={ENTITY_TIPS.club}
        />
        <Segment
          label="National"
          value="national"
          current={entityType}
          onSelect={(v) => onEntityTypeChange(v as EntityType)}
          tip={ENTITY_TIPS.national}
        />
      </div>

      <div
        className="flex w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/80"
        role="group"
        aria-label="Input mode"
      >
        <Segment
          label="Fixture"
          value="fixture"
          current={inputMode}
          onSelect={(v) => onInputModeChange(v as "fixture" | "compare")}
          disabled={entityType === "national"}
          tip={fixtureTip}
        />
        <Segment
          label="Compare"
          value="compare"
          current={inputMode}
          onSelect={(v) => onInputModeChange(v as "fixture" | "compare")}
          tip={MODE_TIPS.compare}
        />
      </div>
    </div>
  );
}

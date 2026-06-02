"use client";

import type { EntityType } from "@/lib/types/football-lookup";

function Segment({
  label,
  value,
  current,
  onSelect,
  disabled,
}: {
  label: string;
  value: string;
  current: string;
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  const active = current === value;
  return (
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
        />
        <Segment
          label="National"
          value="national"
          current={entityType}
          onSelect={(v) => onEntityTypeChange(v as EntityType)}
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
        />
        <Segment
          label="Compare"
          value="compare"
          current={inputMode}
          onSelect={(v) => onInputModeChange(v as "fixture" | "compare")}
        />
      </div>
    </div>
  );
}

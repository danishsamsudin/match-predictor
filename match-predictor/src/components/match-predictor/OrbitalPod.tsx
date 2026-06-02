"use client";

import type { EntityType, TeamOption } from "@/lib/types/football-lookup";
import { TeamBadge } from "./TeamBadge";

export function OrbitalPod({
  side,
  team,
  country,
  competition,
  entityType,
  onClick,
  accent = "home",
}: {
  side: "Home" | "Away";
  team?: TeamOption;
  country: string;
  competition?: string;
  entityType?: EntityType;
  onClick: () => void;
  accent?: "home" | "away";
}) {
  const label = team?.name ?? `Select ${side.toLowerCase()}`;
  const meta = [competition, country].filter(Boolean).join(" · ");

  const ringBorder =
    accent === "home"
      ? "border-slate-200 dark:border-cyan-500/40"
      : "border-slate-200 dark:border-purple-500/40";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center sm:flex-none sm:w-auto">
      <button
        type="button"
        onClick={onClick}
        aria-label={`Select ${side.toLowerCase()} team: ${label}`}
        className="orbital-pod group relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28 md:h-32 md:w-32"
      >
        <div
          className={`orbital-pod-ring relative flex h-full w-full items-center justify-center rounded-full border-2 bg-white p-3 dark:bg-slate-950 ${ringBorder}`}
        >
          <TeamBadge team={team} entityType={entityType} accent={accent} />
        </div>
      </button>
      <span className="mt-2 max-w-[7.5rem] truncate text-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 sm:max-w-[9rem] sm:text-xs">
        {label}
      </span>
      {meta ? (
        <span className="mt-0.5 max-w-[8rem] truncate text-center text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:max-w-[10rem]">
          {meta}
        </span>
      ) : null}
      <span className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-600">
        {side}
      </span>
    </div>
  );
}

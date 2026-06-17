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
  logoOnly = false,
}: {
  side: "Home" | "Away";
  team?: TeamOption;
  country?: string;
  competition?: string;
  entityType?: EntityType;
  onClick: () => void;
  accent?: "home" | "away";
  /** Logo badge only — name and league render in MatchTeamsSection. */
  logoOnly?: boolean;
}) {
  const label = team?.name ?? `Select ${side.toLowerCase()}`;
  const meta = [competition, country].filter(Boolean).join(" · ");

  const ringBorder =
    accent === "home"
      ? "border-slate-200 dark:border-cyan-500/40"
      : "border-slate-200 dark:border-purple-500/40";

  return (
    <div className="flex min-w-0 flex-col items-center">
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
      {!logoOnly ? (
        <>
          <span className="mt-2 w-full max-w-[14rem] break-words px-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 sm:max-w-[18rem] sm:text-sm">
            {label}
          </span>
          {meta ? (
            <span className="mt-1 w-full max-w-[14rem] break-words px-2 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:max-w-[18rem]">
              {meta}
            </span>
          ) : null}
          <span className="mt-1 text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-600">
            {side}
          </span>
        </>
      ) : null}
    </div>
  );
}

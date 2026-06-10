"use client";

import { useMemo } from "react";
import { SheetSelect } from "./SheetOverlay";
import type { SquadPlayer } from "@/lib/types/team-comparison";
import { isXiComplete, xiHasGoalkeeper } from "@/lib/prediction/build-custom-lineup";

const XI_SLOT_COUNT = 11;
const EMPTY_SLOTS: (number | null)[] = Array(XI_SLOT_COUNT).fill(null);

export type SquadRosterData = {
  teamId: number;
  teamName: string;
  preferredFormation: string | null;
  roster: SquadPlayer[];
  suggestedStarters: SquadPlayer[];
};

function playerOptionLabel(player: SquadPlayer): string {
  const score =
    player.performanceScore != null && player.performanceScore > 0
      ? ` · ${player.performanceScore}`
      : "";
  return `${player.name} (${player.position})${score}`;
}

function hasDuplicateSelections(slots: (number | null)[]): boolean {
  const ids = slots.filter((id): id is number => id != null);
  return new Set(ids).size !== ids.length;
}

function XiColumn({
  label,
  roster,
  slots,
  onSlotChange,
  disabled,
}: {
  label: string;
  roster: SquadPlayer[];
  slots: (number | null)[];
  onSlotChange: (index: number, playerId: number | null) => void;
  disabled?: boolean;
}) {
  const allOptions = useMemo(
    () =>
      roster.map((p) => ({
        value: String(p.sofascorePlayerId),
        label: playerOptionLabel(p),
      })),
    [roster]
  );

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      <ol className="mt-3 space-y-2">
        {slots.map((selectedId, index) => {
          return (
            <li key={index}>
              <SheetSelect
                label={`Player ${index + 1}`}
                value={selectedId != null ? String(selectedId) : ""}
                onChange={(v) =>
                  onSlotChange(index, v ? Number(v) : null)
                }
                options={allOptions}
                disabled={disabled || roster.length === 0}
                placeholder="Select player"
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function slotsFromSuggestedStarters(starters: SquadPlayer[]): (number | null)[] {
  const slots = [...EMPTY_SLOTS];
  for (let i = 0; i < Math.min(XI_SLOT_COUNT, starters.length); i++) {
    slots[i] = starters[i].sofascorePlayerId;
  }
  return slots;
}

export function SquadXiPicker({
  homeLabel,
  awayLabel,
  homeRoster,
  awayRoster,
  homeXiSlots,
  awayXiSlots,
  onHomeXiChange,
  onAwayXiChange,
  loading,
  error,
  lineupSource = "manual_xi",
}: {
  homeLabel: string;
  awayLabel: string;
  homeRoster: SquadRosterData | null;
  awayRoster: SquadRosterData | null;
  homeXiSlots: (number | null)[];
  awayXiSlots: (number | null)[];
  onHomeXiChange: (slots: (number | null)[]) => void;
  onAwayXiChange: (slots: (number | null)[]) => void;
  loading?: boolean;
  error?: string | null;
  lineupSource?: "manual_xi" | "model_xi";
}) {
  const homeComplete = homeRoster ? isXiComplete(homeXiSlots) : false;
  const awayComplete = awayRoster ? isXiComplete(awayXiSlots) : false;
  const homeDuplicateWarning = hasDuplicateSelections(homeXiSlots);
  const awayDuplicateWarning = hasDuplicateSelections(awayXiSlots);
  const homeGkWarning =
    homeRoster && homeComplete && !xiHasGoalkeeper(homeXiSlots, homeRoster.roster);
  const awayGkWarning =
    awayRoster && awayComplete && !xiHasGoalkeeper(awayXiSlots, awayRoster.roster);

  const handleHomeSlot = (index: number, playerId: number | null) => {
    const next = [...homeXiSlots];
    next[index] = playerId;
    onHomeXiChange(next);
  };

  const handleAwaySlot = (index: number, playerId: number | null) => {
    const next = [...awayXiSlots];
    next[index] = playerId;
    onAwayXiChange(next);
  };

  return (
    <div
      className={`rounded-2xl border border-white/30 bg-white/30 p-4 dark:border-slate-800/60 dark:bg-slate-900/30 sm:p-5 ${
        lineupSource === "model_xi" ? "opacity-75" : ""
      }`}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Select starting XI
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {lineupSource === "manual_xi"
            ? "Choose 11 players per team — prediction uses player-xG from your selection."
            : "Optional while using model squad mode — manual XI is ignored for this run."}
        </p>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3 animate-pulse">
          <div className="h-10 rounded-xl bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="h-10 rounded-xl bg-slate-200/60 dark:bg-slate-700/40" />
          <div className="h-10 rounded-xl bg-slate-200/60 dark:bg-slate-700/40" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <XiColumn
            label={homeLabel}
            roster={homeRoster?.roster ?? []}
            slots={homeXiSlots}
            onSlotChange={handleHomeSlot}
            disabled={!homeRoster}
          />
          <XiColumn
            label={awayLabel}
            roster={awayRoster?.roster ?? []}
            slots={awayXiSlots}
            onSlotChange={handleAwaySlot}
            disabled={!awayRoster}
          />
        </div>
      )}

      {!loading && !error ? (
        <div className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400">
          {!homeComplete || !awayComplete ? (
            lineupSource === "manual_xi" ? (
              <p>Complete both starting XIs (11 unique players each) to enable prediction.</p>
            ) : null
          ) : null}
          {homeDuplicateWarning ? (
            <p className="text-amber-600 dark:text-amber-400">
              {homeLabel}: the same player is selected in more than one slot.
            </p>
          ) : null}
          {awayDuplicateWarning ? (
            <p className="text-amber-600 dark:text-amber-400">
              {awayLabel}: the same player is selected in more than one slot.
            </p>
          ) : null}
          {homeGkWarning ? (
            <p className="text-amber-600 dark:text-amber-400">
              {homeLabel}: no goalkeeper selected in the starting XI.
            </p>
          ) : null}
          {awayGkWarning ? (
            <p className="text-amber-600 dark:text-amber-400">
              {awayLabel}: no goalkeeper selected in the starting XI.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

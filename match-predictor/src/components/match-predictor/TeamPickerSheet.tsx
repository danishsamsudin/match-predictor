"use client";

import type {
  CountryOption,
  EntityType,
  LeagueOption,
  TeamOption,
} from "@/lib/types/football-lookup";
import { isWorldCupLeague } from "@/lib/data/world-cup-2026-teams";
import { SheetOverlay, SheetSelect } from "./SheetOverlay";

export function TeamPickerSheet({
  open,
  onClose,
  side,
  entityType,
  country,
  leagueId,
  teamId,
  countries,
  leagues,
  teams,
  onCountryChange,
  onLeagueChange,
  onTeamChange,
  disabled,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  side: "Home" | "Away";
  entityType: EntityType;
  country: string;
  leagueId: string;
  teamId: string;
  countries: CountryOption[];
  leagues: LeagueOption[];
  teams: TeamOption[];
  onCountryChange: (v: string) => void;
  onLeagueChange: (v: string) => void;
  onTeamChange: (v: string) => void;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const isNational = entityType === "national";
  const worldCupSelected = isWorldCupLeague(Number(leagueId));

  return (
    <SheetOverlay
      open={open}
      onClose={onClose}
      title={`Select ${side.toLowerCase()} ${isNational ? "nation" : "team"}`}
    >
      <div className="space-y-4">
        {!isNational && (
          <SheetSelect
            label="Country"
            value={country}
            onChange={onCountryChange}
            disabled={disabled}
            options={countries.map((c) => ({ value: c.name, label: c.name }))}
            placeholder="Country"
          />
        )}
        <SheetSelect
          label={isNational ? "Tournament" : "Competition"}
          value={leagueId}
          onChange={onLeagueChange}
          disabled={!leagues.length}
          options={leagues.map((l) => ({ value: String(l.id), label: l.name }))}
          placeholder={isNational ? "Tournament" : "Competition"}
        />
        <SheetSelect
          label={isNational ? "National team" : "Team"}
          value={teamId}
          onChange={onTeamChange}
          disabled={!teams.length}
          options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
          placeholder={
            isNational
              ? worldCupSelected
                ? "World Cup nation"
                : "National team"
              : "Team"
          }
        />
        <button
          type="button"
          onClick={() => {
            onDone?.();
            onClose();
          }}
          className="chromatic-cta mt-2 w-full rounded-full bg-slate-950 py-3 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-950"
        >
          Done
        </button>
      </div>
    </SheetOverlay>
  );
}

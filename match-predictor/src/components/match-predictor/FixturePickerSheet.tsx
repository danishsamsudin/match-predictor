"use client";

import type { CountryOption, FixtureOption, LeagueOption } from "@/lib/types/football-lookup";
import { formatFixtureLabel } from "./utils";
import { SheetOverlay, SheetSelect } from "./SheetOverlay";

export function FixturePickerSheet({
  open,
  onClose,
  matchCountry,
  matchLeagueId,
  matchLeagues,
  countries,
  fixtures,
  selectedFixtureId,
  loadingFixtures,
  loadingCountries,
  onCountryChange,
  onLeagueChange,
  onFixtureSelect,
}: {
  open: boolean;
  onClose: () => void;
  matchCountry: string;
  matchLeagueId: string;
  matchLeagues: LeagueOption[];
  countries: CountryOption[];
  fixtures: FixtureOption[];
  selectedFixtureId: string;
  loadingFixtures: boolean;
  loadingCountries: boolean;
  onCountryChange: (v: string) => void;
  onLeagueChange: (v: string) => void;
  onFixtureSelect: (fixtureId: string) => void;
}) {
  return (
    <SheetOverlay open={open} onClose={onClose} title="Find a match">
      <div className="space-y-4">
        <SheetSelect
          label="Country"
          value={matchCountry}
          onChange={onCountryChange}
          disabled={loadingCountries}
          options={countries.map((c) => ({ value: c.name, label: c.name }))}
        />
        <SheetSelect
          label="Competition"
          value={matchLeagueId}
          onChange={onLeagueChange}
          disabled={!matchLeagues.length}
          options={matchLeagues.map((l) => ({ value: String(l.id), label: l.name }))}
        />
        <SheetSelect
          label="Upcoming match"
          value={selectedFixtureId}
          onChange={(id) => {
            onFixtureSelect(id);
            onClose();
          }}
          disabled={loadingFixtures || !fixtures.length}
          options={fixtures.map((f) => ({
            value: String(f.id),
            label: formatFixtureLabel(f),
          }))}
          placeholder={loadingFixtures ? "Loading matches…" : "Select a match"}
        />
      </div>
    </SheetOverlay>
  );
}

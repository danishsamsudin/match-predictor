"use client";

import { useMemo, useState } from "react";
import { PredictionResultCard } from "./PredictionResult";
import { FixturePickerSheet } from "./match-predictor/FixturePickerSheet";
import { MatchPredictorShell } from "./match-predictor/MatchPredictorShell";
import { SystemBanner } from "./match-predictor/SystemBanner";
import { TeamPickerSheet } from "./match-predictor/TeamPickerSheet";
import { sanitizeUserFacingMessage } from "@/lib/api/user-facing-messages";
import { usePredictionForm } from "./match-predictor/usePredictionForm";

export function PredictionForm() {
  const form = usePredictionForm();
  const [homeSheetOpen, setHomeSheetOpen] = useState(false);
  const [awaySheetOpen, setAwaySheetOpen] = useState(false);
  const [fixtureSheetOpen, setFixtureSheetOpen] = useState(false);

  const bannerItems = useMemo(() => {
    const items: Array<{
      id: string;
      variant: "warning" | "info";
      message: React.ReactNode;
    }> = [];

    const fixtureNotice = sanitizeUserFacingMessage(form.fixtureNotice);
    if (fixtureNotice) {
      items.push({
        id: "fixture-notice",
        variant: "info",
        message: fixtureNotice,
      });
    }

    const error = sanitizeUserFacingMessage(form.error);
    if (error) {
      items.push({
        id: "error",
        variant: "warning",
        message: error,
      });
    }

    return items;
  }, [form.fixtureNotice, form.error]);

  const showFixturePicker =
    form.inputMode === "fixture" && form.entityType === "club";

  return (
    <div className="w-full space-y-0">
      <MatchPredictorShell
        entityType={form.entityType}
        setEntityType={form.setEntityType}
        inputMode={form.inputMode}
        setInputMode={form.setInputMode}
        homeTeam={form.homeTeam}
        awayTeam={form.awayTeam}
        homeCountry={form.homeCountry}
        awayCountry={form.awayCountry}
        homeLeagueName={form.homeLeagueName}
        awayLeagueName={form.awayLeagueName}
        bridgeCompetition={form.bridgeCompetition}
        homeTeamName={form.homeTeamName}
        awayTeamName={form.awayTeamName}
        fixtures={form.fixtures}
        selectedFixtureId={form.selectedFixtureId}
        city={form.city}
        setCity={form.setCity}
        date={form.date}
        setDate={form.setDate}
        time={form.time}
        setTime={form.setTime}
        loading={form.loading}
        submitDisabled={form.submitDisabled}
        handleSubmit={form.handleSubmit}
        onHomePodClick={() => setHomeSheetOpen(true)}
        onAwayPodClick={() => setAwaySheetOpen(true)}
        onOpenFixture={showFixturePicker ? () => setFixtureSheetOpen(true) : undefined}
      >
        <input type="hidden" name="matchId" value={form.matchId} />
        <input type="hidden" name="homeTeamId" value={form.homeTeamId} />
        <input type="hidden" name="awayTeamId" value={form.awayTeamId} />
      </MatchPredictorShell>

      <SystemBanner items={bannerItems} />

      <TeamPickerSheet
        open={homeSheetOpen}
        onClose={() => setHomeSheetOpen(false)}
        side="Home"
        country={form.homeCountry}
        leagueId={form.homeLeagueId}
        teamId={form.homeTeamId}
        countries={form.countries}
        leagues={form.homeLeagues}
        teams={form.homeTeams}
        onCountryChange={form.setHomeCountry}
        onLeagueChange={form.setHomeLeagueId}
        onTeamChange={form.handleHomeTeamChange}
        disabled={form.loadingCountries}
      />

      <TeamPickerSheet
        open={awaySheetOpen}
        onClose={() => setAwaySheetOpen(false)}
        side="Away"
        country={form.awayCountry}
        leagueId={form.awayLeagueId}
        teamId={form.awayTeamId}
        countries={form.countries}
        leagues={form.awayLeagues}
        teams={form.awayTeams}
        onCountryChange={form.setAwayCountry}
        onLeagueChange={form.setAwayLeagueId}
        onTeamChange={form.handleAwayTeamChange}
        disabled={form.loadingCountries}
      />

      {showFixturePicker && (
        <FixturePickerSheet
          open={fixtureSheetOpen}
          onClose={() => setFixtureSheetOpen(false)}
          matchCountry={form.matchCountry}
          matchLeagueId={form.matchLeagueId}
          matchLeagues={form.matchLeagues}
          countries={form.countries}
          fixtures={form.fixtures}
          selectedFixtureId={form.selectedFixtureId}
          loadingFixtures={form.loadingFixtures}
          loadingCountries={form.loadingCountries}
          onCountryChange={form.setMatchCountry}
          onLeagueChange={form.setMatchLeagueId}
          onFixtureSelect={form.handleFixtureChange}
        />
      )}

      {form.loading && !form.result && (
        <div className="liquid-glass-panel mx-auto mt-8 max-w-6xl animate-pulse rounded-[2rem] p-8">
          <div className="mb-4 h-6 w-48 rounded bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="mb-2 h-4 w-full rounded bg-slate-200/60 dark:bg-slate-700/40" />
          <div className="h-4 w-3/4 rounded bg-slate-200/60 dark:bg-slate-700/40" />
        </div>
      )}

      {form.result && (
        <div className="mx-auto mt-8 max-w-6xl">
          <PredictionResultCard result={form.result} />
        </div>
      )}
    </div>
  );
}

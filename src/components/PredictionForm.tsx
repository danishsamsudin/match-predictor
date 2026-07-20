"use client";

import { Suspense, useState } from "react";
import { DualPredictionResults } from "./match-predictor/DualPredictionResults";
import { MatchPredictorShell } from "./match-predictor/MatchPredictorShell";
import { SquadXiPicker } from "./match-predictor/SquadXiPicker";
import { TeamPickerSheet } from "./match-predictor/TeamPickerSheet";
import { usePredictionForm } from "./match-predictor/usePredictionForm";
import { GlpmClubPredictor } from "./glpm/GlpmClubPredictor";

function PredictionFormInner() {
  const form = usePredictionForm();
  const [homeSheetOpen, setHomeSheetOpen] = useState(false);
  const [awaySheetOpen, setAwaySheetOpen] = useState(false);

  if (form.entityType === "club") {
    return (
      <GlpmClubPredictor
        entityType={form.entityType}
        onEntityTypeChange={form.setEntityType}
      />
    );
  }

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
        lineupSource={form.lineupSource}
        setLineupSource={form.setLineupSource}
        onHomePodClick={() => setHomeSheetOpen(true)}
        onAwayPodClick={() => setAwaySheetOpen(true)}
        squadXiSection={
          form.showXiPicker ? (
            <SquadXiPicker
              homeLabel={form.homeTeamName ?? "Home"}
              awayLabel={form.awayTeamName ?? "Away"}
              homeRoster={form.homeRosterData}
              awayRoster={form.awayRosterData}
              homeXiSlots={form.homeXiSlots}
              awayXiSlots={form.awayXiSlots}
              onHomeXiChange={form.setHomeXiSlots}
              onAwayXiChange={form.setAwayXiSlots}
              loading={form.rosterLoading}
              error={form.rosterError}
              lineupSource={form.lineupSource}
            />
          ) : null
        }
      >
        <input type="hidden" name="matchId" value={form.matchId} />
        <input type="hidden" name="homeTeamId" value={form.homeTeamId} />
        <input type="hidden" name="awayTeamId" value={form.awayTeamId} />
      </MatchPredictorShell>

      <TeamPickerSheet
        open={homeSheetOpen}
        onClose={() => setHomeSheetOpen(false)}
        side="Home"
        entityType={form.entityType}
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
        entityType={form.entityType}
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

      {form.loading && !form.result && Object.keys(form.resultsBySource).length === 0 && (
        <div className="liquid-glass-panel mx-auto mt-8 max-w-6xl animate-pulse rounded-[2rem] p-8">
          <div className="mb-4 h-6 w-48 rounded bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="mb-2 h-4 w-full rounded bg-slate-200/60 dark:bg-slate-700/40" />
          <div className="h-4 w-3/4 rounded bg-slate-200/60 dark:bg-slate-700/40" />
        </div>
      )}

      {(form.result || Object.keys(form.resultsBySource).length > 0) && (
        <div className="mx-auto mt-8 w-full min-w-0 max-w-6xl">
          <DualPredictionResults
            resultsBySource={form.resultsBySource}
            onRerunWithLineups={form.rerunWithCustomLineups}
            loading={form.loading}
            matchKey={`${form.homeTeamId}-${form.awayTeamId}-${form.date}`}
          />
        </div>
      )}
    </div>
  );
}

export function PredictionForm() {
  return (
    <Suspense
      fallback={
        <div className="liquid-glass-panel mx-auto w-full max-w-6xl animate-pulse rounded-[2rem] p-8">
          <div className="mb-4 h-6 w-48 rounded bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="h-4 w-full rounded bg-slate-200/60 dark:bg-slate-700/40" />
        </div>
      }
    >
      <PredictionFormInner />
    </Suspense>
  );
}

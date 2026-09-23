"use client";

import { FooterPill } from "./FooterPill";
import { HeroSection } from "./HeroSection";
import { MatchTeamsSection } from "./MatchTeamsSection";
import { ModeToolbar } from "./ModeToolbar";
import { PageHero } from "./PageHero";
import type { PredictionFormState } from "./usePredictionForm";
import { formatFixtureLabel } from "./utils";
import { isNationsLeagueLeague } from "@/lib/data/nations-league-2026-teams";

type ShellProps = Pick<
  PredictionFormState,
  | "entityType"
  | "setEntityType"
  | "inputMode"
  | "setInputMode"
  | "homeTeam"
  | "awayTeam"
  | "homeCountry"
  | "awayCountry"
  | "homeLeagueName"
  | "awayLeagueName"
  | "bridgeCompetition"
  | "homeTeamName"
  | "awayTeamName"
  | "fixtures"
  | "selectedFixtureId"
  | "city"
  | "setCity"
  | "date"
  | "setDate"
  | "time"
  | "setTime"
  | "loading"
  | "submitDisabled"
  | "handleSubmit"
  | "lineupSource"
  | "setLineupSource"
  | "homeLeagues"
  | "homeLeagueId"
  | "handleNationalTournamentChange"
> & {
  onHomePodClick: () => void;
  onAwayPodClick: () => void;
  onOpenFixture?: () => void;
  squadXiSection?: React.ReactNode;
  children?: React.ReactNode;
};

export function MatchPredictorShell({
  entityType,
  setEntityType,
  inputMode,
  setInputMode,
  homeTeam,
  awayTeam,
  homeCountry,
  awayCountry,
  homeLeagueName,
  awayLeagueName,
  bridgeCompetition,
  homeTeamName,
  awayTeamName,
  fixtures,
  selectedFixtureId,
  city,
  setCity,
  date,
  setDate,
  time,
  setTime,
  loading,
  submitDisabled,
  handleSubmit,
  lineupSource,
  setLineupSource,
  homeLeagues,
  homeLeagueId,
  handleNationalTournamentChange,
  onHomePodClick,
  onAwayPodClick,
  onOpenFixture,
  squadXiSection,
  children,
}: ShellProps) {
  const selectedFixture = fixtures.find((f) => String(f.id) === selectedFixtureId);
  const fixtureSummary = selectedFixture ? formatFixtureLabel(selectedFixture) : undefined;
  const showFixture = inputMode === "fixture" && entityType === "national";
  const citySuggestions = Array.from(
    new Set(fixtures.map((f) => (f.venueCity ?? "").trim()).filter(Boolean))
  ).slice(0, 50);
  const nationsLeagueShell = isNationsLeagueLeague(Number(homeLeagueId));

  const toolbar = (
    <ModeToolbar
      entityType={entityType}
      onEntityTypeChange={setEntityType}
      inputMode={inputMode}
      onInputModeChange={setInputMode}
      nationalTournaments={entityType === "national" ? homeLeagues : undefined}
      nationalTournamentId={entityType === "national" ? homeLeagueId : undefined}
      onNationalTournamentChange={
        entityType === "national" ? handleNationalTournamentChange : undefined
      }
    />
  );

  const teamsSection = (
    <MatchTeamsSection
      competition={bridgeCompetition}
      homeName={homeTeamName}
      awayName={awayTeamName}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homeLeagueName={homeLeagueName}
      awayLeagueName={awayLeagueName}
      entityType={entityType}
      showFixtureAction={showFixture}
      onOpenFixture={onOpenFixture}
      fixtureSummary={fixtureSummary}
      onHomePodClick={onHomePodClick}
      onAwayPodClick={onAwayPodClick}
    />
  );

  const footer = (
    <FooterPill
      city={city}
      onCityChange={setCity}
      date={date}
      onDateChange={setDate}
      time={time}
      onTimeChange={setTime}
      loading={loading}
      submitDisabled={submitDisabled}
      citySuggestions={citySuggestions}
      lineupSource={lineupSource}
      onLineupSourceChange={setLineupSource}
      entityType={entityType}
    />
  );

  if (nationsLeagueShell) {
    return (
      <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-6">
        <div className="mx-auto max-w-6xl px-0">
          <PageHero
            eyebrow="UEFA Nations League"
            title="National matchup"
            description="Pick a Nations League fixture or compare any two nations. Forecasts use the Graham model with form, ratings, and club-style market boards."
          />
        </div>

        <div className="liquid-glass-panel mx-auto min-w-0 max-w-6xl space-y-5 overflow-visible rounded-2xl p-4 sm:rounded-[2rem] sm:p-6">
          {toolbar}
          <p className="text-xs text-muted">
            National sides use the Graham stack for Nations League. Choose Fixture to load an
            upcoming match, or Compare any two teams in the tournament.
          </p>
          {teamsSection}
          {squadXiSection}
          {footer}
        </div>
        {children}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0">
      <div className="liquid-glass-panel relative w-full min-w-0 overflow-visible rounded-2xl p-4 transition-all duration-500 sm:rounded-[2rem] sm:p-8 lg:rounded-[2.5rem] lg:p-10">
        <div className="relative z-10 flex flex-col gap-7 lg:gap-10">
          <HeroSection />

          <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
            {toolbar}
            {teamsSection}
            {squadXiSection}
          </div>

          {footer}
        </div>
      </div>
      {children}
    </form>
  );
}

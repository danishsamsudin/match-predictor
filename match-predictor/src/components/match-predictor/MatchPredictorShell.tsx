"use client";

import { FooterPill } from "./FooterPill";
import { HeroSection } from "./HeroSection";
import { MatchTeamsSection } from "./MatchTeamsSection";
import { ModeToolbar } from "./ModeToolbar";
import type { PredictionFormState } from "./usePredictionForm";
import { formatFixtureLabel } from "./utils";

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
  onHomePodClick,
  onAwayPodClick,
  onOpenFixture,
  squadXiSection,
  children,
}: ShellProps) {
  const selectedFixture = fixtures.find((f) => String(f.id) === selectedFixtureId);
  const fixtureSummary = selectedFixture ? formatFixtureLabel(selectedFixture) : undefined;
  const showFixture = inputMode === "fixture" && entityType === "club";
  const citySuggestions = Array.from(
    new Set(fixtures.map((f) => (f.venueCity ?? "").trim()).filter(Boolean))
  ).slice(0, 50);

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0">
      <div className="liquid-glass-panel relative w-full min-w-0 overflow-visible rounded-2xl p-4 transition-all duration-500 sm:rounded-[2rem] sm:p-8 lg:rounded-[2.5rem] lg:p-10">
        <div className="relative z-10 flex flex-col gap-7 lg:gap-10">
          <HeroSection />

          <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
            <ModeToolbar
              entityType={entityType}
              onEntityTypeChange={setEntityType}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
            />

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

            {squadXiSection}
          </div>

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
          />
        </div>
      </div>
      {children}
    </form>
  );
}

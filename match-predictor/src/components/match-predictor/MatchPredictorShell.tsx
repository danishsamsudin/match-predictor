"use client";

import { FooterPill } from "./FooterPill";
import { HeroSection } from "./HeroSection";
import { MatchBridge } from "./MatchBridge";
import { ModeToolbar } from "./ModeToolbar";
import { OrbitalPod } from "./OrbitalPod";
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
> & {
  onHomePodClick: () => void;
  onAwayPodClick: () => void;
  onOpenFixture?: () => void;
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
  onHomePodClick,
  onAwayPodClick,
  onOpenFixture,
  children,
}: ShellProps) {
  const selectedFixture = fixtures.find((f) => String(f.id) === selectedFixtureId);
  const fixtureSummary = selectedFixture ? formatFixtureLabel(selectedFixture) : undefined;
  const showFixture = inputMode === "fixture" && entityType === "club";

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0">
      <div className="liquid-glass-panel relative w-full min-w-0 overflow-hidden rounded-2xl p-4 transition-all duration-500 sm:rounded-[2rem] sm:p-8 lg:rounded-[2.5rem] lg:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:gap-8">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
            <HeroSection />

            <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
              <ModeToolbar
                entityType={entityType}
                onEntityTypeChange={setEntityType}
                inputMode={inputMode}
                onInputModeChange={setInputMode}
              />

              <div className="min-w-0">
                <div className="mb-4 lg:hidden">
                  <MatchBridge
                    competition={bridgeCompetition}
                    homeName={homeTeamName}
                    awayName={awayTeamName}
                    showFixtureAction={showFixture}
                    onOpenFixture={onOpenFixture}
                    fixtureSummary={fixtureSummary}
                    compact
                  />
                </div>

                <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-4 md:gap-8">
                  <OrbitalPod
                    side="Home"
                    team={homeTeam}
                    country={homeCountry}
                    competition={homeLeagueName}
                    entityType={entityType}
                    onClick={onHomePodClick}
                    accent="home"
                  />

                  <div className="hidden min-w-0 shrink px-1 lg:block lg:px-2">
                    <MatchBridge
                      competition={bridgeCompetition}
                      homeName={homeTeamName}
                      awayName={awayTeamName}
                      showFixtureAction={showFixture}
                      onOpenFixture={onOpenFixture}
                      fixtureSummary={fixtureSummary}
                    />
                  </div>

                  <OrbitalPod
                    side="Away"
                    team={awayTeam}
                    country={awayCountry}
                    competition={awayLeagueName}
                    entityType={entityType}
                    onClick={onAwayPodClick}
                    accent="away"
                  />
                </div>

                <div className="mt-4 hidden sm:block lg:hidden">
                  <MatchBridge
                    competition={bridgeCompetition}
                    homeName={homeTeamName}
                    awayName={awayTeamName}
                    showFixtureAction={showFixture}
                    onOpenFixture={onOpenFixture}
                    fixtureSummary={fixtureSummary}
                  />
                </div>
              </div>
            </div>
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
          />
        </div>
      </div>
      {children}
    </form>
  );
}

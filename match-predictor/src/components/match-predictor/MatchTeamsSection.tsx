"use client";

import type { EntityType, TeamOption } from "@/lib/types/football-lookup";
import { MatchBridge } from "./MatchBridge";
import { OrbitalPod } from "./OrbitalPod";

export function MatchTeamsSection({
  competition,
  homeName,
  awayName,
  homeTeam,
  awayTeam,
  homeLeagueName,
  awayLeagueName,
  entityType,
  showFixtureAction,
  onOpenFixture,
  fixtureSummary,
  onHomePodClick,
  onAwayPodClick,
}: {
  competition?: string;
  homeName?: string;
  awayName?: string;
  homeTeam?: TeamOption;
  awayTeam?: TeamOption;
  homeLeagueName?: string;
  awayLeagueName?: string;
  entityType: EntityType;
  showFixtureAction?: boolean;
  onOpenFixture?: () => void;
  fixtureSummary?: string;
  onHomePodClick: () => void;
  onAwayPodClick: () => void;
}) {
  const showPerTeamLeague =
    homeLeagueName &&
    awayLeagueName &&
    homeLeagueName !== awayLeagueName &&
    homeLeagueName !== competition &&
    awayLeagueName !== competition;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8">
      <MatchBridge
        competition={competition}
        showFixtureAction={showFixtureAction}
        onOpenFixture={onOpenFixture}
        fixtureSummary={fixtureSummary}
        leagueOnly
      />

      <div
        className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-6 sm:max-w-4xl sm:gap-10 md:gap-16 lg:gap-20"
        aria-label="Select teams"
      >
        <TeamPodColumn
          side="Home"
          team={homeTeam}
          name={homeName ?? "Home"}
          league={showPerTeamLeague ? homeLeagueName : undefined}
          entityType={entityType}
          onClick={onHomePodClick}
          accent="home"
        />

        <span
          className="self-center pt-8 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 sm:pt-10"
          aria-hidden
        >
          vs
        </span>

        <TeamPodColumn
          side="Away"
          team={awayTeam}
          name={awayName ?? "Away"}
          league={showPerTeamLeague ? awayLeagueName : undefined}
          entityType={entityType}
          onClick={onAwayPodClick}
          accent="away"
        />
      </div>
    </div>
  );
}

function TeamPodColumn({
  side,
  team,
  name,
  league,
  entityType,
  onClick,
  accent,
}: {
  side: "Home" | "Away";
  team?: TeamOption;
  name: string;
  league?: string;
  entityType: EntityType;
  onClick: () => void;
  accent: "home" | "away";
}) {
  const sideColor =
    accent === "home"
      ? "text-indigo-600 dark:text-cyan-400"
      : "text-violet-600 dark:text-fuchsia-400";

  return (
    <div className="flex min-w-0 flex-col items-center px-1 text-center sm:px-2">
      <OrbitalPod
        side={side}
        team={team}
        entityType={entityType}
        onClick={onClick}
        accent={accent}
        logoOnly
      />
      <span className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        {side}
      </span>
      <p
        className={`mt-1.5 w-full max-w-[11rem] break-words text-sm font-bold leading-snug text-slate-800 dark:text-slate-100 sm:max-w-[13rem] sm:text-base md:max-w-[15rem] md:text-lg ${side === "Home" ? "" : ""}`}
      >
        {name}
      </p>
      {league ? (
        <p
          className={`mt-2 w-full max-w-[11rem] break-words text-[10px] font-medium uppercase leading-snug tracking-wide sm:max-w-[13rem] sm:text-xs md:max-w-[15rem] ${sideColor}`}
        >
          {league}
        </p>
      ) : null}
    </div>
  );
}

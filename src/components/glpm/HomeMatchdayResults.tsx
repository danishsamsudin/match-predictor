"use client";

import { useId, useState } from "react";
import { countryFlagUrl } from "@/lib/glpm/live-scores/league-meta";
import {
  formatScorerLabel,
  goalScorersFromTimeline,
  type GoalScorerLine,
} from "@/lib/glpm/live-scores/map-timeline";
import type { LiveScoreMatch } from "@/lib/glpm/live-scores/types";
import { formatCalendarDateLongLocal } from "@/lib/utils/kickoff-display";
import { TimelineEventIcon } from "./live-scores/TimelineEventIcon";
import { PredictedVsActualPanel } from "./PredictedVsActualPanel";

function MiniCrest({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local + SportMonks CDN logos
      <img
        src={logoUrl}
        alt=""
        width={size === "sm" ? 32 : 40}
        height={size === "sm" ? 32 : 40}
        className={`${box} shrink-0 object-contain`}
      />
    );
  }
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-full border border-glass-border bg-surface/80 text-[10px] font-bold text-muted`}
      aria-hidden
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function LeagueFlag({ iso }: { iso: string }) {
  if (!iso) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote flag CDN
    <img
      src={countryFlagUrl(iso)}
      alt=""
      width={20}
      height={14}
      className="h-3.5 w-5 rounded-sm object-cover shadow-sm"
    />
  );
}

function ScorerColumn({
  lines,
  align,
}: {
  lines: GoalScorerLine[];
  align: "left" | "right";
}) {
  if (lines.length === 0) {
    return <div className={align === "right" ? "text-right" : undefined} />;
  }
  const isRight = align === "right";
  return (
    <ul className="space-y-1">
      {lines.map((line) => (
        <li
          key={`${line.side}-${line.clockLabel}-${line.playerName}-${line.kind}`}
          className={`flex items-start gap-1.5 text-[11px] leading-snug text-foreground ${
            isRight ? "flex-row-reverse text-right" : ""
          }`}
        >
          <TimelineEventIcon kind={line.kind} size="sm" />
          <span>{formatScorerLabel(line)}</span>
        </li>
      ))}
    </ul>
  );
}

function FinishedMatchSummary({ match }: { match: LiveScoreMatch }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const scorers = goalScorersFromTimeline(match.timeline);
  const homeScorers = scorers.filter((line) => line.side === "home");
  const awayScorers = scorers.filter((line) => line.side === "away");
  const goalless = match.homeScore === 0 && match.awayScore === 0;

  return (
    <article
      className="rounded-2xl border border-glass-border bg-surface/50 px-3.5 py-3 sm:px-4"
      aria-label={`${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}, ${match.statusLabel}`}
    >
      <button
        type="button"
        className="w-full text-left"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((v) => !v)}
      >
        <header className="mb-2 flex items-center justify-center gap-1.5">
          <LeagueFlag iso={match.countryIso} />
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
            {match.leagueName}
          </p>
          <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {match.statusLabel}
          </span>
        </header>

        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <p className="truncate text-right text-sm font-semibold text-foreground">
              {match.homeTeamName}
            </p>
            <MiniCrest name={match.homeTeamName} logoUrl={match.homeLogoUrl} />
          </div>
          <p className="shrink-0 font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">
            {match.homeScore}
            <span className="mx-1 text-muted">-</span>
            {match.awayScore}
          </p>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MiniCrest name={match.awayTeamName} logoUrl={match.awayLogoUrl} />
            <p className="truncate text-sm font-semibold text-foreground">{match.awayTeamName}</p>
          </div>
        </div>

        <div className="mt-2 border-t border-glass-border/70 pt-2">
          {goalless && scorers.length === 0 ? (
            <p className="text-center text-[11px] text-muted">No goals</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ScorerColumn lines={homeScorers} align="left" />
              <ScorerColumn lines={awayScorers} align="right" />
            </div>
          )}
        </div>

        <span className="mt-3 inline-flex w-full items-center justify-center">
          <span className="rounded-full border border-glass-border bg-surface px-3.5 py-1.5 text-[11px] font-semibold text-foreground shadow-sm">
            {open ? "Hide prediction vs outcome" : "Compare prediction vs outcome"}
          </span>
        </span>
      </button>

      {open ? (
        <div id={detailsId} className="mt-3 border-t border-glass-border/70 pt-3">
          <PredictedVsActualPanel match={match} />
        </div>
      ) : null}
    </article>
  );
}

function YesterdayScoreChip({
  match,
  selected,
  onSelect,
}: {
  match: LiveScoreMatch;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`h-full w-full rounded-2xl border px-3 py-3 text-left transition ${
        selected
          ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
          : "border-glass-border bg-surface/50 hover:bg-surface/80"
      }`}
      aria-label={`${match.leagueName}: ${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}. Compare prediction vs outcome.`}
    >
      <p className="flex items-center justify-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
        <LeagueFlag iso={match.countryIso} />
        <span className="truncate">{match.leagueName}</span>
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <MiniCrest name={match.homeTeamName} logoUrl={match.homeLogoUrl} size="sm" />
        <p className="font-mono text-lg font-bold tabular-nums text-foreground">
          {match.homeScore}
          <span className="mx-0.5 text-muted">-</span>
          {match.awayScore}
        </p>
        <MiniCrest name={match.awayTeamName} logoUrl={match.awayLogoUrl} size="sm" />
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-semibold leading-snug text-foreground">
        {match.homeTeamName}
      </p>
      <p className="truncate text-center text-[11px] leading-snug text-muted">{match.awayTeamName}</p>
    </button>
  );
}

export function HomeMatchdayResults({
  finishedToday,
  yesterday,
  todayDate,
  yesterdayDate,
}: {
  finishedToday: LiveScoreMatch[];
  yesterday: LiveScoreMatch[];
  todayDate: string;
  yesterdayDate: string;
}) {
  const [selectedYesterdayId, setSelectedYesterdayId] = useState<number | null>(null);
  const selectedYesterday =
    yesterday.find((m) => m.matchSmId === selectedYesterdayId) ?? null;

  if (finishedToday.length === 0 && yesterday.length === 0) return null;

  return (
    <div className="mt-6 space-y-6 border-t border-glass-border/80 pt-5">
      <p className="text-xs text-muted">Tap a result to compare prediction vs outcome.</p>

      {finishedToday.length > 0 ? (
        <section aria-label="Today's finished matches">
          <div className="mb-3">
            <h3 className="text-base font-bold text-foreground">Today&apos;s results</h3>
            <p className="text-xs text-muted">{formatCalendarDateLongLocal(todayDate)}</p>
          </div>
          <div className="grid gap-2.5">
            {finishedToday.map((match) => (
              <FinishedMatchSummary key={match.matchSmId} match={match} />
            ))}
          </div>
        </section>
      ) : null}

      {yesterday.length > 0 ? (
        <section aria-label="Yesterday's scores">
          <div className="mb-3">
            <h3 className="text-base font-bold text-foreground">Yesterday</h3>
            <p className="text-xs text-muted">
              {formatCalendarDateLongLocal(yesterdayDate)} · scroll sideways
            </p>
          </div>
          <ul className="home-results-rail list-none">
            {yesterday.map((match) => (
              <li key={match.matchSmId} className="home-results-rail-card">
                <YesterdayScoreChip
                  match={match}
                  selected={selectedYesterdayId === match.matchSmId}
                  onSelect={() =>
                    setSelectedYesterdayId((cur) =>
                      cur === match.matchSmId ? null : match.matchSmId
                    )
                  }
                />
              </li>
            ))}
          </ul>
          {selectedYesterday ? (
            <div className="mt-3 rounded-2xl border border-glass-border bg-surface/50 px-3.5 py-3 sm:px-4">
              <PredictedVsActualPanel match={selectedYesterday} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

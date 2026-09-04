"use client";

import { useId, useState } from "react";
import { countryFlagUrl } from "@/lib/glpm/live-scores/league-meta";
import { isGoalLikeKind, type LiveTimelineKind } from "@/lib/glpm/live-scores/event-types";
import { timelineKindLabel } from "@/lib/glpm/live-scores/map-timeline";
import type {
  LiveScoreMatch,
  LiveScoreSideMetrics,
  LiveScoreTimelineEvent,
  LiveScoresBoardPayload,
} from "@/lib/glpm/live-scores/types";
import { HomeMatchdayResults } from "./HomeMatchdayResults";

function TeamSide({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center sm:h-16 sm:w-16">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local + SportMonks CDN logos
          <img
            src={logoUrl}
            alt=""
            width={64}
            height={64}
            className="h-full w-full object-contain"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-full border border-glass-border bg-surface/80 text-xs font-bold text-muted"
            aria-hidden
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <p className="max-w-[9.5rem] text-center text-sm font-semibold leading-snug text-foreground sm:max-w-[11rem] sm:text-base">
        {name}
      </p>
    </div>
  );
}

function EventIcon({ kind }: { kind: LiveTimelineKind }) {
  const base = "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold";
  switch (kind) {
    case "goal":
    case "penalty":
    case "pen_shootout_goal":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-700 dark:text-emerald-300`} title="Goal">
          ⚽
        </span>
      );
    case "own_goal":
      return (
        <span className={`${base} bg-slate-500/20 text-slate-700 dark:text-slate-200`} title="Own goal">
          ⚽
        </span>
      );
    case "missed_penalty":
    case "pen_shootout_miss":
      return (
        <span className={`${base} bg-slate-500/15 text-muted`} title="Missed penalty">
          ○
        </span>
      );
    case "yellow_card":
      return (
        <span
          className="inline-block h-4 w-3 rounded-[2px] bg-amber-400 shadow-sm"
          title="Yellow card"
          aria-hidden
        />
      );
    case "red_card":
    case "yellow_red_card":
      return (
        <span
          className="inline-block h-4 w-3 rounded-[2px] bg-rose-600 shadow-sm"
          title="Red card"
          aria-hidden
        />
      );
    case "substitution":
      return (
        <span className={`${base} bg-sky-500/15 text-sky-700 dark:text-sky-300`} title="Substitution">
          ⇅
        </span>
      );
    case "var":
      return (
        <span className={`${base} bg-violet-500/15 text-violet-700 dark:text-violet-300`} title="VAR">
          VAR
        </span>
      );
  }
}

function eventPrimaryLabel(event: LiveScoreTimelineEvent): string {
  if (event.kind === "substitution") {
    const on = event.playerName ?? "Player on";
    const off = event.relatedPlayerName;
    return off ? `${on} ← ${off}` : on;
  }
  if (isGoalLikeKind(event.kind)) {
    const scorer = event.playerName ?? "Goal";
    if (event.kind === "own_goal") return `${scorer} (OG)`;
    if (event.kind === "penalty" || event.kind === "pen_shootout_goal") {
      return `${scorer} (Pen)`;
    }
    return scorer;
  }
  return event.playerName ?? timelineKindLabel(event.kind);
}

function eventSecondaryLabel(event: LiveScoreTimelineEvent): string | null {
  if (event.kind === "substitution") return null;
  if (isGoalLikeKind(event.kind) && event.relatedPlayerName) {
    return `Assist: ${event.relatedPlayerName}`;
  }
  if (event.info) return event.info;
  return null;
}

function MatchTimelineRail({
  events,
  minute,
  durationMinutes,
}: {
  events: LiveScoreTimelineEvent[];
  minute: number | null;
  durationMinutes: number;
}) {
  const scale = Math.max(90, durationMinutes || 90);
  const progress = minute == null ? 0 : Math.min(100, Math.max(0, (minute / scale) * 100));

  return (
    <div className="relative mx-auto w-[96%] sm:w-[98%]">
      <div className="relative h-8">
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-glass-border" />
        <div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-rose-500/70"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-500 bg-surface"
          style={{ left: `${progress}%` }}
          title={minute != null ? `${minute}'` : undefined}
        />

        {events.map((event, index) => {
          const pct = Math.min(98, Math.max(2, (event.minute / scale) * 100));
          const stack = events
            .slice(0, index)
            .filter((e) => Math.abs(e.minute - event.minute) < 2).length;
          const topOffset = stack > 0 ? -stack * 10 : 0;
          return (
            <div
              key={event.id}
              className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pct}%`, top: `calc(50% + ${topOffset}px)` }}
              title={`${event.clockLabel} ${eventPrimaryLabel(event)}`}
            >
              <EventIcon kind={event.kind} />
            </div>
          );
        })}
      </div>

      <div className="mt-0.5 flex justify-between text-[10px] font-medium text-muted">
        <span>0'</span>
        <span>HT</span>
        <span>{scale}'</span>
      </div>
    </div>
  );
}

function EventDetailsList({ events }: { events: LiveScoreTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-center text-xs text-muted">No key moments yet.</p>;
  }

  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {events.map((event) => {
        const secondary = eventSecondaryLabel(event);
        const alignHome = event.side === "home";
        return (
          <li
            key={event.id}
            className={`flex items-start gap-2 rounded-xl border border-glass-border/80 bg-surface/40 px-2.5 py-1.5 ${
              alignHome ? "" : "sm:flex-row-reverse sm:text-right"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              <EventIcon kind={event.kind} />
            </span>
            <div className={`min-w-0 flex-1 ${alignHome ? "" : "sm:text-right"}`}>
              <p className="truncate text-xs font-semibold text-foreground">
                <span className="tabular-nums text-muted">{event.clockLabel}</span>
                <span className="mx-1.5 text-muted">·</span>
                {eventPrimaryLabel(event)}
              </p>
              {secondary ? <p className="truncate text-[11px] text-muted">{secondary}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function formatMetric(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

function LiveMetricsStrip({
  home,
  away,
}: {
  home: LiveScoreSideMetrics;
  away: LiveScoreSideMetrics;
}) {
  const rows: Array<{ label: string; home: string; away: string }> = [
    {
      label: "Possession",
      home: home.possessionPct != null ? `${formatMetric(home.possessionPct)}%` : "-",
      away: away.possessionPct != null ? `${formatMetric(away.possessionPct)}%` : "-",
    },
    {
      label: "Shots (SoT)",
      home: `${formatMetric(home.shots)} (${formatMetric(home.shotsOnTarget)})`,
      away: `${formatMetric(away.shots)} (${formatMetric(away.shotsOnTarget)})`,
    },
    {
      label: "Corners",
      home: formatMetric(home.corners),
      away: formatMetric(away.corners),
    },
    {
      label: "xG",
      home: formatMetric(home.xg, 2),
      away: formatMetric(away.xg, 2),
    },
  ];

  const hasAny = [home, away].some(
    (m) =>
      m.possessionPct != null ||
      m.shots != null ||
      m.shotsOnTarget != null ||
      m.corners != null ||
      m.xg != null
  );
  if (!hasAny) return null;

  return (
    <div>
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
        Live match stats
      </p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs"
          >
            <span className="text-right font-semibold tabular-nums text-foreground">{row.home}</span>
            <span className="min-w-[5.5rem] text-center text-[11px] text-muted">{row.label}</span>
            <span className="text-left font-semibold tabular-nums text-foreground">{row.away}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveScoreCard({ match }: { match: LiveScoreMatch }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const flagSrc = match.countryIso ? countryFlagUrl(match.countryIso) : null;
  const clock =
    match.minute != null
      ? `${match.statusLabel} · ${match.minute}'`
      : match.statusLabel;

  const momentCount = match.timeline.length;
  const expandLabel = expanded
    ? "Hide details"
    : momentCount > 0
      ? `Show details · ${momentCount} moment${momentCount === 1 ? "" : "s"}`
      : "Show details";

  return (
    <article
      className="rounded-2xl border border-glass-border bg-surface/50 px-4 py-4 sm:px-6 sm:py-5"
      aria-label={`${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}`}
    >
      <header className="flex items-center justify-center gap-2">
        {flagSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote flag CDN
          <img
            src={flagSrc}
            alt=""
            width={28}
            height={18}
            className="h-[18px] w-7 rounded-sm object-cover shadow-sm"
          />
        ) : null}
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground sm:text-base">
          {match.leagueName}
        </h3>
      </header>

      <div className="mt-2 text-center">
        <p className="text-sm font-medium text-foreground sm:text-base">{match.stadiumName}</p>
        <p className="mt-0.5 text-xs text-muted sm:text-sm">{match.roundLabel}</p>
      </div>

      <div className="mt-4 flex items-center gap-2 sm:gap-4">
        <TeamSide name={match.homeTeamName} logoUrl={match.homeLogoUrl} />

        <div className="flex shrink-0 flex-col items-center gap-1 px-1">
          <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {match.homeScore}
            <span className="mx-1.5 text-muted sm:mx-2">-</span>
            {match.awayScore}
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            {clock}
          </span>
        </div>

        <TeamSide name={match.awayTeamName} logoUrl={match.awayLogoUrl} />
      </div>

      <div className="mt-4 w-full">
        <MatchTimelineRail
          events={match.timeline}
          minute={match.minute}
          durationMinutes={match.durationMinutes}
        />

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-surface/70 px-3.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((v) => !v)}
          >
            <span aria-hidden className="text-[10px] text-muted">
              {expanded ? "▴" : "▾"}
            </span>
            {expandLabel}
          </button>
        </div>

        {expanded ? (
          <div
            id={detailsId}
            className="mt-3 space-y-4 border-t border-glass-border/70 pt-3"
          >
            <EventDetailsList events={match.timeline} />
            <LiveMetricsStrip home={match.homeMetrics} away={match.awayMetrics} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function HomeLiveScoresPanel({ board }: { board: LiveScoresBoardPayload }) {
  const isPreview = board.source === "placeholder";
  const liveMatches = board.matches;
  const finishedToday = board.finishedToday ?? [];
  const yesterday = board.yesterday ?? [];
  const hasLive = liveMatches.length > 0;
  const hasResults = finishedToday.length > 0 || yesterday.length > 0;

  const intro = isPreview
    ? "Preview layout. Expand a live card for scorers, cards, and stats. Finished matches stay below."
    : hasLive
      ? "In-play fixtures with a live timeline. Finished matches from today stay below with scorers."
      : finishedToday.length > 0
        ? "No matches in play. Today's final scores are below, with scorers and times."
        : hasResults
          ? "No live matches right now. Yesterday's scores are below."
          : "No live matches right now. Check back around kickoff for scorers, cards, and live stats.";

  return (
    <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-foreground">Live Scores</h2>
        {isPreview ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Preview layout
          </span>
        ) : board.syncedAt ? (
          <span className="text-xs text-muted">
            Updated {new Date(board.syncedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted">{intro}</p>

      {hasLive ? (
        <div className="grid gap-3 sm:gap-4">
          {liveMatches.map((match) => (
            <LiveScoreCard key={match.matchSmId} match={match} />
          ))}
        </div>
      ) : hasResults ? null : (
        <p className="text-sm text-muted">No live matches at the moment.</p>
      )}

      <HomeMatchdayResults
        finishedToday={finishedToday}
        yesterday={yesterday}
        todayDate={board.todayDate}
        yesterdayDate={board.yesterdayDate}
      />
    </div>
  );
}

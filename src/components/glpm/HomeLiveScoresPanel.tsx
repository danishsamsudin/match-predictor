"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { countryFlagUrl } from "@/lib/glpm/live-scores/league-meta";
import { isGoalLikeKind, type LiveTimelineKind } from "@/lib/glpm/live-scores/event-types";
import { timelineKindLabel } from "@/lib/glpm/live-scores/map-timeline";
import type {
  LiveScoreMatch,
  LiveScoreSideMetrics,
  LiveScoreTimelineEvent,
  LiveScoresBoardPayload,
} from "@/lib/glpm/live-scores/types";
import { DISPLAY_LOCALE } from "@/lib/utils/kickoff-display";
import { HomeMatchdayResults } from "./HomeMatchdayResults";

const LIVE_POLL_MS = 60_000;

/** Fixed locale + 24h clock so SSR and client hydration match. */
function formatSyncedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(DISPLAY_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function TeamSide({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5">
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

function GoalGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="currentColor" opacity="0.12" />
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8 4.1 9.55 5.2 9.2 7H6.8l-.35-1.8L8 4.1Zm0 7.8-1.55-1.1.35-1.8h2.4l.35 1.8L8 11.9ZM4.35 6.35l1.7-.35L6.8 7.5 5.6 8.9l-1.55-.55.3-2Zm7.3 0-.3 2-1.55.55L8.6 7.5l.75-1.5 1.7.35ZM5.6 10.55l1.2-1.4h2.4l1.2 1.4-1.05 1.2H6.65L5.6 10.55Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SubGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        d="M4.5 3.5v5.2M4.5 3.5 2.8 5.2M4.5 3.5 6.2 5.2M11.5 12.5V7.3M11.5 12.5 9.8 10.8M11.5 12.5 13.2 10.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EventIcon({
  kind,
  onRail = false,
  count,
}: {
  kind: LiveTimelineKind;
  onRail?: boolean;
  /** When > 1, show a compact count badge (clustered same-minute events). */
  count?: number;
}) {
  const disc = onRail
    ? "relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10 dark:bg-slate-950 dark:ring-white/20"
    : "relative inline-flex h-5 w-5 items-center justify-center";

  let glyph: ReactNode;
  let title = "Event";

  switch (kind) {
    case "goal":
    case "penalty":
    case "pen_shootout_goal":
      title = "Goal";
      glyph = <GoalGlyph className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
      break;
    case "own_goal":
      title = "Own goal";
      glyph = <GoalGlyph className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />;
      break;
    case "missed_penalty":
    case "pen_shootout_miss":
      title = "Missed penalty";
      glyph = <span className="h-2.5 w-2.5 rounded-full border-2 border-muted" />;
      break;
    case "yellow_card":
      title = "Yellow card";
      glyph = <span className="h-3.5 w-2.5 rounded-[2px] bg-amber-400 shadow-sm" aria-hidden />;
      break;
    case "red_card":
    case "yellow_red_card":
      title = "Red card";
      glyph = <span className="h-3.5 w-2.5 rounded-[2px] bg-rose-600 shadow-sm" aria-hidden />;
      break;
    case "substitution":
      title = "Substitution";
      glyph = <SubGlyph className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />;
      break;
    case "var":
      title = "VAR";
      glyph = (
        <span className="text-[8px] font-bold tracking-wide text-violet-700 dark:text-violet-300">
          VAR
        </span>
      );
      break;
  }

  const badge = count != null && count > 1 ? count : null;
  const badgeTone =
    kind === "substitution"
      ? "bg-sky-600"
      : isGoalLikeKind(kind)
        ? "bg-emerald-600"
        : kind === "yellow_card"
          ? "bg-amber-500"
          : kind === "red_card" || kind === "yellow_red_card"
            ? "bg-rose-600"
            : "bg-slate-600";

  return (
    <span className={disc} title={badge ? `${badge}× ${title}` : title}>
      {glyph}
      {badge ? (
        <span
          className={`absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold leading-none text-white shadow-sm ring-1 ring-white dark:ring-slate-950 ${badgeTone}`}
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}

const RAIL_KIND_PRIORITY: LiveTimelineKind[] = [
  "goal",
  "penalty",
  "pen_shootout_goal",
  "own_goal",
  "red_card",
  "yellow_red_card",
  "yellow_card",
  "missed_penalty",
  "pen_shootout_miss",
  "var",
  "substitution",
];

function pickClusterKind(events: LiveScoreTimelineEvent[]): LiveTimelineKind {
  const kinds = new Set(events.map((e) => e.kind));
  if (kinds.size === 1) return events[0]!.kind;
  for (const kind of RAIL_KIND_PRIORITY) {
    if (kinds.has(kind)) return kind;
  }
  return events[0]!.kind;
}

type RailCluster = {
  id: string;
  minute: number;
  events: LiveScoreTimelineEvent[];
  kind: LiveTimelineKind;
};

/** Collapse events within ~1.5' into one rail marker so simultaneous subs do not stack. */
function clusterEventsForRail(events: LiveScoreTimelineEvent[]): RailCluster[] {
  const sorted = [...events].sort((a, b) => a.minute - b.minute || a.id - b.id);
  const clusters: RailCluster[] = [];

  for (const event of sorted) {
    const last = clusters.at(-1);
    if (last && Math.abs(event.minute - last.minute) < 1.5) {
      last.events.push(event);
      last.kind = pickClusterKind(last.events);
      continue;
    }
    clusters.push({
      id: `rail-${event.id}`,
      minute: event.minute,
      events: [event],
      kind: event.kind,
    });
  }

  return clusters;
}

function clusterTitle(cluster: RailCluster): string {
  if (cluster.events.length === 1) {
    const event = cluster.events[0]!;
    return `${event.clockLabel} ${eventMomentSummary(event)}`;
  }
  const labels = cluster.events.map((e) => eventMomentSummary(e)).join(", ");
  return `${cluster.events[0]!.clockLabel} · ${cluster.events.length} events: ${labels}`;
}

function eventMomentSummary(event: LiveScoreTimelineEvent): string {
  if (event.kind === "substitution") {
    return `Sub ${event.playerName ?? "Player on"}`;
  }
  if (isGoalLikeKind(event.kind)) {
    return event.playerName ?? "Goal";
  }
  return event.playerName ?? timelineKindLabel(event.kind);
}

type MomentBlock =
  | { type: "single"; event: LiveScoreTimelineEvent }
  | {
      type: "subs";
      id: string;
      side: LiveScoreTimelineEvent["side"];
      clockLabel: string;
      minute: number;
      swaps: LiveScoreTimelineEvent[];
    };

/** Group same-minute, same-side substitutions into one moments block. */
function buildMomentBlocks(events: LiveScoreTimelineEvent[]): MomentBlock[] {
  const blocks: MomentBlock[] = [];

  for (const event of events) {
    if (event.kind !== "substitution") {
      blocks.push({ type: "single", event });
      continue;
    }

    const last = blocks.at(-1);
    if (
      last?.type === "subs" &&
      last.side === event.side &&
      last.minute === event.minute
    ) {
      last.swaps.push(event);
      continue;
    }

    blocks.push({
      type: "subs",
      id: `subs-${event.id}`,
      side: event.side,
      clockLabel: event.clockLabel,
      minute: event.minute,
      swaps: [event],
    });
  }

  return blocks;
}

function SubSwapRows({
  swaps,
  alignEnd,
}: {
  swaps: LiveScoreTimelineEvent[];
  alignEnd: boolean;
}) {
  return (
    <ul className="mt-1.5 space-y-2">
      {swaps.map((swap) => {
        const on = swap.playerName ?? "Player on";
        const off = swap.relatedPlayerName;
        return (
          <li
            key={swap.id}
            className={`flex flex-col gap-0.5 ${alignEnd ? "items-end" : "items-start"}`}
          >
            <p
              className={`flex max-w-full items-center gap-1.5 text-sm font-medium text-foreground ${
                alignEnd ? "flex-row-reverse" : ""
              }`}
            >
              <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                In
              </span>
              <span className="truncate">{on}</span>
            </p>
            {off ? (
              <p
                className={`flex max-w-full items-center gap-1.5 text-[12px] text-muted ${
                  alignEnd ? "flex-row-reverse" : ""
                }`}
              >
                <span className="shrink-0 rounded bg-rose-500/12 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                  Out
                </span>
                <span className="truncate">{off}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function eventPrimaryLabel(event: LiveScoreTimelineEvent): string {
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
  const clusters = clusterEventsForRail(events);

  return (
    <div className="relative w-full px-1">
      <div className="relative flex h-10 items-center">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-glass-border" />
        <div
          className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-rose-500/80"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-500 bg-white dark:bg-slate-950"
          style={{ left: `${progress}%` }}
          title={minute != null ? `${minute}'` : undefined}
        />

        {clusters.map((cluster) => {
          const pct = Math.min(98, Math.max(2, (cluster.minute / scale) * 100));
          return (
            <div
              key={cluster.id}
              className="absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${pct}%`, top: "50%" }}
              title={clusterTitle(cluster)}
            >
              <EventIcon kind={cluster.kind} onRail count={cluster.events.length} />
            </div>
          );
        })}
      </div>

      <div className="mt-0.5 flex justify-between text-[10px] font-medium tabular-nums text-muted">
        <span>0'</span>
        <span>HT</span>
        <span>{scale}'</span>
      </div>
    </div>
  );
}

function EventDetailsList({ events }: { events: LiveScoreTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="py-2 text-center text-xs text-muted">No key moments yet.</p>;
  }

  const blocks = buildMomentBlocks(events);

  return (
    <ul className="divide-y divide-glass-border/70">
      {blocks.map((block) => {
        if (block.type === "subs") {
          const isAway = block.side === "away";
          const label =
            block.swaps.length === 1 ? "Substitution" : `${block.swaps.length} substitutions`;
          return (
            <li
              key={block.id}
              className={`flex items-start gap-3 py-2.5 ${isAway ? "flex-row-reverse text-right" : ""}`}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface/80 ring-1 ring-glass-border">
                <EventIcon kind="substitution" count={block.swaps.length} />
              </span>
              <div className={`min-w-0 flex-1 ${isAway ? "text-right" : ""}`}>
                <p className="text-sm font-medium text-foreground">
                  <span className="tabular-nums text-muted">{block.clockLabel}</span>
                  <span className="mx-1.5 text-muted-subtle">·</span>
                  {label}
                </p>
                <SubSwapRows swaps={block.swaps} alignEnd={isAway} />
              </div>
            </li>
          );
        }

        const { event } = block;
        const secondary = eventSecondaryLabel(event);
        const isAway = event.side === "away";
        return (
          <li
            key={event.id}
            className={`flex items-center gap-3 py-2.5 ${isAway ? "flex-row-reverse text-right" : ""}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface/80 ring-1 ring-glass-border">
              <EventIcon kind={event.kind} />
            </span>
            <div className={`min-w-0 flex-1 ${isAway ? "text-right" : ""}`}>
              <p className="truncate text-sm font-medium text-foreground">
                <span className="tabular-nums text-muted">{event.clockLabel}</span>
                <span className="mx-1.5 text-muted-subtle">·</span>
                {eventPrimaryLabel(event)}
              </p>
              {secondary ? (
                <p className="mt-0.5 truncate text-[11px] text-muted">{secondary}</p>
              ) : null}
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
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs"
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
  const momentCount = match.timeline.length;
  const [expanded, setExpanded] = useState(momentCount > 0);
  const detailsId = useId();
  const flagSrc = match.countryIso ? countryFlagUrl(match.countryIso) : null;
  const clock =
    match.minute != null
      ? `${match.statusLabel} · ${match.minute}'`
      : match.statusLabel;

  const expandLabel = expanded
    ? "Hide details"
    : momentCount > 0
      ? `Show details · ${momentCount} moment${momentCount === 1 ? "" : "s"}`
      : "Show details";

  return (
    <article
      className="rounded-2xl border border-glass-border bg-surface/50 px-4 py-5 sm:px-6 sm:py-6"
      aria-label={`${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}`}
    >
      <header className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center justify-center gap-2">
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
        </div>
        <p className="text-sm text-muted">
          {match.stadiumName}
          <span className="mx-1.5 text-muted-subtle">·</span>
          {match.roundLabel}
        </p>
      </header>

      <div className="mt-5 flex items-start gap-2 sm:gap-4">
        <TeamSide name={match.homeTeamName} logoUrl={match.homeLogoUrl} />

        <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-2 pt-1 sm:w-36">
          <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {match.homeScore}
            <span className="mx-1.5 text-muted sm:mx-2">-</span>
            {match.awayScore}
          </p>
          <span className="live-status-pill inline-flex max-w-full items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
            </span>
            <span className="truncate">{clock}</span>
          </span>
        </div>

        <TeamSide name={match.awayTeamName} logoUrl={match.awayLogoUrl} />
      </div>

      <div className="mt-5 w-full">
        <MatchTimelineRail
          events={match.timeline}
          minute={match.minute}
          durationMinutes={match.durationMinutes}
        />

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-hover hover:text-foreground"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((v) => !v)}
          >
            <span aria-hidden className="text-[10px]">
              {expanded ? "▴" : "▾"}
            </span>
            {expandLabel}
          </button>
        </div>

        {expanded ? (
          <div id={detailsId} className="mt-2 space-y-5 border-t border-glass-border/70 pt-3">
            <EventDetailsList events={match.timeline} />
            <LiveMetricsStrip home={match.homeMetrics} away={match.awayMetrics} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function useLiveScoresBoard(initialBoard: LiveScoresBoardPayload): LiveScoresBoardPayload {
  const [board, setBoard] = useState(initialBoard);

  useEffect(() => {
    setBoard(initialBoard);
  }, [initialBoard]);

  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/glpm/live-scores", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const next = (await res.json()) as LiveScoresBoardPayload;
        if (cancelled || !next || typeof next !== "object") return;
        setBoard(next);
      } catch {
        // Keep the last good board if the poll fails.
      }
    };

    const interval = window.setInterval(() => {
      void pull();
    }, LIVE_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return board;
}

export function HomeLiveScoresPanel({ board: initialBoard }: { board: LiveScoresBoardPayload }) {
  const board = useLiveScoresBoard(initialBoard);
  const isPreview = board.source === "placeholder";
  const liveMatches = board.matches;
  const finishedToday = board.finishedToday ?? [];
  const yesterday = board.yesterday ?? [];
  const hasLive = liveMatches.length > 0;
  const hasResults = finishedToday.length > 0 || yesterday.length > 0;

  const intro = isPreview
    ? "Preview layout. Expand a live card for scorers, cards, and stats. Tap a finished result below to compare prediction vs outcome."
    : hasLive
      ? "In-play fixtures with a live timeline. This board refreshes about every minute while the tab is open."
      : finishedToday.length > 0
        ? "No matches in play. Tap a finished result below to compare prediction vs outcome."
        : hasResults
          ? "No live matches right now. Tap a yesterday score below to compare prediction vs outcome."
          : "No live matches right now. Check back around kickoff for scorers, cards, and live stats.";

  return (
    <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold text-foreground">Live Scores</h2>
          {hasLive && !isPreview ? (
            <span className="live-status-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
              </span>
              Live
            </span>
          ) : null}
        </div>
        {isPreview ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Preview layout
          </span>
        ) : board.syncedAt ? (
          <span className="text-xs text-muted">Updated {formatSyncedAt(board.syncedAt)}</span>
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

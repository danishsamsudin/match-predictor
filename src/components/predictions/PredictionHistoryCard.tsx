import Link from "next/link";
import type { HistoryFeedItem } from "@/lib/prediction/load-history-feed";
import type { PredictionHistoryKind } from "@/lib/prediction/history-kind";
import { formatKickoffLocal } from "@/lib/utils/kickoff-display";
import { Calendar, Clock, MapPin } from "lucide-react";

const KIND_STYLES: Record<
  PredictionHistoryKind,
  { badge: string; dot: string }
> = {
  world_cup: {
    badge:
      "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  league_compare: {
    badge: "bg-indigo-500/15 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  league_fixture: {
    badge: "bg-slate-500/10 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  international: {
    badge: "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
    dot: "bg-amber-500",
  },
};

function OutcomeStat({
  value,
  className,
}: {
  value: number;
  className: string;
}) {
  return (
    <span
      className={`inline-flex min-w-[3.25rem] justify-center rounded-lg px-2 py-1 text-xs font-semibold tabular-nums sm:rounded-full sm:px-2.5 ${className}`}
    >
      {value}%
    </span>
  );
}

export function PredictionHistoryCard({ item }: { item: HistoryFeedItem }) {
  const styles = KIND_STYLES[item.kind.kind];
  const scoreLine =
    item.predictedScoreHome != null && item.predictedScoreAway != null
      ? `Score ${item.predictedScoreHome}–${item.predictedScoreAway}`
      : item.homeXg != null && item.awayXg != null
        ? `xG ${item.homeXg} – ${item.awayXg}`
        : null;

  return (
    <Link
      href={item.href}
      className="liquid-glass-pill group block rounded-2xl px-4 py-3.5 transition active:scale-[0.99] sm:rounded-2xl sm:px-5 sm:py-4"
    >
      <div className="flex flex-col gap-3 sm:gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-base font-bold leading-snug text-slate-900 dark:text-white sm:text-[1.05rem]">
            <span className="line-clamp-2 sm:line-clamp-none">
              {item.homeTeamName}{" "}
              <span className="font-medium text-slate-400">vs</span> {item.awayTeamName}
            </span>
          </p>
          <span
            className={`shrink-0 inline-flex max-w-[9.5rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles.badge}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
            <span className="truncate">{item.kind.label}</span>
          </span>
        </div>

        <div className="flex flex-col gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:text-sm">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate capitalize">{item.city}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Kickoff {formatKickoffLocal(item.matchDate)}
            </span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Predicted {formatKickoffLocal(item.predictedAt)}
            </span>
          </span>
          {item.fixtureLabel ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {item.fixtureLabel}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <OutcomeStat
            value={item.homeWinPct}
            className="bg-cyan-500/15 text-cyan-800 dark:text-cyan-300"
          />
          <OutcomeStat
            value={item.drawPct}
            className="bg-slate-500/10 text-slate-600 dark:text-slate-400"
          />
          <OutcomeStat
            value={item.awayWinPct}
            className="bg-violet-500/15 text-violet-800 dark:text-fuchsia-300"
          />
          {scoreLine ? (
            <span className="w-full pt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:ml-1 sm:w-auto sm:pt-0 sm:text-sm">
              {scoreLine}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { displayValue } from "@/lib/data/build-team-comparison";
import type { SquadPlayer, TeamComparisonSide, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import { TEAM_COMPARISON_GLOSSARY } from "@/lib/prediction/team-comparison-glossary";
import { InfoTip } from "./ui/InfoTip";

function performanceBadgeClass(score: number | null): string {
  if (score == null) return "bg-foreground/8 text-muted";
  if (score >= 75) return "bg-primary/15 text-primary-emphasis";
  if (score >= 55) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
}

function formatPerformance(score: number | null): string {
  if (score == null) return "—";
  return String(score);
}

function SquadPlayerRow({
  player,
  accent,
}: {
  player: SquadPlayer;
  accent: "primary" | "accent";
}) {
  const [open, setOpen] = useState(false);
  const accentText = accent === "primary" ? "text-primary" : "text-accent";

  return (
    <li className="rounded-lg border border-white/20 bg-white/20 dark:border-slate-800/50 dark:bg-slate-900/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{player.name}</p>
          <p className="text-[11px] text-muted">
            <span className={accentText}>{player.position}</span>
            {player.fieldPosition && player.fieldPosition !== player.position ? (
              <span className="text-muted"> · {player.fieldPosition}</span>
            ) : null}
            {player.startSharePct != null ? (
              <span className="text-muted"> · {player.startSharePct}% starts</span>
            ) : null}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${performanceBadgeClass(player.performanceScore)}`}
        >
          {formatPerformance(player.performanceScore)}
          <InfoTip label="Performance score">
            {TEAM_COMPARISON_GLOSSARY["Performance score"]}
          </InfoTip>
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/20 px-3 py-2 dark:border-slate-800/50">
          {player.age != null ? (
            <p className="mb-2 text-[11px] text-muted">Age {player.age}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
            {player.detailStats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-[10px] uppercase tracking-wide text-muted">{stat.label}</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </li>
  );
}

function SquadColumn({
  side,
  squad,
  accent,
}: {
  side: TeamComparisonSide;
  squad: TeamSquadSnapshot;
  accent: "primary" | "accent";
}) {
  const labelClass =
    accent === "primary"
      ? "text-xs font-medium uppercase tracking-wide text-primary"
      : "text-xs font-medium uppercase tracking-wide text-accent";

  if (squad.squadSource === "none") {
    return (
      <div>
        <p className={labelClass}>{side.teamName}</p>
        <p className="mt-2 text-sm text-muted">
          No squad data for this team. Import Scoutlyst CSVs for its league, or run lineup backfill
          after football sync.
        </p>
      </div>
    );
  }

  const sourceNote =
    squad.squadSource === "lineups"
      ? "XI from recent synced match lineups."
      : "XI estimated from Scoutlyst ratings (import lineups for match-based squads).";

  return (
    <div className="space-y-4">
      <div>
        <p className={labelClass}>{side.teamName}</p>
        {squad.snapshotDate ? (
          <p className="mt-0.5 text-[11px] text-muted">Scoutlyst snapshot {squad.snapshotDate}</p>
        ) : null}
        <p className="mt-0.5 text-[11px] text-muted">{sourceNote}</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {squad.squadSource === "lineups" ? "Usual starting XI" : "Expected starting XI"}
        </p>
        {squad.starters.length ? (
          <ul className="space-y-2">
            {squad.starters.map((player) => (
              <SquadPlayerRow
                key={player.sofascorePlayerId}
                player={player}
                accent={accent}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">N/A — no recent lineups synced.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Substitutes
        </p>
        {squad.substitutes.length ? (
          <ul className="space-y-2">
            {squad.substitutes.map((player) => (
              <SquadPlayerRow
                key={player.sofascorePlayerId}
                player={player}
                accent={accent}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{displayValue(null)}</p>
        )}
      </div>
    </div>
  );
}

export function TeamSquadComparison({
  home,
  away,
}: {
  home: TeamComparisonSide;
  away: TeamComparisonSide;
}) {
  const hasAnyData = home.squad.squadSource !== "none" || away.squad.squadSource !== "none";

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        Squad comparison
        <InfoTip label="Squad comparison">
          Usual starting XI and bench from recent synced match lineups. Performance score (0–100)
          uses Scoutlyst ratings when imported, otherwise recent match ratings. Tap a player for
          the same detail stats for everyone.
        </InfoTip>
      </h3>

      {hasAnyData ? (
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Starting XI is inferred from who started most often in recent finished matches.
          Performance combines Scoutlyst PPM and synced match ratings when available.
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <SquadColumn side={home} squad={home.squad} accent="primary" />
        <SquadColumn side={away} squad={away.squad} accent="accent" />
      </div>
    </div>
  );
}

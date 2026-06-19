"use client";

import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { TeamBettingInsightsPanel } from "@/components/TeamBettingInsightsPanel";
import { resolveTeamShortLabel } from "@/lib/utils/team-display-name";
import { displayValue } from "@/lib/data/team-comparison-utils";
import { formatCalendarDateLocal } from "@/lib/utils/kickoff-display";
import { TEAM_COMPARISON_GLOSSARY } from "@/lib/prediction/team-comparison-glossary";
import type {
  TeamComparisonSide,
  TeamComparisonSnapshot,
  TeamFormMatch,
  TeamSeasonStats,
} from "@/lib/types/team-comparison";
import { InfoTip } from "./ui/InfoTip";

function ComparisonRow({
  label,
  homeValue,
  awayValue,
  info,
}: {
  label: string;
  homeValue: string;
  awayValue: string;
  info?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-b border-white/20 py-2.5 last:border-0 dark:border-slate-800/50 sm:gap-x-4">
      <p className="min-w-0 truncate pr-2 text-right text-sm font-semibold tabular-nums text-primary">
        {homeValue}
      </p>
      <div className="flex w-[6.75rem] max-w-[38vw] shrink-0 flex-col items-center justify-center gap-1 px-1 text-center sm:w-[8.5rem] sm:max-w-[9.5rem]">
        <span className="w-full text-[10px] font-medium uppercase leading-snug tracking-wide text-muted sm:text-[11px]">
          {label}
        </span>
        {info ? (
          <InfoTip label={label} side="bottom">
            {info}
          </InfoTip>
        ) : null}
      </div>
      <p className="min-w-0 truncate pl-2 text-left text-sm font-semibold tabular-nums text-accent">
        {awayValue}
      </p>
    </div>
  );
}

function StatRows({ home, away }: { home: TeamSeasonStats; away: TeamSeasonStats }) {
  const rows: Array<{ key: keyof typeof TEAM_COMPARISON_GLOSSARY; home: string; away: string }> = [
    {
      key: "Form score",
      home: displayValue(home.formScorePct),
      away: displayValue(away.formScorePct),
    },
    {
      key: "Form string",
      home: displayValue(home.form),
      away: displayValue(away.form),
    },
    {
      key: "Goals per game (scored)",
      home: displayValue(home.goalsForPerGame),
      away: displayValue(away.goalsForPerGame),
    },
    {
      key: "Goals per game (conceded)",
      home: displayValue(home.goalsAgainstPerGame),
      away: displayValue(away.goalsAgainstPerGame),
    },
    {
      key: "Corners per game",
      home: displayValue(home.cornersPerGame),
      away: displayValue(away.cornersPerGame),
    },
    {
      key: "Fouls per game",
      home: displayValue(home.foulsPerGame),
      away: displayValue(away.foulsPerGame),
    },
    {
      key: "Yellow cards per game",
      home: displayValue(home.yellowCardsPerGame),
      away: displayValue(away.yellowCardsPerGame),
    },
    {
      key: "Red cards per game",
      home: displayValue(home.redCardsPerGame),
      away: displayValue(away.redCardsPerGame),
    },
    {
      key: "Shots on target per game",
      home: displayValue(home.shotsOnTargetPerGame),
      away: displayValue(away.shotsOnTargetPerGame),
    },
    {
      key: "Preferred formation",
      home: displayValue(home.preferredFormation),
      away: displayValue(away.preferredFormation),
    },
    {
      key: "Stadium",
      home: displayValue(home.venueName),
      away: displayValue(away.venueName),
    },
    {
      key: "Capacity",
      home: displayValue(home.venueCapacity),
      away: displayValue(away.venueCapacity),
    },
  ];

  return (
    <>
      {rows.map((row) => (
        <ComparisonRow
          key={row.key}
          label={row.key}
          homeValue={row.home}
          awayValue={row.away}
          info={TEAM_COMPARISON_GLOSSARY[row.key]}
        />
      ))}
    </>
  );
}

function FormBadge({ result }: { result: TeamFormMatch["result"] }) {
  const styles =
    result === "W"
      ? "bg-primary/15 text-primary-emphasis"
      : result === "L"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : result === "D"
          ? "bg-foreground/10 text-muted"
          : "bg-foreground/5 text-muted";

  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${styles}`}>
      {result}
    </span>
  );
}

function formatFormMatchDate(isoDate: string): string {
  return formatCalendarDateLocal(isoDate);
}

function RecentFormColumn({ matches }: { matches: TeamFormMatch[] }) {
  if (!matches.length) {
    return <p className="text-sm text-muted">N/A</p>;
  }

  return (
    <ul className="space-y-2">
      {matches.map((m, index) => (
        <li
          key={`${m.date}-${m.opponent}-${m.score}-${index}`}
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-2 py-1.5 dark:border-slate-800/50 dark:bg-slate-900/30"
        >
          <FormBadge result={m.result} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{m.opponent}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <time className="text-[11px] text-muted" dateTime={m.date}>
                {formatFormMatchDate(m.date)}
              </time>
              <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 text-xs font-semibold tabular-nums tracking-wide text-foreground dark:bg-white/10">
                {m.score}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TeamColumnHeader({ side }: { side: TeamComparisonSide }) {
  return (
    <div className="text-center">
      <p className="truncate text-sm font-bold text-foreground">{side.teamName}</p>
      {side.leagueName ? (
        <p className="truncate text-[11px] text-muted">{side.leagueName}</p>
      ) : null}
    </div>
  );
}

export function TeamComparisonPanel({ comparison }: { comparison: TeamComparisonSnapshot }) {
  const { home, away } = comparison;
  const homeShort = resolveTeamShortLabel({ name: home.teamName });
  const awayShort = resolveTeamShortLabel({ name: away.teamName });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-emphasis">
            <BarChart3 className="h-3.5 w-3.5" />
          </span>
          Team comparison
          <InfoTip label="Team comparison">
            Side-by-side season averages and recent results. Values show N/A when data is not
            available for that team.
          </InfoTip>
        </h3>

        <div className="liquid-glass-pill rounded-2xl p-4">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <TeamColumnHeader side={home} />
            <TeamColumnHeader side={away} />
          </div>
          <StatRows home={home.seasonStats} away={away.seasonStats} />
        </div>
      </div>

      <TeamBettingInsightsPanel
        comparison={comparison}
        homeShort={homeShort}
        awayShort={awayShort}
      />

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          Recent matches
          <InfoTip label="Recent matches">
            Last five finished games. W/D/L shows the result from this team&apos;s perspective.
          </InfoTip>
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
              {home.teamName}
            </p>
            <RecentFormColumn matches={home.recentForm.slice(0, 5)} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
              {away.teamName}
            </p>
            <RecentFormColumn matches={away.recentForm.slice(0, 5)} />
          </div>
        </div>
      </div>
    </div>
  );
}

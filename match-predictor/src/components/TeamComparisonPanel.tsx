"use client";

import type { ReactNode } from "react";
import { BarChart3, Users } from "lucide-react";
import { displayValue } from "@/lib/data/build-team-comparison";
import { TEAM_COMPARISON_GLOSSARY } from "@/lib/prediction/team-comparison-glossary";
import type {
  TeamComparisonSide,
  TeamComparisonSnapshot,
  TeamFormMatch,
  TeamPlayerStat,
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
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/20 py-2.5 last:border-0 dark:border-slate-800/50">
      <p className="truncate text-right text-sm font-semibold text-primary">{homeValue}</p>
      <div className="flex min-w-0 max-w-[9rem] flex-col items-center gap-0.5 px-1 text-center sm:max-w-none">
        <span className="flex items-center justify-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="truncate">{label}</span>
          {info ? <InfoTip label={label}>{info}</InfoTip> : null}
        </span>
      </div>
      <p className="truncate text-left text-sm font-semibold text-accent">{awayValue}</p>
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

function RecentFormColumn({ matches }: { matches: TeamFormMatch[] }) {
  if (!matches.length) {
    return <p className="text-sm text-muted">N/A</p>;
  }

  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li
          key={`${m.date}-${m.opponent}-${m.score}`}
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-2 py-1.5 dark:border-slate-800/50 dark:bg-slate-900/30"
        >
          <FormBadge result={m.result} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{m.opponent}</p>
            <p className="text-[11px] text-muted">
              {m.date} · {m.score}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PlayerList({ players }: { players: TeamPlayerStat[] }) {
  if (!players.length) {
    return <p className="text-sm text-muted">N/A</p>;
  }

  return (
    <ul className="space-y-2">
      {players.map((p) => (
        <li
          key={p.name}
          className="rounded-lg border border-white/20 bg-white/20 px-3 py-2 dark:border-slate-800/50 dark:bg-slate-900/30"
        >
          <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              Goals: {displayValue(p.goals)}
              <InfoTip label="Goals">{TEAM_COMPARISON_GLOSSARY.Goals}</InfoTip>
            </span>
            <span className="inline-flex items-center gap-1">
              Apps: {displayValue(p.appearances)}
              <InfoTip label="Appearances">{TEAM_COMPARISON_GLOSSARY.Appearances}</InfoTip>
            </span>
            <span className="inline-flex items-center gap-1">
              Rating: {displayValue(p.rating)}
              <InfoTip label="Rating">{TEAM_COMPARISON_GLOSSARY.Rating}</InfoTip>
            </span>
            {p.position ? (
              <span className="inline-flex items-center gap-1">
                {p.position}
                <InfoTip label="Position">{TEAM_COMPARISON_GLOSSARY.Position}</InfoTip>
              </span>
            ) : null}
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
  const { home, away, usesDatabaseStats } = comparison;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-emphasis">
            <BarChart3 className="h-3.5 w-3.5" />
          </span>
          Team comparison
          <InfoTip label="Team comparison">
            Side-by-side season averages and recent results from our synced database. Values show
            N/A when we do not have data for that team.
          </InfoTip>
        </h3>

        {usesDatabaseStats ? (
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Goals and form come from synced league standings; recent matches from synced results;
            stadium names from home fixtures. Corners, fouls, cards, and shots use synced team
            metrics when available (N/A if that team has not been synced yet).
          </p>
        ) : null}

        <div className="liquid-glass-pill rounded-2xl p-4">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <TeamColumnHeader side={home} />
            <TeamColumnHeader side={away} />
          </div>
          <StatRows home={home.seasonStats} away={away.seasonStats} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          Recent matches
          <InfoTip label="Recent matches">
            Last finished games stored in our database (up to 5). W/D/L shows the result from this
            team&apos;s perspective.
          </InfoTip>
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
              {home.teamName}
            </p>
            <RecentFormColumn matches={home.recentForm} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
              {away.teamName}
            </p>
            <RecentFormColumn matches={away.recentForm} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-emphasis">
            <Users className="h-3.5 w-3.5" />
          </span>
          Key players
          <InfoTip label="Key players">
            Top scorers from league data when synced, otherwise highest-rated players from our SoFIFA
            catalog for that club.
          </InfoTip>
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
              {home.teamName}
            </p>
            <PlayerList players={home.players} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
              {away.teamName}
            </p>
            <PlayerList players={away.players} />
          </div>
        </div>
      </div>
    </div>
  );
}

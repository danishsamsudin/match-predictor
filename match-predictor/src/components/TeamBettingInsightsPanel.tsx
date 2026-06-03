"use client";

import type { ReactNode } from "react";
import { Activity, Calendar, Shield, Swords, Target, Trophy, Users } from "lucide-react";
import { displayValue } from "@/lib/data/build-team-comparison";
import { TEAM_BETTING_INSIGHTS_GLOSSARY } from "@/lib/prediction/team-betting-insights-glossary";
import type {
  FixtureContextInsights,
  TeamBettingInsights,
  TeamFormRecord,
} from "@/lib/types/team-betting-insights";
import type { TeamComparisonSide, TeamComparisonSnapshot } from "@/lib/types/team-comparison";
import { InfoTip } from "./ui/InfoTip";

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value}%`;
}

function formatNum(value: number | null | undefined, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value}${suffix}`;
}

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

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-emphasis">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
    </div>
  );
}

function FormRecordBar({
  record,
  accent,
}: {
  record: TeamFormRecord;
  accent: "primary" | "accent";
}) {
  const total = record.wins + record.draws + record.losses || 1;
  const fill = accent === "primary" ? "bg-primary" : "bg-accent";
  const segments = [
    { key: "W", count: record.wins, className: fill },
    { key: "D", count: record.draws, className: "bg-foreground/25" },
    { key: "L", count: record.losses, className: "bg-red-500/70" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full ring-1 ring-white/30 dark:ring-slate-700/50">
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.key}
              className={`${s.className} transition-all`}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.key}: ${s.count}`}
            />
          ) : null
        )}
      </div>
      <p className="text-center text-xs tabular-nums text-muted">
        <span className="font-semibold text-foreground">{record.wins}W</span> ·{" "}
        <span className="font-semibold text-foreground">{record.draws}D</span> ·{" "}
        <span className="font-semibold text-foreground">{record.losses}L</span>
      </p>
    </div>
  );
}

function DualRateBar({
  label,
  homePct,
  awayPct,
  homeLabel,
  awayLabel,
}: {
  label: string;
  homePct: number;
  awayPct: number;
  homeLabel: string;
  awayLabel: string;
}) {
  const max = Math.max(homePct, awayPct, 1);
  return (
    <div className="space-y-2 border-b border-white/15 py-3 last:border-0 dark:border-slate-800/40">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 truncate text-right text-[10px] font-semibold text-primary">
            {homeLabel}
          </span>
          <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="absolute right-0 top-0 h-full rounded-full bg-primary"
              style={{ width: `${(homePct / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-primary">
            {homePct}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 truncate text-right text-[10px] font-semibold text-accent">
            {awayLabel}
          </span>
          <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="absolute right-0 top-0 h-full rounded-full bg-accent"
              style={{ width: `${(awayPct / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-accent">
            {awayPct}%
          </span>
        </div>
      </div>
    </div>
  );
}

function hasInsights(side: TeamComparisonSide): boolean {
  const i = side.insights;
  if (!i || i.source === "none") return false;
  return Boolean(
    i.fifaRanking ||
      i.vsTop20 ||
      i.recent ||
      i.bettingTrends ||
      i.qualifying ||
      i.attacking ||
      i.defensive ||
      i.squad
  );
}

function FixtureContextBlock({
  ctx,
  homeName,
  awayName,
}: {
  ctx: FixtureContextInsights;
  homeName: string;
  awayName: string;
}) {
  return (
    <div className="liquid-glass-pill rounded-2xl p-4">
      <SectionHeader
        icon={Calendar}
        title="This fixture"
        description="Recovery time before kickoff, based on each team's last finished match in our database."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <RestCard
          team={homeName}
          restDays={ctx.homeRestDays}
          lastDate={ctx.homeLastMatchDate}
          accent="primary"
        />
        <RestCard
          team={awayName}
          restDays={ctx.awayRestDays}
          lastDate={ctx.awayLastMatchDate}
          accent="accent"
        />
      </div>
      <p className="mt-3 text-center text-[10px] text-muted">
        Kickoff {ctx.kickoffDate}
      </p>
    </div>
  );
}

function RestCard({
  team,
  restDays,
  lastDate,
  accent,
}: {
  team: string;
  restDays: number | null;
  lastDate: string | null;
  accent: "primary" | "accent";
}) {
  const border = accent === "primary" ? "border-primary/20" : "border-accent/20";
  const text = accent === "primary" ? "text-primary" : "text-accent";
  return (
    <div className={`rounded-xl border ${border} bg-white/15 p-3 dark:bg-slate-900/25`}>
      <p className="truncate text-xs font-medium text-muted">{team}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${text}`}>
        {restDays != null ? `${restDays}d` : "N/A"}
      </p>
      <p className="text-[10px] text-muted">rest since last match</p>
      {lastDate ? (
        <p className="mt-1 text-[10px] text-muted">Last played {lastDate}</p>
      ) : null}
    </div>
  );
}

export function TeamBettingInsightsPanel({
  comparison,
  homeShort,
  awayShort,
}: {
  comparison: TeamComparisonSnapshot;
  homeShort: string;
  awayShort: string;
}) {
  const { home, away, fixtureContext } = comparison;
  if (!hasInsights(home) && !hasInsights(away) && !fixtureContext) return null;

  const homeRecent = home.insights?.recent;
  const awayRecent = away.insights?.recent;
  const homeTrends = home.insights?.bettingTrends;
  const awayTrends = away.insights?.bettingTrends;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-emphasis">
            <Activity className="h-3.5 w-3.5" />
          </span>
          Data-backed betting insights
          <InfoTip label="Data-backed insights">
            Calculated from stored match results and FBref season tables. These are historical
            facts — not the same as the Poisson model probabilities below.
          </InfoTip>
        </h3>
        <p className="text-xs leading-relaxed text-muted">
          Source: {home.insights?.source ?? "none"} / {away.insights?.source ?? "none"} · Window
          uses up to 10 most recent finished matches with scores.
        </p>
      </div>

      {fixtureContext ? (
        <FixtureContextBlock
          ctx={fixtureContext}
          homeName={home.teamName}
          awayName={away.teamName}
        />
      ) : null}

      {(home.insights?.fifaRanking || away.insights?.fifaRanking) && (
        <div className="liquid-glass-pill rounded-2xl p-4">
          <SectionHeader
            icon={Trophy}
            title="FIFA world ranking"
            description="Latest snapshot in our database (Sofascore 2026 when imported, otherwise Kaggle history through 2024). Drives national-team strength in the model."
          />
          <ComparisonRow
            label="Rank"
            homeValue={
              home.insights?.fifaRanking
                ? `#${home.insights.fifaRanking.rank}`
                : "N/A"
            }
            awayValue={
              away.insights?.fifaRanking
                ? `#${away.insights.fifaRanking.rank}`
                : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["FIFA rank"]}
          />
          <ComparisonRow
            label="Ranking points"
            homeValue={
              home.insights?.fifaRanking
                ? String(home.insights.fifaRanking.points)
                : "N/A"
            }
            awayValue={
              away.insights?.fifaRanking
                ? String(away.insights.fifaRanking.points)
                : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["FIFA points"]}
          />
          <ComparisonRow
            label="Snapshot"
            homeValue={home.insights?.fifaRanking?.snapshotLabel ?? "N/A"}
            awayValue={away.insights?.fifaRanking?.snapshotLabel ?? "N/A"}
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["FIFA snapshot"]}
          />
        </div>
      )}

      {(home.insights?.vsTop20 || away.insights?.vsTop20) && (
        <div className="liquid-glass-pill rounded-2xl p-4">
          <SectionHeader
            icon={Target}
            title="Performance vs top-20 FIFA teams"
            description="Results in recent matches where the opponent was ranked in the FIFA top 20 at that time (semester snapshot)."
          />
          <ComparisonRow
            label="Matches vs top 20"
            homeValue={
              home.insights?.vsTop20
                ? String(home.insights.vsTop20.matchesPlayed)
                : "N/A"
            }
            awayValue={
              away.insights?.vsTop20
                ? String(away.insights.vsTop20.matchesPlayed)
                : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["Vs top 20 matches"]}
          />
          <ComparisonRow
            label="Record (W-D-L)"
            homeValue={
              home.insights?.vsTop20
                ? `${home.insights.vsTop20.wins}-${home.insights.vsTop20.draws}-${home.insights.vsTop20.losses}`
                : "N/A"
            }
            awayValue={
              away.insights?.vsTop20
                ? `${away.insights.vsTop20.wins}-${away.insights.vsTop20.draws}-${away.insights.vsTop20.losses}`
                : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["Vs top 20 record"]}
          />
          <ComparisonRow
            label="PPG vs top 20"
            homeValue={
              home.insights?.vsTop20 ? String(home.insights.vsTop20.ppg) : "N/A"
            }
            awayValue={
              away.insights?.vsTop20 ? String(away.insights.vsTop20.ppg) : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["Vs top 20 PPG"]}
          />
          <ComparisonRow
            label="Win % vs top 20"
            homeValue={formatPct(home.insights?.vsTop20?.winPct)}
            awayValue={formatPct(away.insights?.vsTop20?.winPct)}
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["Vs top 20 win %"]}
          />
        </div>
      )}

      {(homeRecent || awayRecent) && (
        <div className="liquid-glass-pill rounded-2xl p-4">
          <SectionHeader
            icon={Trophy}
            title="Recent form & performance"
            description="Rolling record from finished matches (friendlies and qualifiers included unless noted)."
          />
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {homeRecent ? (
              <div>
                <p className="mb-2 text-center text-xs font-medium text-primary">{homeShort}</p>
                <FormRecordBar record={homeRecent.record} accent="primary" />
                <p className="mt-2 text-center text-[10px] text-muted">{homeRecent.windowLabel}</p>
              </div>
            ) : null}
            {awayRecent ? (
              <div>
                <p className="mb-2 text-center text-xs font-medium text-accent">{awayShort}</p>
                <FormRecordBar record={awayRecent.record} accent="accent" />
                <p className="mt-2 text-center text-[10px] text-muted">{awayRecent.windowLabel}</p>
              </div>
            ) : null}
          </div>
          <div className="liquid-glass-pill rounded-xl p-3">
            <ComparisonRow
              label="Goal difference"
              homeValue={
                homeRecent ? String(homeRecent.goalDifferential) : "N/A"
              }
              awayValue={
                awayRecent ? String(awayRecent.goalDifferential) : "N/A"
              }
              info={TEAM_BETTING_INSIGHTS_GLOSSARY["Goal difference"]}
            />
            <ComparisonRow
              label="Goals scored / game"
              homeValue={homeRecent ? String(homeRecent.goalsForPerGame) : "N/A"}
              awayValue={awayRecent ? String(awayRecent.goalsForPerGame) : "N/A"}
              info={TEAM_BETTING_INSIGHTS_GLOSSARY["Goals scored / game"]}
            />
            <ComparisonRow
              label="Goals conceded / game"
              homeValue={homeRecent ? String(homeRecent.goalsAgainstPerGame) : "N/A"}
              awayValue={awayRecent ? String(awayRecent.goalsAgainstPerGame) : "N/A"}
              info={TEAM_BETTING_INSIGHTS_GLOSSARY["Goals conceded / game"]}
            />
            <ComparisonRow
              label="Clean sheet %"
              homeValue={formatPct(homeRecent?.cleanSheetPct)}
              awayValue={formatPct(awayRecent?.cleanSheetPct)}
              info={TEAM_BETTING_INSIGHTS_GLOSSARY["Clean sheet %"]}
            />
            <ComparisonRow
              label="Failed to score %"
              homeValue={formatPct(homeRecent?.failedToScorePct)}
              awayValue={formatPct(awayRecent?.failedToScorePct)}
              info={TEAM_BETTING_INSIGHTS_GLOSSARY["Failed to score %"]}
            />
          </div>
        </div>
      )}

      {homeTrends && awayTrends ? (
        <div className="liquid-glass-pill rounded-2xl p-4">
          <SectionHeader
            icon={Target}
            title="Historical betting trends"
            description={`Share of last ${homeTrends.windowSize} games where both teams scored (BTTS) or total goals exceeded 2.5.`}
          />
          <DualRateBar
            label="BTTS (both scored)"
            homePct={homeTrends.bttsYesPct}
            awayPct={awayTrends.bttsYesPct}
            homeLabel={homeShort}
            awayLabel={awayShort}
          />
          <DualRateBar
            label="Over 2.5 goals"
            homePct={homeTrends.over25Pct}
            awayPct={awayTrends.over25Pct}
            homeLabel={homeShort}
            awayLabel={awayShort}
          />
        </div>
      ) : null}

      {(home.insights?.qualifying || away.insights?.qualifying) && (
        <div className="liquid-glass-pill rounded-2xl p-4">
          <SectionHeader
            icon={Trophy}
            title="World Cup qualifying"
            description="Points per game across WCQ and inter-confederation play-off matches stored in our database."
          />
          <ComparisonRow
            label="Qualifying PPG"
            homeValue={
              home.insights?.qualifying
                ? String(home.insights.qualifying.ppg)
                : "N/A"
            }
            awayValue={
              away.insights?.qualifying
                ? String(away.insights.qualifying.ppg)
                : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["Qualifying PPG"]}
          />
          <ComparisonRow
            label="Qualifying record"
            homeValue={
              home.insights?.qualifying
                ? `${home.insights.qualifying.wins}-${home.insights.qualifying.draws}-${home.insights.qualifying.losses}`
                : "N/A"
            }
            awayValue={
              away.insights?.qualifying
                ? `${away.insights.qualifying.wins}-${away.insights.qualifying.draws}-${away.insights.qualifying.losses}`
                : "N/A"
            }
            info={TEAM_BETTING_INSIGHTS_GLOSSARY["Qualifying record"]}
          />
        </div>
      )}

      <InsightMetricSection
        icon={Swords}
        title="Attacking profile"
        description="Season aggregates from FBref squad tables (weighted by minutes)."
        rows={[
          {
            label: "Shot conversion %",
            home: formatPct(home.insights?.attacking?.shotConversionPct),
            away: formatPct(away.insights?.attacking?.shotConversionPct),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Shot conversion %"],
          },
          {
            label: "Shots on target / 90",
            home: formatNum(home.insights?.attacking?.shotsOnTargetPer90),
            away: formatNum(away.insights?.attacking?.shotsOnTargetPer90),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Shots on target / 90"],
          },
          {
            label: "Crosses / 90",
            home: formatNum(home.insights?.attacking?.crossesPer90),
            away: formatNum(away.insights?.attacking?.crossesPer90),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Crosses / 90"],
          },
          {
            label: "Top scorer goal share",
            home: formatPct(home.insights?.attacking?.topScorerSharePct),
            away: formatPct(away.insights?.attacking?.topScorerSharePct),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Top scorer goal share"],
          },
        ]}
      />

      <InsightMetricSection
        icon={Shield}
        title="Defensive profile"
        description="Keeper and misc defensive rates; shots conceded when SofaScore match stats are synced."
        rows={[
          {
            label: "GK save %",
            home: formatPct(home.insights?.defensive?.goalkeeperSavePct),
            away: formatPct(away.insights?.defensive?.goalkeeperSavePct),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["GK save %"],
          },
          {
            label: "Tackles / 90",
            home: formatNum(home.insights?.defensive?.tacklesPer90),
            away: formatNum(away.insights?.defensive?.tacklesPer90),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Tackles / 90"],
          },
          {
            label: "Interceptions / 90",
            home: formatNum(home.insights?.defensive?.interceptionsPer90),
            away: formatNum(away.insights?.defensive?.interceptionsPer90),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Interceptions / 90"],
          },
          {
            label: "Shots conceded / game",
            home: formatNum(home.insights?.defensive?.shotsConcededPerGame),
            away: formatNum(away.insights?.defensive?.shotsConcededPerGame),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Shots conceded / game"],
          },
        ]}
      />

      <InsightMetricSection
        icon={Users}
        title="Squad profile"
        description="Roster composition from FBref standard stats (qualifying/friendlies season rows)."
        rows={[
          {
            label: "Average age",
            home: formatNum(home.insights?.squad?.averageAge, " yrs"),
            away: formatNum(away.insights?.squad?.averageAge, " yrs"),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Average age"],
          },
          {
            label: "Players used",
            home: formatNum(home.insights?.squad?.squadPlayersUsed),
            away: formatNum(away.insights?.squad?.squadPlayersUsed),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Players used"],
          },
          {
            label: "Penalty conversion",
            home: formatPct(home.insights?.squad?.penaltyConversionPct),
            away: formatPct(away.insights?.squad?.penaltyConversionPct),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Penalty conversion"],
          },
          {
            label: "Yellow cards / 90",
            home: formatNum(home.insights?.squad?.yellowCardsPer90),
            away: formatNum(away.insights?.squad?.yellowCardsPer90),
            info: TEAM_BETTING_INSIGHTS_GLOSSARY["Yellow cards / 90"],
          },
        ]}
      />
    </div>
  );
}

function InsightMetricSection({
  icon: Icon,
  title,
  description,
  rows,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  rows: Array<{ label: string; home: string; away: string; info?: ReactNode }>;
}) {
  const anyValue = rows.some((r) => r.home !== "N/A" || r.away !== "N/A");
  if (!anyValue) return null;

  return (
    <div className="liquid-glass-pill rounded-2xl p-4">
      <SectionHeader icon={Icon} title={title} description={description} />
      <div className="liquid-glass-pill rounded-xl p-3">
        {rows.map((row) => (
          <ComparisonRow
            key={row.label}
            label={row.label}
            homeValue={displayValue(row.home)}
            awayValue={displayValue(row.away)}
            info={row.info}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { BarChart3, Goal, TrendingUp } from "lucide-react";
import type { PredictionAnalytics, PredictionResult } from "@/lib/types/prediction";
import type { TeamComparisonSnapshot, TeamFormMatch } from "@/lib/types/team-comparison";
import { formatCalendarDateLocal } from "@/lib/utils/kickoff-display";
import { resolveTeamShortLabel } from "@/lib/utils/team-display-name";
import { InfoTip } from "@/components/ui/InfoTip";
import { ChartCard, ChartCardWithTip } from "./ChartCard";

function maxProb(cells: { probability: number }[]): number {
  return Math.max(...cells.map((c) => c.probability), 0.1);
}

function formatAsianLine(line: number): string {
  if (line > 0) return `+${line}`;
  return String(line);
}

function HorizontalBar({
  label,
  value,
  maxValue,
  accent = "primary",
}: {
  label: string;
  value: number;
  maxValue: number;
  accent?: "primary" | "accent" | "neutral";
}) {
  const width = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  const fill =
    accent === "primary"
      ? "bg-gradient-to-r from-primary to-primary-light"
      : accent === "accent"
        ? "bg-gradient-to-r from-accent to-accent-light"
        : "bg-foreground/20";

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 justify-between gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-muted">{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-foreground/8 ring-1 ring-white/30 dark:ring-slate-700/50">
        <div
          className={`h-full rounded-full transition-all duration-500 ${fill}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/** Per-metric scale so low values (e.g. goals/game) still fill the bar track. */
function statRowBarMax(home: number, away: number): number {
  const peak = Math.max(home, away, 0.1);
  return peak * 1.1;
}

function DualHorizontalBar({
  label,
  homeValue,
  awayValue,
  homeLabel,
  awayLabel,
  homeLabelTitle,
  awayLabelTitle,
  maxValue,
  scaleAsPercent = false,
  valueSuffix = "",
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  homeLabel: string;
  awayLabel: string;
  homeLabelTitle?: string;
  awayLabelTitle?: string;
  maxValue: number;
  /** When true, bar width is value% on a 0-100 track (for percentage metrics). */
  scaleAsPercent?: boolean;
  valueSuffix?: string;
}) {
  const homeWidth = scaleAsPercent
    ? Math.min(100, Math.max(0, homeValue))
    : maxValue > 0
      ? (homeValue / maxValue) * 100
      : 0;
  const awayWidth = scaleAsPercent
    ? Math.min(100, Math.max(0, awayValue))
    : maxValue > 0
      ? (awayValue / maxValue) * 100
      : 0;
  const formatVal = (v: number) =>
    scaleAsPercent ? `${Math.round(v * 10) / 10}${valueSuffix || "%"}` : `${v}${valueSuffix}`;

  return (
    <div className="min-w-0 space-y-2 border-b border-white/20 py-3 last:border-0 dark:border-slate-800/50">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="space-y-2">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span
            className="w-[4.25rem] shrink-0 truncate text-right text-[10px] font-semibold text-primary sm:w-20"
            title={homeLabelTitle ?? homeLabel}
          >
            {homeLabel}
          </span>
          <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
              style={{ width: `${homeWidth}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-primary sm:w-10 sm:text-xs">
            {formatVal(homeValue)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span
            className="w-[4.25rem] shrink-0 truncate text-right text-[10px] font-semibold text-accent sm:w-20"
            title={awayLabelTitle ?? awayLabel}
          >
            {awayLabel}
          </span>
          <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-accent to-accent-light"
              style={{ width: `${awayWidth}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-accent sm:w-10 sm:text-xs">
            {formatVal(awayValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ScoreHeatmap({
  cells,
  homeLabel,
  awayLabel,
}: {
  cells: PredictionAnalytics["scoreHeatmap"];
  homeLabel: string;
  awayLabel: string;
}) {
  const maxGoals = Math.max(...cells.map((c) => Math.max(c.home, c.away)), 4);
  const grid: (typeof cells)[0][][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    grid[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      grid[h][a] = cells.find((c) => c.home === h && c.away === a) ?? {
        home: h,
        away: a,
        probability: 0,
      };
    }
  }
  const peak = maxProb(cells);

  const colCount = maxGoals + 1;
  const dataColStart = 3;
  const headerRow = 2;
  const firstDataRow = 3;
  const lastDataRow = firstDataRow + colCount;
  const compactMinWidth = `${3.5 + colCount * 2.35}rem`;

  return (
    <div className="score-heatmap-shell">
      <div
        className="score-heatmap-matrix mx-auto w-full max-lg:w-max max-lg:min-w-[var(--heatmap-compact)]"
        style={
          {
            "--heatmap-cols": colCount,
            "--heatmap-compact": compactMinWidth,
          } as React.CSSProperties
        }
      >
        <div
          className="score-heatmap-axis-home flex items-center justify-center text-[9px] font-semibold leading-tight text-foreground sm:text-[10px]"
          style={{
            gridColumn: 1,
            gridRow: `${firstDataRow} / ${lastDataRow}`,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
          title={homeLabel}
        >
          {homeLabel}
        </div>

        <p
          className="score-heatmap-away-label truncate text-center text-[10px] font-semibold text-foreground sm:text-[11px]"
          style={{
            gridColumn: `${dataColStart} / span ${colCount}`,
            gridRow: 1,
          }}
          title={awayLabel}
        >
          {awayLabel}
        </p>

        <div style={{ gridColumn: 2, gridRow: headerRow }} aria-hidden />

        {Array.from({ length: colCount }, (_, a) => (
          <div
            key={`away-h-${a}`}
            className="pb-1 text-center text-[10px] font-medium text-muted"
            style={{ gridColumn: dataColStart + a, gridRow: headerRow }}
          >
            {a}
          </div>
        ))}

        {grid.map((row, h) => {
          const gridRow = firstDataRow + h;
          return (
            <div key={`row-${h}`} className="contents">
              <div
                className="flex items-center justify-center pr-0.5 text-[10px] font-medium text-muted"
                style={{ gridColumn: 2, gridRow }}
              >
                {h}
              </div>
              {row.map((cell, a) => {
                const intensity = cell.probability / peak;
                return (
                  <div
                    key={`${cell.home}-${cell.away}`}
                    className="score-heatmap-cell flex aspect-square min-h-[2.15rem] flex-col items-center justify-center rounded-md border border-white/25 text-center transition sm:min-h-[2.5rem] sm:rounded-lg dark:border-slate-700/40"
                    style={{
                      gridColumn: dataColStart + a,
                      gridRow,
                      background: `color-mix(in srgb, var(--primary) ${Math.round(intensity * 55)}%, transparent)`,
                    }}
                    title={`${cell.home}-${cell.away}: ${cell.probability}%`}
                  >
                    <span className="text-[10px] font-bold text-foreground lg:text-[11px]">
                      {cell.home}-{cell.away}
                    </span>
                    <span className="text-[9px] tabular-nums text-muted lg:text-[10px]">
                      {cell.probability > 0 ? `${cell.probability}%` : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatFormMatchDate(isoDate: string): string {
  return formatCalendarDateLocal(isoDate);
}

function FormResultBadge({ result }: { result: TeamFormMatch["result"] }) {
  const styles =
    result === "W"
      ? "bg-primary/15 text-primary-emphasis ring-primary/25"
      : result === "L"
        ? "bg-red-500/15 text-red-600 ring-red-500/25 dark:text-red-400"
        : result === "D"
          ? "bg-foreground/10 text-muted ring-foreground/15"
          : "bg-foreground/5 text-muted ring-foreground/10";

  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ring-1 ${styles}`}
    >
      {result}
    </span>
  );
}

const FORM_TIMELINE_LIMIT = 10;

function FormStrip({ matches }: { matches: TeamFormMatch[] }) {
  const recent = matches.slice(0, FORM_TIMELINE_LIMIT);

  if (!recent.length) {
    return <p className="text-xs text-muted">No recent form data</p>;
  }

  return (
    <ul className="space-y-1.5">
      {recent.map((m) => (
        <li
          key={`${m.date}-${m.opponent}-${m.score}`}
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/15 px-2 py-1.5 dark:border-slate-800/50 dark:bg-slate-900/25"
        >
          <FormResultBadge result={m.result} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{m.opponent}</p>
            <time className="text-[11px] text-muted" dateTime={m.date}>
              {formatFormMatchDate(m.date)}
            </time>
          </div>
          <span className="shrink-0 self-center text-xs font-semibold tabular-nums tracking-wide text-foreground">
            {m.score}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ModelImpactChart({
  factors,
}: {
  factors: PredictionAnalytics["modelImpact"];
}) {
  return (
    <div className="space-y-4">
      {factors.map((f) => {
        const homeDelta = (f.homeMultiplier - 1) * 100;
        const awayDelta = (f.awayMultiplier - 1) * 100;
        return (
          <div key={f.label} className="space-y-2">
            <p className="text-xs font-medium text-foreground">{f.label}</p>
            <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-2 sm:gap-3">
              <ImpactPill label="Home xG shift" delta={homeDelta} accent="primary" />
              <ImpactPill label="Away xG shift" delta={awayDelta} accent="accent" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImpactPill({
  label,
  delta,
  accent,
}: {
  label: string;
  delta: number;
  accent: "primary" | "accent";
}) {
  const positive = delta >= 0;
  const text = accent === "primary" ? "text-primary" : "text-accent";
  return (
    <div className="rounded-xl border border-white/25 bg-white/20 px-2 py-2 dark:border-slate-800/50 dark:bg-slate-900/30 sm:px-3">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-base font-bold tabular-nums sm:text-lg ${text}`}>
        {positive ? "+" : ""}
        {delta.toFixed(1)}%
      </p>
    </div>
  );
}

export function PredictionCharts({
  result,
}: {
  result: PredictionResult;
}) {
  const analytics = result.analytics;
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";
  const homeShort =
    result.homeTeamShortName ?? resolveTeamShortLabel({ name: homeLabel });
  const awayShort =
    result.awayTeamShortName ?? resolveTeamShortLabel({ name: awayLabel });
  const comparison = result.teamComparison;

  if (!analytics) return null;

  const topScoreMax = maxProb(analytics.topScores);
  const marginMax = Math.max(
    ...analytics.handicapMarkets.winningMargins.map((m) => m.probabilityPct),
    1
  );
  const ahMax = Math.max(
    ...analytics.handicapMarkets.asianHandicap.map((l) => l.homeCoverPct),
    1
  );
  const ouMax = Math.max(...analytics.overUnder.flatMap((l) => [l.overPct, l.underPct]), 1);
  const goalsMax = Math.max(
    ...analytics.totalGoalsDistribution.map((g) => g.probability),
    1
  );
  return (
    <section className="min-w-0 max-w-full space-y-6" aria-label="Prediction charts">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary-emphasis">
          <BarChart3 className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Statistical insights</h3>
          <p className="text-xs text-muted">
            Charts derived from our Poisson goal model and season data - useful for match
            result, goals, and team form markets.
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCardWithTip
          title="Correct score heatmap"
          tipLabel="Correct score heatmap"
          tipBody={
            <>
              Each cell is the model&apos;s estimated chance of that exact scoreline (e.g. 2-1).
              Darker cells are more likely - popular for correct-score and scorecast-style bets.
            </>
          }
          className="lg:col-span-2"
        >
          <div className="w-full min-w-0">
            <ScoreHeatmap
              cells={analytics.scoreHeatmap}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </div>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Most likely scorelines"
          tipLabel="Top scorelines"
          tipBody={
            <>
              The eight exact scores our model rates highest. Compare with bookmaker correct-score
              prices to spot value.
            </>
          }
        >
          <div className="space-y-3">
            {analytics.topScores.map((cell) => (
              <HorizontalBar
                key={`${cell.home}-${cell.away}`}
                label={`${cell.home} – ${cell.away}`}
                value={cell.probability}
                maxValue={topScoreMax}
                accent="primary"
              />
            ))}
          </div>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Winning margin markets"
          tipLabel="Winning margin"
          tipBody={
            <>
              Probability the home or away team wins by exactly 1, 2, or 3 goals. Derived by
              summing scorelines from the Poisson/Dixon-Coles grid where the goal difference matches
              each margin.
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {homeLabel}
              </p>
              {analytics.handicapMarkets.winningMargins
                .filter((m) => m.side === "home")
                .map((m) => (
                  <HorizontalBar
                    key={`home-${m.margin}`}
                    label={`Win by +${m.margin}`}
                    value={m.probabilityPct}
                    maxValue={marginMax}
                    accent="primary"
                  />
                ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                {awayLabel}
              </p>
              {analytics.handicapMarkets.winningMargins
                .filter((m) => m.side === "away")
                .map((m) => (
                  <HorizontalBar
                    key={`away-${m.margin}`}
                    label={`Win by +${m.margin}`}
                    value={m.probabilityPct}
                    maxValue={marginMax}
                    accent="accent"
                  />
                ))}
            </div>
          </div>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Asian Handicap (home line)"
          tipLabel="Asian Handicap"
          tipBody={
            <>
              Home-side cover probability for each Asian Handicap line (negative = home gives goals).
              Quarter lines split stake between adjacent half/whole lines. Compare with bookmaker AH
              prices in the handicap market comparison panel below.
            </>
          }
        >
          <div className="space-y-2">
            {analytics.handicapMarkets.asianHandicap.map((line) => (
              <HorizontalBar
                key={line.line}
                label={`Home ${formatAsianLine(line.line)}`}
                value={line.homeCoverPct}
                maxValue={ahMax}
                accent={line.line <= 0 ? "primary" : "accent"}
              />
            ))}
          </div>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Goals markets (Over / Under) - model"
          tipLabel="Over/Under goals (model)"
          tipBody={
            <>
              Chance of total goals going over or under common lines (1.5, 2.5, 3.5) for this fixture.
              Based on the same expected-goals model as the main prediction.
            </>
          }
        >
          <div className="space-y-4">
            {analytics.overUnder.map((line) => (
              <div key={line.line} className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Over {line.line} goals</p>
                <HorizontalBar label="Over" value={line.overPct} maxValue={ouMax} accent="primary" />
                <HorizontalBar label="Under" value={line.underPct} maxValue={ouMax} accent="accent" />
              </div>
            ))}
          </div>
        </ChartCardWithTip>

        {analytics.historicalMarkets ? (
          <ChartCard
            title="Historical vs model markets"
            description="Historical bars use each team's past results. Model % is for this fixture only."
            className="lg:col-span-2"
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <HistoricalMarketCompare
                label="BTTS Yes %"
                tipLabel="BTTS Yes %"
                tipBody={
                  <>
                    Share of each team&apos;s last finished games where <strong>both</strong> teams
                    scored at least once. The model % below is our Poisson estimate for this
                    specific matchup.
                  </>
                }
                homeHistorical={analytics.historicalMarkets.home.bttsYesPct}
                awayHistorical={analytics.historicalMarkets.away.bttsYesPct}
                modelPct={analytics.btts.yesPct}
                homeShort={homeShort}
                awayShort={awayShort}
                sampleHome={analytics.historicalMarkets.home.sampleSize}
                sampleAway={analytics.historicalMarkets.away.sampleSize}
              />
              <HistoricalMarketCompare
                label="Over 2.5 %"
                tipLabel="Over 2.5 %"
                tipBody={
                  <>
                    Share of each team&apos;s last games with <strong>three or more</strong> total
                    goals. The model % below is our Poisson estimate for over 2.5 goals in this
                    fixture.
                  </>
                }
                homeHistorical={analytics.historicalMarkets.home.over25Pct}
                awayHistorical={analytics.historicalMarkets.away.over25Pct}
                modelPct={
                  analytics.overUnder.find((l) => l.line === 2.5)?.overPct ?? 0
                }
                homeShort={homeShort}
                awayShort={awayShort}
                sampleHome={analytics.historicalMarkets.home.sampleSize}
                sampleAway={analytics.historicalMarkets.away.sampleSize}
              />
            </div>
          </ChartCard>
        ) : null}

        <ChartCardWithTip
          title="Both teams to score (BTTS) - model"
          tipLabel="Both teams to score (model)"
          tipBody={
            <>
              Estimated chance both teams score at least once in <em>this</em> fixture. High when
              both xG values are strong. Compare with historical BTTS rates in team insights above.
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
              <p className="text-xs font-medium text-primary-emphasis">Yes</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
                {analytics.btts.yesPct}%
              </p>
            </div>
            <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4 text-center">
              <p className="text-xs font-medium text-accent-emphasis">No</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-accent">
                {analytics.btts.noPct}%
              </p>
            </div>
          </div>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Total goals distribution"
          tipLabel="Total goals"
          tipBody={
            <>
              How likely each total goal count is (0, 1, 2, 3…). Helps with exact total-goals and
              Asian goal-line markets.
            </>
          }
        >
          <div className="chart-h-scroll">
            <div
              className="flex items-end justify-between gap-1.5 px-0.5 pt-2 sm:gap-2"
              style={{ minWidth: "22rem", minHeight: "8rem" }}
            >
              {analytics.totalGoalsDistribution.map((g) => (
                <div
                  key={g.goals}
                  className="flex w-7 shrink-0 flex-col items-center gap-1 sm:w-8"
                >
                  <span className="text-[9px] font-semibold tabular-nums text-muted sm:text-[10px]">
                    {g.probability}%
                  </span>
                  <div
                    className="w-full max-w-[2rem] rounded-t-md bg-gradient-to-t from-primary/80 to-primary-light/60 sm:max-w-[2.5rem]"
                    style={{
                      height: `${Math.max(8, (g.probability / goalsMax) * 96)}px`,
                    }}
                  />
                  <span className="text-[9px] font-medium text-foreground sm:text-[10px]">
                    {g.goals}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">Total goals in match</p>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Expected goals (xG) comparison"
          tipLabel="xG comparison"
          tipBody={
            <>
              Side-by-side expected goals after all model adjustments. The taller bar suggests more
              scoring chances - not a guaranteed goal count.
            </>
          }
        >
          <XgComparisonBlock
            result={result}
            analytics={analytics}
            homeShort={homeShort}
            awayShort={awayShort}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Form & momentum"
          tipLabel="Form and momentum"
          tipBody={
            <>
              <strong>Form score</strong> reflects recent results (recent games weighted more).{" "}
              <strong>Momentum index</strong> blends form (35%) and head-to-head history (65%) into
              one number - positive favours the home side in our model.
            </>
          }
        >
          <div className="space-y-4">
            <DualHorizontalBar
              label="Form score"
              homeValue={analytics.formScores.homePct}
              awayValue={analytics.formScores.awayPct}
              homeLabel={homeShort}
              awayLabel={awayShort}
              homeLabelTitle={homeLabel}
              awayLabelTitle={awayLabel}
              maxValue={100}
            />
            <div className="rounded-xl border border-white/25 bg-white/20 px-4 py-3 text-center dark:border-slate-800/50 dark:bg-slate-900/30">
              <p className="text-[10px] uppercase tracking-wide text-muted">Momentum index</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                {analytics.momentumIndex}
              </p>
              <p className="mt-1 text-[10px] text-muted">
                &gt;0 leans home · &lt;0 leans away · 0 is neutral
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat
                label={`${homeShort} win`}
                title={`${homeLabel} win`}
                value={`${analytics.h2h.homeWinPct}%`}
              />
              <MiniStat label="Draw" value={`${analytics.h2h.drawPct}%`} />
              <MiniStat
                label={`${awayShort} win`}
                title={`${awayLabel} win`}
                value={`${analytics.h2h.awayWinPct}%`}
              />
            </div>
          </div>
        </ChartCardWithTip>

        {analytics.statComparison.length > 0 ? (
          <ChartCardWithTip
            title="Season stat comparison"
            tipLabel="Season averages"
            tipBody={
              <>
                Average per-game stats from our database. Compare attacking vs defensive trends
                before backing goals or corners markets.
              </>
            }
            className="lg:col-span-2"
          >
            {analytics.statComparison.map((row) => (
              <DualHorizontalBar
                key={row.metric}
                label={row.metric}
                homeValue={row.home}
                awayValue={row.away}
                homeLabel={homeShort}
                awayLabel={awayShort}
                homeLabelTitle={homeLabel}
                awayLabelTitle={awayLabel}
                maxValue={statRowBarMax(row.home, row.away)}
              />
            ))}
          </ChartCardWithTip>
        ) : null}

        <ChartCardWithTip
          title="Model adjustments"
          tipLabel="Model adjustments"
          tipBody={
            <>
              How much lineup, weather, and stadium/travel factors shifted expected goals vs the
              baseline. Shown as % change from neutral (1.0×).
            </>
          }
          className="lg:col-span-2"
        >
          <ModelImpactChart factors={analytics.modelImpact} />
        </ChartCardWithTip>
      </div>

      {comparison ? (
        <FormTrendSection comparison={comparison} homeLabel={homeLabel} awayLabel={awayLabel} />
      ) : null}
    </section>
  );
}

function MiniStat({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/15 px-2 py-2 text-center dark:border-slate-800/50 dark:bg-slate-900/25">
      <p className="truncate text-[10px] text-muted" title={title ?? label}>
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function XgComparisonBlock({
  result,
  analytics,
  homeShort,
  awayShort,
  homeLabel,
  awayLabel,
}: {
  result: PredictionResult;
  analytics: PredictionAnalytics;
  homeShort: string;
  awayShort: string;
  homeLabel: string;
  awayLabel: string;
}) {
  const homeXg = result.expectedGoals.home;
  const awayXg = result.expectedGoals.away;
  const totalXg = homeXg + awayXg;
  const diff = homeXg - awayXg;
  const zeroZero =
    analytics.scoreHeatmap.find((c) => c.home === 0 && c.away === 0)?.probability ?? 0;
  const goalsFor = analytics.statComparison?.find((s) => {
    const m = s.metric.toLowerCase();
    return m.includes("goal") && (m.includes("scored") || m.includes("for"));
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
        <div className="rounded-lg border border-white/25 bg-white/15 px-1.5 py-2 dark:border-slate-800/50 dark:bg-slate-900/25 sm:px-2">
          <p className="text-[9px] uppercase tracking-wide text-muted sm:text-[10px]">Total xG</p>
          <p className="text-base font-bold tabular-nums text-foreground sm:text-lg">
            {totalXg.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-white/25 bg-white/15 px-1.5 py-2 dark:border-slate-800/50 dark:bg-slate-900/25 sm:px-2">
          <p className="text-[9px] uppercase tracking-wide text-muted sm:text-[10px]">xG diff</p>
          <p className="text-base font-bold tabular-nums text-foreground sm:text-lg">
            {diff >= 0 ? "+" : ""}
            {diff.toFixed(2)}
          </p>
          <p className="truncate text-[9px] text-muted sm:text-[10px]">
            {diff > 0.05 ? homeShort : diff < -0.05 ? awayShort : "Even"}
          </p>
        </div>
        <div className="rounded-lg border border-white/25 bg-white/15 px-1.5 py-2 dark:border-slate-800/50 dark:bg-slate-900/25 sm:px-2">
          <p className="text-[9px] uppercase tracking-wide text-muted sm:text-[10px]">0-0 chance</p>
          <p className="text-base font-bold tabular-nums text-foreground sm:text-lg">{zeroZero}%</p>
        </div>
      </div>
      <DualHorizontalBar
        label="Expected goals"
        homeValue={homeXg}
        awayValue={awayXg}
        homeLabel={homeShort}
        awayLabel={awayShort}
        homeLabelTitle={homeLabel}
        awayLabelTitle={awayLabel}
        maxValue={Math.max(homeXg, awayXg, 0.5)}
      />
      {goalsFor ? (
        <p className="break-words px-1 text-center text-[10px] leading-snug text-muted">
          Season goals per game (model inputs): {homeShort} {goalsFor.home.toFixed(2)} · {awayShort}{" "}
          {goalsFor.away.toFixed(2)}
        </p>
      ) : null}
    </div>
  );
}

function HistoricalMarketCompare({
  label,
  tipLabel,
  tipBody,
  homeHistorical,
  awayHistorical,
  modelPct,
  homeShort,
  awayShort,
  sampleHome,
  sampleAway,
}: {
  label: string;
  tipLabel: string;
  tipBody: ReactNode;
  homeHistorical: number;
  awayHistorical: number;
  modelPct: number;
  homeShort: string;
  awayShort: string;
  sampleHome: number;
  sampleAway: number;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-white/25 bg-white/15 p-4 dark:border-slate-800/50 dark:bg-slate-900/25">
      <div className="flex items-center justify-center gap-1.5">
        <p className="text-center text-xs font-semibold text-foreground">{label}</p>
        <InfoTip label={tipLabel}>{tipBody}</InfoTip>
      </div>
      <DualHorizontalBar
        label="Historical (team trend)"
        homeValue={homeHistorical}
        awayValue={awayHistorical}
        homeLabel={homeShort}
        awayLabel={awayShort}
        maxValue={100}
        scaleAsPercent
      />
      <p className="text-center text-[10px] text-muted">
        Based on last {sampleHome} / {sampleAway} results per team
      </p>
      <div className="rounded-lg border border-dashed border-white/30 bg-foreground/5 px-3 py-2 text-center dark:border-slate-700/60">
        <p className="text-[10px] uppercase tracking-wide text-muted">Model (this fixture)</p>
        <p className="text-xl font-bold tabular-nums text-foreground">{modelPct}%</p>
      </div>
    </div>
  );
}

function FormTrendSection({
  comparison,
  homeLabel,
  awayLabel,
}: {
  comparison: TeamComparisonSnapshot;
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <ChartCard
      title="Recent form timeline"
      description="Up to ten recent matches - date, opponent, and score from this team's perspective (W/D/L badge)."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            {homeLabel}
          </p>
          <FormStrip matches={comparison.home.recentForm} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
            {awayLabel}
          </p>
          <FormStrip matches={comparison.away.recentForm} />
        </div>
      </div>
    </ChartCard>
  );
}

export function PredictionChartsIconRow() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-muted">
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary-emphasis">
        <Goal className="h-3 w-3" />
        Score markets
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-accent-emphasis">
        <BarChart3 className="h-3 w-3" />
        Goals O/U
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5">
        <TrendingUp className="h-3 w-3" />
        Form & xG
      </span>
    </div>
  );
}

"use client";

import { BarChart3, Goal, Layers, TrendingUp } from "lucide-react";
import type { PredictionAnalytics, PredictionResult } from "@/lib/types/prediction";
import type { TeamComparisonSnapshot, TeamFormMatch } from "@/lib/types/team-comparison";
import { ChartCard, ChartCardWithTip } from "./ChartCard";

function maxProb(cells: { probability: number }[]): number {
  return Math.max(...cells.map((c) => c.probability), 0.1);
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
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
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

function DualHorizontalBar({
  label,
  homeValue,
  awayValue,
  homeLabel,
  awayLabel,
  maxValue,
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  homeLabel: string;
  awayLabel: string;
  maxValue: number;
}) {
  return (
    <div className="space-y-2 border-b border-white/20 py-3 last:border-0 dark:border-slate-800/50">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-right text-[10px] font-semibold text-primary sm:w-20">
            {homeLabel}
          </span>
          <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="absolute right-0 top-0 h-full rounded-full bg-gradient-to-l from-primary to-primary-light"
              style={{ width: `${maxValue > 0 ? (homeValue / maxValue) * 100 : 0}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-primary">
            {homeValue}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-right text-[10px] font-semibold text-accent sm:w-20">
            {awayLabel}
          </span>
          <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="absolute right-0 top-0 h-full rounded-full bg-gradient-to-l from-accent to-accent-light"
              style={{ width: `${maxValue > 0 ? (awayValue / maxValue) * 100 : 0}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-accent">
            {awayValue}
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

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `auto repeat(${maxGoals + 1}, minmax(2.5rem, 1fr))`,
          }}
        >
          <div />
          {Array.from({ length: maxGoals + 1 }, (_, a) => (
            <div
              key={`away-h-${a}`}
              className="pb-1 text-center text-[10px] font-medium text-muted"
            >
              {a}
            </div>
          ))}
          {grid.map((row, h) => (
            <div key={`row-${h}`} className="contents">
              <div className="flex items-center pr-2 text-[10px] font-medium text-muted">
                {h}
              </div>
              {row.map((cell) => {
                const intensity = cell.probability / peak;
                return (
                  <div
                    key={`${cell.home}-${cell.away}`}
                    className="flex aspect-square min-h-[2.5rem] flex-col items-center justify-center rounded-lg border border-white/25 text-center transition dark:border-slate-700/40"
                    style={{
                      background: `color-mix(in srgb, var(--primary) ${Math.round(intensity * 55)}%, transparent)`,
                    }}
                    title={`${cell.home}-${cell.away}: ${cell.probability}%`}
                  >
                    <span className="text-[10px] font-bold text-foreground">
                      {cell.home}-{cell.away}
                    </span>
                    <span className="text-[9px] tabular-nums text-muted">
                      {cell.probability > 0 ? `${cell.probability}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[10px] text-muted">
          Rows: {homeLabel} goals · Columns: {awayLabel} goals
        </p>
      </div>
    </div>
  );
}

function formatFormMatchDate(isoDate: string): string {
  const kickoff = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(kickoff.getTime())) return isoDate;
  return kickoff.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function FormStrip({ matches }: { matches: TeamFormMatch[] }) {
  const recent = matches.slice(0, 5);

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
            <div className="grid grid-cols-2 gap-3 text-center">
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
    <div className="rounded-xl border border-white/25 bg-white/20 px-2 py-2 dark:border-slate-800/50 dark:bg-slate-900/30">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${text}`}>
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
  const comparison = result.teamComparison;

  if (!analytics) return null;

  const topScoreMax = maxProb(analytics.topScores);
  const ouMax = Math.max(...analytics.overUnder.flatMap((l) => [l.overPct, l.underPct]), 1);
  const goalsMax = Math.max(
    ...analytics.totalGoalsDistribution.map((g) => g.probability),
    1
  );
  const statMax = Math.max(
    ...analytics.statComparison.flatMap((s) => [s.home, s.away]),
    0.1
  );

  return (
    <section className="space-y-6" aria-label="Prediction charts">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary-emphasis">
          <BarChart3 className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Statistical insights</h3>
          <p className="text-xs text-muted">
            Charts derived from our Poisson goal model and synced season data — useful for match
            result, goals, and team form markets.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCardWithTip
          title="Correct score heatmap"
          tipLabel="Correct score heatmap"
          tipBody={
            <>
              Each cell is the model&apos;s estimated chance of that exact scoreline (e.g. 2-1).
              Darker cells are more likely — popular for correct-score and scorecast-style bets.
            </>
          }
          className="lg:col-span-2"
        >
          <ScoreHeatmap
            cells={analytics.scoreHeatmap}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
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
          title="Goals markets (Over / Under)"
          tipLabel="Over/Under goals"
          tipBody={
            <>
              Chance of total goals going over or under common lines (1.5, 2.5, 3.5). Based on the
              same expected-goals model as the main prediction.
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

        <ChartCardWithTip
          title="Both teams to score (BTTS)"
          tipLabel="Both teams to score"
          tipBody={
            <>
              Estimated chance both teams score at least once. High when both xG values are strong;
              low when one side is expected to shut out the other.
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex items-end justify-between gap-2 pt-2" style={{ minHeight: "8rem" }}>
            {analytics.totalGoalsDistribution.map((g) => (
              <div key={g.goals} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-semibold tabular-nums text-muted">
                  {g.probability}%
                </span>
                <div
                  className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-primary/80 to-primary-light/60"
                  style={{
                    height: `${Math.max(8, (g.probability / goalsMax) * 96)}px`,
                  }}
                />
                <span className="text-[10px] font-medium text-foreground">{g.goals}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">Total goals in match</p>
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Expected goals (xG) comparison"
          tipLabel="xG comparison"
          tipBody={
            <>
              Side-by-side expected goals after all model adjustments. The taller bar suggests more
              scoring chances — not a guaranteed goal count.
            </>
          }
        >
          <DualHorizontalBar
            label="Expected goals"
            homeValue={result.expectedGoals.home}
            awayValue={result.expectedGoals.away}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            maxValue={Math.max(result.expectedGoals.home, result.expectedGoals.away, 0.5)}
          />
        </ChartCardWithTip>

        <ChartCardWithTip
          title="Form & momentum"
          tipLabel="Form and momentum"
          tipBody={
            <>
              <strong>Form score</strong> reflects recent results (recent games weighted more).{" "}
              <strong>Momentum index</strong> blends form (35%) and head-to-head history (65%) into
              one number — positive favours the home side in our model.
            </>
          }
        >
          <div className="space-y-4">
            <DualHorizontalBar
              label="Form score"
              homeValue={analytics.formScores.homePct}
              awayValue={analytics.formScores.awayPct}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
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
              <MiniStat label="H2H home win" value={`${analytics.h2h.homeWinPct}%`} />
              <MiniStat label="H2H draw" value={`${analytics.h2h.drawPct}%`} />
              <MiniStat label="H2H away win" value={`${analytics.h2h.awayWinPct}%`} />
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
                homeLabel={homeLabel}
                awayLabel={awayLabel}
                maxValue={statMax}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/15 px-2 py-2 text-center dark:border-slate-800/50 dark:bg-slate-900/25">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="text-sm font-bold tabular-nums text-foreground">{value}</p>
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
      description="Last five matches — date, opponent, and score from this team's perspective (W/D/L badge)."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <TrendingUp className="h-3.5 w-3.5" />
            {homeLabel}
          </p>
          <FormStrip matches={comparison.home.recentForm} />
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-accent">
            <Layers className="h-3.5 w-3.5" />
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

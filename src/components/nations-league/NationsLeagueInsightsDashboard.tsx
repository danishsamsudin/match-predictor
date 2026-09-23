"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { InsightCard } from "@/components/glpm/insights/InsightCard";
import {
  BttsPanel,
  DoubleChanceList,
  KpiMeter,
  OutcomeBar,
  OuLadderBars,
  RelativeScaleRadarChart,
  TeamTotalsTable,
} from "@/components/glpm/insights/charts";
import { LineupWhatIfEditor } from "@/components/LineupWhatIfEditor";
import { NationalClubStyleOddsPanel } from "@/components/NationalClubStyleOddsPanel";
import { PlayerPropsPanel } from "@/components/PlayerPropsPanel";
import { TeamComparisonPanel } from "@/components/TeamComparisonPanel";
import { InfoTip } from "@/components/ui/InfoTip";
import { findNationsLeagueTeamByName } from "@/lib/data/nations-league-2026-teams";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import {
  SCORE_HEATMAP_MAX_GOALS,
  sliceScoreMatrix,
} from "@/lib/glpm-cx/derived-markets";
import {
  getExplanationTip,
  normalizeExplanationText,
} from "@/lib/prediction/explanation-glossary";
import type { FixtureLineup } from "@/lib/types/football";
import type { PredictionResult, ScoreCell } from "@/lib/types/prediction";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function oddsLabel(p: number): string {
  return fairOddsFromProb(p)?.toFixed(2) ?? "-";
}

function cellsToMatrix(cells: ScoreCell[]): number[][] {
  let maxH = 0;
  let maxA = 0;
  for (const c of cells) {
    maxH = Math.max(maxH, c.home);
    maxA = Math.max(maxA, c.away);
  }
  const size = Math.max(maxH, maxA, SCORE_HEATMAP_MAX_GOALS) + 1;
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (const c of cells) {
    if (matrix[c.home]?.[c.away] != null) {
      matrix[c.home][c.away] = c.probability / 100;
    }
  }
  return matrix;
}

function ScoreHeatmap({
  cells,
  homeLabel,
  awayLabel,
}: {
  cells: ScoreCell[];
  homeLabel: string;
  awayLabel: string;
}) {
  const matrix = useMemo(() => cellsToMatrix(cells), [cells]);
  const { grid, tailMass } = sliceScoreMatrix(matrix, SCORE_HEATMAP_MAX_GOALS);
  const maxP = Math.max(...grid.flat(), 1e-9);
  const top = [...cells].sort((a, b) => b.probability - a.probability).slice(0, 5);
  const topMax = top[0]?.probability ?? 1e-9;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] lg:items-start">
      <div>
        <p className="mb-2 text-[11px] text-muted">
          Home goals down the side, away across the top.
        </p>
        <div className="table-h-scroll">
          <table className="mx-auto border-collapse text-[10px] sm:text-xs">
            <thead>
              <tr>
                <th className="p-1 text-muted">
                  {homeLabel.slice(0, 3)}\{awayLabel.slice(0, 3)}
                </th>
                {grid[0]?.map((_, a) => (
                  <th key={a} className="p-1 font-medium tabular-nums text-muted">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, h) => (
                <tr key={h}>
                  <th className="p-1 font-medium tabular-nums text-muted">{h}</th>
                  {row.map((p, a) => {
                    const intensity = p / maxP;
                    return (
                      <td key={a} className="p-0.5" title={`${h}-${a}: ${pct(p)}`}>
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-md tabular-nums sm:h-9 sm:w-9"
                          style={{
                            backgroundColor: `color-mix(in srgb, var(--color-primary, #0ea5e9) ${Math.round(intensity * 85)}%, transparent)`,
                            color: intensity > 0.55 ? "white" : undefined,
                          }}
                        >
                          {(p * 100).toFixed(1)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tailMass > 0.004 ? (
          <p className="mt-2 text-center text-[11px] text-muted">
            5+ goals on either side: {pct(tailMass)} combined
          </p>
        ) : null}
      </div>
      <div className="rounded-2xl border border-glass-border bg-surface/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Most likely scorelines
        </p>
        <ol className="mt-3 space-y-2.5">
          {top.map((s, i) => (
            <li key={`${s.home}-${s.away}`} className="flex items-center gap-3">
              <span className="w-4 text-[11px] tabular-nums text-muted">{i + 1}</span>
              <span className="w-12 text-sm font-bold tabular-nums text-foreground">
                {s.home}-{s.away}
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(s.probability / topMax) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right text-xs font-medium tabular-nums">
                {s.probability.toFixed(1)}%
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function FormMomentumCard({
  result,
  homeLabel,
  awayLabel,
}: {
  result: PredictionResult;
  homeLabel: string;
  awayLabel: string;
}) {
  const analytics = result.analytics;
  if (!analytics) return null;

  return (
    <InsightCard
      title="Form & momentum"
      howToRead="Form score reflects recent results. Momentum blends form and head-to-head when available."
      tipLabel="Form and momentum"
      tipBody={
        <>
          <strong>Form score</strong> reflects recent results (recent games weighted more).{" "}
          <strong>Momentum index</strong> blends recent form and head-to-head history - positive
          favours the home side.
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiMeter
          label={`${homeLabel} form`}
          value={`${analytics.formScores.homePct.toFixed(0)}%`}
          accent="primary"
        />
        <KpiMeter
          label={`${awayLabel} form`}
          value={`${analytics.formScores.awayPct.toFixed(0)}%`}
          accent="accent"
        />
      </div>
      <div className="mt-3 rounded-xl border border-glass-border bg-surface/50 px-4 py-3 text-center">
        <p className="text-[10px] uppercase tracking-wide text-muted">Momentum index</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
          {analytics.momentumIndex}
        </p>
        <p className="mt-1 text-[10px] text-muted">
          &gt;0 leans home · &lt;0 leans away · 0 is neutral
        </p>
      </div>
      {analytics.h2h.hasData === false ? (
        <div
          className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-foreground/90 dark:border-amber-400/25 dark:bg-amber-400/10"
          role="note"
        >
          <p className="font-medium text-amber-950 dark:text-amber-100">
            No head-to-head history
          </p>
          <p className="mt-1 text-muted">
            These teams have no recent meetings in our database. Percentages below show the
            model&apos;s 1X2 probabilities from the Graham score grid.
          </p>
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <p className="col-span-full text-center text-[10px] font-medium uppercase tracking-wide text-muted">
          {analytics.h2h.hasData !== false
            ? "Head-to-head outcome rates"
            : "Model 1X2 probabilities"}
        </p>
        <KpiMeter
          label={`${homeLabel} win`}
          value={`${analytics.h2h.homeWinPct}%`}
          accent="primary"
        />
        <KpiMeter label="Draw" value={`${analytics.h2h.drawPct}%`} accent="neutral" />
        <KpiMeter
          label={`${awayLabel} win`}
          value={`${analytics.h2h.awayWinPct}%`}
          accent="accent"
        />
      </div>
    </InsightCard>
  );
}

function HistoricalMarketsCard({
  result,
  homeLabel,
  awayLabel,
}: {
  result: PredictionResult;
  homeLabel: string;
  awayLabel: string;
}) {
  const hist = result.analytics?.historicalMarkets;
  const analytics = result.analytics;
  if (!hist || !analytics) return null;

  const over25 = analytics.overUnder.find((l) => l.line === 2.5)?.overPct ?? 0;

  return (
    <InsightCard
      title="Historical vs model markets"
      howToRead="Historical bars use each team's past results. Model % is for this fixture only."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            BTTS yes %
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-primary">{homeLabel}</span>
              <span className="tabular-nums font-semibold">
                {hist.home.bttsYesPct.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-accent">{awayLabel}</span>
              <span className="tabular-nums font-semibold">
                {hist.away.bttsYesPct.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between gap-2 border-t border-glass-border pt-2">
              <span className="text-muted">Model</span>
              <span className="tabular-nums font-semibold">{analytics.btts.yesPct}%</span>
            </div>
            <p className="text-[11px] text-muted">
              Samples: {hist.home.sampleSize} / {hist.away.sampleSize}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Over 2.5 %
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-primary">{homeLabel}</span>
              <span className="tabular-nums font-semibold">
                {hist.home.over25Pct.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-accent">{awayLabel}</span>
              <span className="tabular-nums font-semibold">
                {hist.away.over25Pct.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between gap-2 border-t border-glass-border pt-2">
              <span className="text-muted">Model</span>
              <span className="tabular-nums font-semibold">{over25.toFixed(1)}%</span>
            </div>
            <p className="text-[11px] text-muted">
              Samples: {hist.home.sampleSize} / {hist.away.sampleSize}
            </p>
          </div>
        </div>
      </div>
    </InsightCard>
  );
}

function AnalysisBreakdown({ explanation }: { explanation: string }) {
  const sections = useMemo(() => {
    const out: { title: string; lines: string[] }[] = [];
    let current: { title: string; lines: string[] } | null = null;
    for (const line of explanation.split("\n")) {
      if (line.startsWith("## ")) {
        if (current) out.push(current);
        current = { title: line.slice(3).trim(), lines: [] };
      } else if (line.trim() && current) {
        current.lines.push(line.trim());
      }
    }
    if (current) out.push(current);
    return out;
  }, [explanation]);

  if (!sections.length) {
    return (
      <p className="text-sm text-muted">{normalizeExplanationText(explanation)}</p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div
          key={section.title}
          className="rounded-xl border border-glass-border bg-surface/50 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {section.title}
          </p>
          <ul className="mt-2 space-y-1.5">
            {section.lines.slice(0, 4).map((line) => {
              const display = normalizeExplanationText(line.replace(/^-\s*/, ""));
              const tip = getExplanationTip(section.title, display);
              return (
                <li
                  key={`${section.title}-${line}`}
                  className="flex gap-2 text-sm leading-relaxed text-muted"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="flex min-w-0 flex-1 items-start gap-1.5">
                    <span className="min-w-0 flex-1">{display}</span>
                    {tip ? <InfoTip label={tip.label}>{tip.body}</InfoTip> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function NationsLeagueInsightsDashboard({
  result,
  onRerunWithLineups,
  loading,
  matchKey,
}: {
  result: PredictionResult;
  onRerunWithLineups?: (lineups: FixtureLineup[]) => void;
  loading?: boolean;
  matchKey?: string;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";
  const analytics = result.analytics;
  const derived = result.derivedMarkets;

  const homeTeamId =
    result.teamComparison?.home.teamId ??
    findNationsLeagueTeamByName(homeLabel)?.id ??
    0;
  const awayTeamId =
    result.teamComparison?.away.teamId ??
    findNationsLeagueTeamByName(awayLabel)?.id ??
    0;

  const over25Pct =
    analytics?.overUnder.find((l) => l.line === 2.5)?.overPct ?? null;
  const bttsYesPct = analytics?.btts.yesPct ?? null;

  const ouData =
    analytics?.overUnder
      .slice()
      .sort((a, b) => a.line - b.line)
      .map((line) => ({
        line: `O/U ${line.line}`,
        over: line.overPct,
        under: line.underPct,
      })) ?? [];

  const marginMax = Math.max(
    ...(analytics?.handicapMarkets.winningMargins.map((m) => m.probabilityPct) ?? [1]),
    1
  );

  const showLineupEditor =
    onRerunWithLineups &&
    result.lineupSource !== "model_xi" &&
    !(result.entityType === "national" && result.mode === "compare");

  return (
    <div className="liquid-glass-panel min-w-0 max-w-full overflow-x-auto rounded-2xl sm:rounded-[2rem]">
      <div className="border-b border-glass-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
            {homeLabel} <span className="font-normal text-muted">vs</span> {awayLabel}
          </h2>
          {result.mode === "compare" ? (
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent-emphasis">
              Hypothetical match
            </span>
          ) : null}
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary-emphasis">
            Nations League
          </span>
          {result.lineupSource === "manual_xi" ? (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Player xG · Your XI
            </span>
          ) : null}
          {result.lineupSource === "model_xi" ? (
            <span className="rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              Team xG · Model squad
            </span>
          ) : null}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Graham model for UEFA Nations League - expected goals, markets, and edges in the same
          layout as club insights.
        </p>
      </div>

      <div className="min-w-0 space-y-6 p-4 sm:p-6">
        {/* 1. Match overview */}
        <InsightCard
          title="Match overview"
          howToRead="1X2 probabilities and key KPIs for this Nations League fixture."
          tipLabel="Match overview"
          tipBody={
            <>
              Win probabilities and fair odds come from the Graham score grid. xG is expected
              goals after form, ratings, and context adjustments.
            </>
          }
        >
          <div className="space-y-4">
            <OutcomeBar
              home={result.homeWinPct / 100}
              draw={result.drawPct / 100}
              away={result.awayWinPct / 100}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
              homeTeamId={homeTeamId}
              awayTeamId={awayTeamId}
              entityType="national"
            />
            <div className="grid grid-cols-2 gap-3">
              <KpiMeter
                label={`${homeLabel} xG`}
                value={fmt(result.expectedGoals.home)}
                accent="primary"
                hint="Expected goals"
              />
              <KpiMeter
                label={`${awayLabel} xG`}
                value={fmt(result.expectedGoals.away)}
                accent="accent"
                hint="Expected goals"
              />
              <KpiMeter
                label="Over 2.5"
                value={over25Pct != null ? `${over25Pct.toFixed(1)}%` : "-"}
                hint="Model probability"
              />
              <KpiMeter
                label="BTTS yes"
                value={bttsYesPct != null ? `${bttsYesPct.toFixed(1)}%` : "-"}
              />
              <KpiMeter
                label="Fair home"
                value={oddsLabel(result.homeWinPct / 100)}
                hint="1 / model %"
                accent="primary"
              />
              <KpiMeter
                label="Fair away"
                value={oddsLabel(result.awayWinPct / 100)}
                hint="1 / model %"
                accent="accent"
              />
            </div>
          </div>
        </InsightCard>

        {/* 2. Side-by-side team context */}
        {result.teamComparison ? (
          <InsightCard
            title="Team comparison"
            howToRead="Season averages and recent results for both nations."
          >
            <TeamComparisonPanel comparison={result.teamComparison} embedded />
          </InsightCard>
        ) : null}

        {showLineupEditor ? (
          <LineupWhatIfEditor
            result={result}
            onRerun={onRerunWithLineups!}
            loading={loading}
          />
        ) : null}

        {/* 3. Goal markets */}
        {analytics && ouData.length ? (
          <InsightCard
            title="Goal markets"
            howToRead="Over/Under ladder, BTTS, and double chance from the same score grid."
          >
            <OuLadderBars data={ouData} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-stretch">
              <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  BTTS
                </p>
                <BttsPanel
                  yes={analytics.btts.yesPct / 100}
                  no={analytics.btts.noPct / 100}
                />
              </div>
              <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Double chance
                </p>
                {derived?.doubleChance ? (
                  <DoubleChanceList
                    rows={[
                      {
                        code: "1X",
                        label: "Home or draw",
                        prob: derived.doubleChance.homeOrDraw,
                      },
                      {
                        code: "12",
                        label: "Either team wins",
                        prob: derived.doubleChance.homeOrAway,
                      },
                      {
                        code: "X2",
                        label: "Draw or away",
                        prob: derived.doubleChance.drawOrAway,
                      },
                    ]}
                  />
                ) : (
                  <DoubleChanceList
                    rows={[
                      {
                        code: "1X",
                        label: "Home or draw",
                        prob: (result.homeWinPct + result.drawPct) / 100,
                      },
                      {
                        code: "12",
                        label: "Either team wins",
                        prob: (result.homeWinPct + result.awayWinPct) / 100,
                      },
                      {
                        code: "X2",
                        label: "Draw or away",
                        prob: (result.drawPct + result.awayWinPct) / 100,
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </InsightCard>
        ) : null}

        {/* 4. Score matrix */}
        {analytics?.scoreHeatmap?.length ? (
          <InsightCard
            title="Score probability matrix"
            howToRead="Each cell is the chance of that exact scoreline. Darker cells are more likely."
          >
            <ScoreHeatmap
              cells={analytics.scoreHeatmap}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </InsightCard>
        ) : null}

        {/* Total goals distribution */}
        {analytics?.totalGoalsDistribution?.length ? (
          <InsightCard
            title="Total goals distribution"
            howToRead="How likely each total goal count is (0, 1, 2, 3…)."
          >
            <div className="flex items-end justify-between gap-1.5 pt-2 sm:gap-2">
              {(() => {
                const goalsMax = Math.max(
                  ...analytics.totalGoalsDistribution.map((g) => g.probability),
                  1
                );
                return analytics.totalGoalsDistribution.map((g) => (
                  <div
                    key={g.goals}
                    className="flex w-7 flex-1 flex-col items-center gap-1 sm:w-8"
                  >
                    <span className="text-[9px] font-semibold tabular-nums text-muted sm:text-[10px]">
                      {g.probability}%
                    </span>
                    <div
                      className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-primary/80 to-primary-light/60"
                      style={{
                        height: `${Math.max(8, (g.probability / goalsMax) * 96)}px`,
                      }}
                    />
                    <span className="text-[9px] font-medium text-foreground sm:text-[10px]">
                      {g.goals}
                    </span>
                  </div>
                ));
              })()}
            </div>
            <p className="mt-2 text-center text-[10px] text-muted">Total goals in match</p>
          </InsightCard>
        ) : null}

        {/* Season averages */}
        {analytics?.statComparison?.length ? (
          <InsightCard
            title="Season stat comparison"
            howToRead="Radar uses relative scaling per metric so close ratings still separate. Side panel shows the raw numbers."
            tipLabel="Season stat comparison"
            tipBody={
              <>
                Each axis is scaled around that metric&apos;s home/away pair (not from zero), so
                gaps like Elo 1479 vs 1459 remain visible. Hover a spoke for exact values.
              </>
            }
          >
            <RelativeScaleRadarChart
              data={analytics.statComparison.map((row) => ({
                dimension: row.metric,
                home: row.home,
                away: row.away,
              }))}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </InsightCard>
        ) : null}

        {/* 5. Winning margins + team totals */}
        {analytics?.handicapMarkets.winningMargins.length || derived?.teamTotals?.length ? (
          <InsightCard
            title="Margins & team totals"
            howToRead="Winning margins and each side's goal totals from the Graham grid."
          >
            {analytics?.handicapMarkets.winningMargins.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {homeLabel}
                  </p>
                  {analytics.handicapMarkets.winningMargins
                    .filter((m) => m.side === "home")
                    .map((m) => (
                      <div key={`home-${m.margin}`}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>Win by +{m.margin}</span>
                          <span className="tabular-nums font-semibold">
                            {m.probabilityPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${(m.probabilityPct / marginMax) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                    {awayLabel}
                  </p>
                  {analytics.handicapMarkets.winningMargins
                    .filter((m) => m.side === "away")
                    .map((m) => (
                      <div key={`away-${m.margin}`}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>Win by +{m.margin}</span>
                          <span className="tabular-nums font-semibold">
                            {m.probabilityPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{
                              width: `${(m.probabilityPct / marginMax) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
            {derived?.teamTotals?.length ? (
              <div className={analytics?.handicapMarkets.winningMargins.length ? "mt-4" : ""}>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Team totals
                </p>
                <TeamTotalsTable
                  rows={derived.teamTotals}
                  homeLabel={homeLabel}
                  awayLabel={awayLabel}
                />
              </div>
            ) : null}
          </InsightCard>
        ) : null}

        {/* 6. First team to score */}
        {result.firstTeamToScorePct ? (
          <InsightCard
            title="First team to score"
            howToRead="Chance each side scores first. No goal means a 0-0."
          >
            <div className="grid min-w-0 grid-cols-3 gap-2 text-center">
              <KpiMeter
                label={homeLabel}
                value={`${result.firstTeamToScorePct.home}%`}
                accent="primary"
              />
              <KpiMeter
                label="No goal"
                value={`${result.firstTeamToScorePct.none}%`}
                accent="neutral"
              />
              <KpiMeter
                label={awayLabel}
                value={`${result.firstTeamToScorePct.away}%`}
                accent="accent"
              />
            </div>
          </InsightCard>
        ) : null}

        <FormMomentumCard result={result} homeLabel={homeLabel} awayLabel={awayLabel} />
        <HistoricalMarketsCard result={result} homeLabel={homeLabel} awayLabel={awayLabel} />

        {/* 7. Value board */}
        <NationalClubStyleOddsPanel result={result} hideAsianHandicap />

        {/* 8. Player props */}
        {result.playerProps ? (
          <PlayerPropsPanel
            props={result.playerProps}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            matchKey={
              matchKey ??
              `${result.homeTeamName ?? "home"}-${result.awayTeamName ?? "away"}`
            }
          />
        ) : null}

        {/* 9. Analysis */}
        <div>
          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex w-full items-center justify-between rounded-2xl border border-glass-border bg-surface/60 px-4 py-3 text-sm font-medium transition hover:bg-surface"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-emphasis">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              Analysis breakdown
            </span>
            {showExplanation ? (
              <ChevronUp className="h-4 w-4 text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted" />
            )}
          </button>
          {showExplanation ? (
            <div className="mt-3">
              <AnalysisBreakdown explanation={result.explanation} />
            </div>
          ) : null}
        </div>

        {result.modelVersion ? (
          <p className="text-center text-[11px] text-muted">{result.modelVersion}</p>
        ) : null}
      </div>
    </div>
  );
}

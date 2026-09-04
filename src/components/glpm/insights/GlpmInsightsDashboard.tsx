"use client";

import { useMemo, useState } from "react";
import { InsightCard } from "@/components/glpm/insights/InsightCard";
import {
  CHART_COLORS,
  BttsPanel,
  CxFactorPanel,
  DomainCompareList,
  DoubleChanceList,
  DualRadarChart,
  EdgeBars,
  FinishingCompare,
  GroupedCompareBars,
  KpiMeter,
  MatchupTugList,
  OutcomeDonut,
  OuLadderBars,
  RestDaysCompare,
  StyleClashPills,
  TeamTotalsTable,
  type CxFactorStep,
} from "@/components/glpm/insights/charts";
import { InfoTip } from "@/components/ui/InfoTip";
import type { GlpmCxPredictPayload } from "@/lib/glpm-cx/run-cx-predict";
import { GLPM_CX_GLOSSARY, glossaryTipBody } from "@/lib/glpm-cx/glossary";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import { PRIMARY_LABELS, PRIMARY_ORDER } from "@/lib/glpm/engine";
import {
  ATTACK_DOMAINS,
  DEFENCE_DOMAINS,
  GK_DOMAINS,
  isSharedCeiling,
} from "@/lib/glpm/load-insight-ratings";
import {
  deriveMarketsFromScoreMatrix,
  inferStyleLabels,
  sliceScoreMatrix,
  SCORE_HEATMAP_MAX_GOALS,
} from "@/lib/glpm-cx/derived-markets";
import { computeValueEdges } from "@/lib/prediction/odds-value";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function formatStyle(raw: string): string {
  return raw.replace(/_/g, " ");
}

function ScoreHeatmap({
  matrix,
  homeLabel,
  awayLabel,
}: {
  matrix: number[][];
  homeLabel: string;
  awayLabel: string;
}) {
  const { grid, tailMass } = sliceScoreMatrix(matrix, SCORE_HEATMAP_MAX_GOALS);
  const maxP = Math.max(...grid.flat(), 1e-9);
  const top: Array<{ h: number; a: number; p: number }> = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      top.push({ h, a, p: matrix[h][a] });
    }
  }
  top.sort((x, y) => y.p - x.p);
  const top5 = top.slice(0, 5);
  const topMax = top5[0]?.p ?? 1e-9;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] lg:items-start">
      <div>
        <p className="mb-2 text-[11px] text-muted">
          Home goals down the side, away across the top.
        </p>
        <div className="overflow-x-auto">
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
          {top5.map((s, i) => (
            <li key={`${s.h}-${s.a}`} className="flex items-center gap-3">
              <span className="w-4 text-[11px] tabular-nums text-muted">{i + 1}</span>
              <span className="w-12 text-sm font-bold tabular-nums text-foreground">
                {s.h}-{s.a}
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(s.p / topMax) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right text-xs font-medium tabular-nums">
                {pct(s.p)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ValueOpportunitiesPanel({
  payload,
  useCx,
}: {
  payload: GlpmCxPredictPayload;
  useCx: boolean;
}) {
  const markets = useCx
    ? payload.cx
    : {
        homeWin: payload.base.homeWin,
        draw: payload.base.draw,
        awayWin: payload.base.awayWin,
        bttsYes: payload.base.bttsYes,
        bttsNo: payload.base.bttsNo,
        overUnder: payload.base.overUnder,
      };

  const activeDerived = useMemo(() => {
    if (useCx) return payload.cx.derived;
    return deriveMarketsFromScoreMatrix({
      scoreMatrix: payload.base.scoreMatrix,
      homeWin: payload.base.homeWin,
      draw: payload.base.draw,
      awayWin: payload.base.awayWin,
      bttsYes: payload.base.bttsYes,
      bttsNo: payload.base.bttsNo,
      overUnder: payload.base.overUnder,
    });
  }, [useCx, payload]);

  const [book, setBook] = useState({
    home: "",
    draw: "",
    away: "",
    bttsYes: "",
    over25: "",
    ahHome: "",
  });

  const rows = useMemo(() => {
    const parse = (s: string) => {
      const n = Number(s.trim());
      return Number.isFinite(n) && n > 1 ? n : null;
    };
    const out: Array<{
      market: string;
      modelProb: number;
      fairOdds: number | null;
      bookOdds: number | null;
      edgePct: number | null;
    }> = [];

    const push = (
      market: string,
      modelProb: number,
      bookOdds: number | null
    ) => {
      const fairOdds = fairOddsFromProb(modelProb);
      const edgePct =
        bookOdds != null && modelProb > 0
          ? (modelProb * bookOdds - 1) * 100
          : null;
      out.push({ market, modelProb, fairOdds, bookOdds, edgePct });
    };

    push("Home win", markets.homeWin, parse(book.home));
    push("Draw", markets.draw, parse(book.draw));
    push("Away win", markets.awayWin, parse(book.away));
    push("BTTS yes", markets.bttsYes, parse(book.bttsYes));
    const ou = markets.overUnder["2.5"];
    push("Over 2.5", ou?.over ?? 0, parse(book.over25));
    const ah = activeDerived.asianHandicap.find((l) => l.line === -0.5);
    if (ah) push("AH home -0.5", ah.homeCover, parse(book.ahHome));

    return out;
  }, [book, markets, activeDerived]);

  const oneX2Edges = useMemo(() => {
    const h = Number(book.home);
    const d = Number(book.draw);
    const a = Number(book.away);
    if (!(h > 1 && d > 1 && a > 1)) return null;
    return computeValueEdges(
      {
        homeWinPct: markets.homeWin * 100,
        drawPct: markets.draw * 100,
        awayWinPct: markets.awayWin * 100,
      },
      { home: h, draw: d, away: a }
    );
  }, [book, markets]);

  const edgeChart = rows
    .filter((r) => r.edgePct != null)
    .map((r) => ({ market: r.market, edgePct: r.edgePct as number }));

  return (
    <InsightCard
      title="Value opportunities"
      glossaryKey="valueEdge"
      howToRead="Enter book decimal odds to compare with model fair odds. Positive edge means the book price is longer than the model."
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["home", "Home"],
            ["draw", "Draw"],
            ["away", "Away"],
            ["bttsYes", "BTTS yes"],
            ["over25", "Over 2.5"],
            ["ahHome", "AH -0.5"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
            <input
              className="w-full rounded-lg border border-glass-border bg-surface px-2 py-1.5 text-sm tabular-nums"
              inputMode="decimal"
              placeholder="e.g. 2.10"
              value={book[key]}
              onChange={(e) => setBook((b) => ({ ...b, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      {oneX2Edges ? (
        <p className="mb-3 text-xs text-muted">
          1X2 MPTO edges: H {oneX2Edges.homeEdgePct.toFixed(1)}% · D{" "}
          {oneX2Edges.drawEdgePct.toFixed(1)}% · A {oneX2Edges.awayEdgePct.toFixed(1)}%
        </p>
      ) : null}

      {edgeChart.length ? <EdgeBars data={edgeChart} /> : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-glass-border text-[11px] uppercase text-muted">
              <th className="py-2 pr-2">Market</th>
              <th className="py-2 pr-2">Model %</th>
              <th className="py-2 pr-2">Fair odds</th>
              <th className="py-2 pr-2">Book</th>
              <th className="py-2">Edge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.market} className="border-b border-glass-border/60">
                <td className="py-2 pr-2 font-medium">{r.market}</td>
                <td className="py-2 pr-2 tabular-nums">{pct(r.modelProb)}</td>
                <td className="py-2 pr-2 tabular-nums">
                  {r.fairOdds?.toFixed(2) ?? "-"}
                </td>
                <td className="py-2 pr-2 tabular-nums">
                  {r.bookOdds?.toFixed(2) ?? "-"}
                </td>
                <td
                  className={`py-2 tabular-nums font-semibold ${
                    r.edgePct == null
                      ? "text-muted"
                      : r.edgePct >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {r.edgePct == null
                    ? "-"
                    : `${r.edgePct >= 0 ? "+" : ""}${r.edgePct.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InsightCard>
  );
}

export function GlpmInsightsDashboard({
  payload,
}: {
  payload: GlpmCxPredictPayload;
}) {
  const [useCx, setUseCx] = useState(true);
  const homeLabel = payload.base.homeTeam.name;
  const awayLabel = payload.base.awayTeam.name;
  const markets = useCx ? payload.cx : {
    homeXg: payload.base.homeXg,
    awayXg: payload.base.awayXg,
    homeWin: payload.base.homeWin,
    draw: payload.base.draw,
    awayWin: payload.base.awayWin,
    bttsYes: payload.base.bttsYes,
    bttsNo: payload.base.bttsNo,
    overUnder: payload.base.overUnder,
    scoreMatrix: payload.base.scoreMatrix,
    derived: payload.cx.derived,
    modelVersion: payload.base.predModelVersion,
  };

  const radarData = PRIMARY_ORDER.map((key) => ({
    dimension: PRIMARY_LABELS[key],
    home: payload.base.homeTeam.ratings[key],
    away: payload.base.awayTeam.ratings[key],
  }));

  const hiddenDomains: string[] = [];
  const domainGroups = [
    {
      title: "Attack",
      rows: ATTACK_DOMAINS.map((d) => ({
        name: d[0].toUpperCase() + d.slice(1),
        home: payload.insights.home.domains[d] ?? 0,
        away: payload.insights.away.domains[d] ?? 0,
      })).filter((r) => {
        if (r.home <= 0 && r.away <= 0) return false;
        if (isSharedCeiling(r.home, r.away)) {
          hiddenDomains.push(r.name);
          return false;
        }
        return true;
      }),
    },
    {
      title: "Defence",
      rows: DEFENCE_DOMAINS.map((d) => ({
        name: d[0].toUpperCase() + d.slice(1),
        home: payload.insights.home.domains[d] ?? 0,
        away: payload.insights.away.domains[d] ?? 0,
      })).filter((r) => {
        if (r.home <= 0 && r.away <= 0) return false;
        if (isSharedCeiling(r.home, r.away)) {
          hiddenDomains.push(r.name);
          return false;
        }
        return true;
      }),
    },
    {
      title: "Goalkeeper",
      rows: GK_DOMAINS.map((d) => ({
        name: d === "goal_prevention" ? "Shot stopping" : "Involvement",
        home: payload.insights.home.domains[d] ?? 0,
        away: payload.insights.away.domains[d] ?? 0,
      })).filter((r) => {
        if (r.home <= 0 && r.away <= 0) return false;
        if (isSharedCeiling(r.home, r.away)) {
          hiddenDomains.push(r.name);
          return false;
        }
        return true;
      }),
    },
  ].filter((g) => g.rows.length);

  const interactionData = [
    {
      name: "Attack vs Defence",
      detail: "Home attack against away defence, and the reverse.",
      home: payload.base.interactions.home.attack_defence,
      away: payload.base.interactions.away.attack_defence,
    },
    {
      name: "Finishing vs Goalkeeper",
      detail: "Chance conversion against the opponent keeper.",
      home: payload.base.interactions.home.finishing_goalkeeper,
      away: payload.base.interactions.away.finishing_goalkeeper,
    },
    {
      name: "Build-up vs Pressing",
      detail: "Progression against the opponent's press.",
      home: payload.base.interactions.home.build_up_pressing,
      away: payload.base.interactions.away.build_up_pressing,
    },
    {
      name: "Possession vs Pressing",
      detail: "Territory control against the opponent's press.",
      home: payload.base.interactions.home.possession_pressing,
      away: payload.base.interactions.away.possession_pressing,
    },
  ];

  const ouData = Object.entries(markets.overUnder)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([line, probs]) => ({
      line: `O/U ${line}`,
      over: probs.over * 100,
      under: probs.under * 100,
    }));

  const buildCxSteps = (
    side: typeof payload.apply.home,
    travelKm: number,
    restDays: number | null,
    restNote: string | null,
    weatherSummary: string | null,
    lineupSummary: string
  ): CxFactorStep[] => {
    const factors: Array<{ name: string; multiplier: number; detail: string }> = [
      {
        name: "Rest",
        multiplier: side.restMult,
        detail:
          restNote ??
          `${restDays != null ? `${restDays.toFixed(1)} days` : "baseline"} since last match`,
      },
      {
        name: "Travel",
        multiplier: side.travelMult,
        detail: `${Math.round(travelKm)} km to the venue (penalty only above 500 km)`,
      },
      {
        name: "Altitude",
        multiplier: side.altitudeMult,
        detail:
          payload.context.venueAltitudeM != null
            ? `${Math.round(payload.context.venueAltitudeM)} m`
            : "No venue altitude on file",
      },
      {
        name: "Weather",
        multiplier: side.weatherMult,
        detail: weatherSummary ?? "No forecast nudge (needs heavy rain or high wind)",
      },
      {
        name: "Lineup",
        multiplier: side.lineupMult,
        detail: lineupSummary,
      },
    ];
    let running = side.baseXg;
    const steps: CxFactorStep[] = [
      {
        name: "GLPM base xG",
        multiplier: 1,
        xg: running,
        delta: 0,
        detail: "Frozen club model before context",
      },
    ];
    for (const f of factors) {
      const next = running * f.multiplier;
      steps.push({
        name: f.name,
        multiplier: f.multiplier,
        xg: next,
        delta: next - running,
        detail: f.detail,
      });
      running = next;
    }
    return steps;
  };

  const homeCxSteps = buildCxSteps(
    payload.apply.home,
    payload.context.homeTravelKm,
    payload.context.homeRestDays,
    payload.context.homeRestNote ?? null,
    payload.context.weatherSummary,
    payload.lineup.summary
  );
  const awayCxSteps = buildCxSteps(
    payload.apply.away,
    payload.context.awayTravelKm,
    payload.context.awayRestDays,
    payload.context.awayRestNote ?? null,
    payload.context.weatherSummary,
    payload.lineup.summary
  );

  const vsStyleBars = [
    ...payload.insights.homeVsStyle.slice(0, 4).map((r) => ({
      name: `${homeLabel.slice(0, 3)} vs ${formatStyle(r.style)}`,
      home: r.liftPct,
      away: 0,
    })),
    ...payload.insights.awayVsStyle.slice(0, 4).map((r) => ({
      name: `${awayLabel.slice(0, 3)} vs ${formatStyle(r.style)}`,
      home: 0,
      away: r.liftPct,
    })),
  ];

  const homeStyleLabels = inferStyleLabels({
    labels: payload.base.homeTeam.style?.labels ?? [],
    ratings: payload.base.homeTeam.ratings,
    avgPossession: payload.base.homeTeam.style?.avgPossession ?? null,
    avgPpda: payload.base.homeTeam.style?.avgPpda ?? null,
  });
  const awayStyleLabels = inferStyleLabels({
    labels: payload.base.awayTeam.style?.labels ?? [],
    ratings: payload.base.awayTeam.ratings,
    avgPossession: payload.base.awayTeam.style?.avgPossession ?? null,
    avgPpda: payload.base.awayTeam.style?.avgPpda ?? null,
  });

  const setPieceMissing =
    payload.insights.home.setPieceThreat == null &&
    payload.insights.away.setPieceThreat == null &&
    payload.insights.home.setPieceDefence == null &&
    payload.insights.away.setPieceDefence == null;
  const setPieceNoSignal =
    !setPieceMissing &&
    isSharedCeiling(
      payload.insights.home.setPieceThreat ?? 0,
      payload.insights.away.setPieceThreat ?? 0
    ) &&
    isSharedCeiling(
      payload.insights.home.setPieceDefence ?? 0,
      payload.insights.away.setPieceDefence ?? 0
    );
  const hasStyleMetrics =
    payload.base.homeTeam.style?.avgPossession != null ||
    payload.base.homeTeam.style?.avgPpda != null ||
    payload.base.awayTeam.style?.avgPossession != null ||
    payload.base.awayTeam.style?.avgPpda != null;

  return (
    <div className="liquid-glass-panel overflow-hidden rounded-2xl sm:rounded-[2rem]">
      <div className="border-b border-glass-border bg-gradient-to-r from-primary/10 via-transparent to-accent/10 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-foreground sm:text-xl">
            {homeLabel} <span className="font-normal text-muted">vs</span> {awayLabel}
          </h2>
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary-emphasis">
            GLPM clubs
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {payload.disclosure.title}
          </span>
          <InfoTip label={GLPM_CX_GLOSSARY.modelBadge.label}>
            {glossaryTipBody("modelBadge")}
          </InfoTip>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">
          {payload.disclosure.body}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUseCx(false)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              !useCx
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-surface text-muted ring-1 ring-glass-border"
            }`}
          >
            GLPM base
          </button>
          <button
            type="button"
            onClick={() => setUseCx(true)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              useCx
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-surface text-muted ring-1 ring-glass-border"
            }`}
          >
            GLPM-CX adjusted
          </button>
          <span className="text-[11px] text-muted">
            Viewing {useCx ? payload.cx.modelVersion : payload.base.predModelVersion}
          </span>
        </div>
      </div>

      <div className="min-w-0 space-y-6 p-4 sm:p-6">
        <InsightCard
          title="Match overview"
          glossaryKey="homeAwayXg"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <OutcomeDonut
              centerLabel="1X2"
              slices={[
                { name: homeLabel, value: markets.homeWin, color: CHART_COLORS.home },
                { name: "Draw", value: markets.draw, color: CHART_COLORS.draw },
                { name: awayLabel, value: markets.awayWin, color: CHART_COLORS.away },
              ]}
            />
            <div className="grid grid-cols-2 gap-3 content-center">
              <KpiMeter
                label={`${homeLabel} xG`}
                value={fmt(markets.homeXg)}
                hint={
                  useCx
                    ? `Base ${fmt(payload.base.homeXg)} → CX`
                    : "Frozen GLPM"
                }
                accent="primary"
              />
              <KpiMeter
                label={`${awayLabel} xG`}
                value={fmt(markets.awayXg)}
                hint={
                  useCx
                    ? `Base ${fmt(payload.base.awayXg)} → CX`
                    : "Frozen GLPM"
                }
                accent="accent"
              />
              <KpiMeter
                label="Fair home"
                value={fairOddsFromProb(markets.homeWin)?.toFixed(2) ?? "-"}
                hint="1 / model %"
              />
              <KpiMeter
                label="Fair away"
                value={fairOddsFromProb(markets.awayWin)?.toFixed(2) ?? "-"}
                hint="1 / model %"
                accent="accent"
              />
            </div>
          </div>
        </InsightCard>

        {useCx ? (
          <InsightCard title="How context changes xG" glossaryKey="xgWaterfall">
            <CxFactorPanel
              homeSteps={homeCxSteps}
              awaySteps={awayCxSteps}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
            <div className="mt-4">
              <RestDaysCompare
                homeDays={payload.context.homeRestDays}
                awayDays={payload.context.awayRestDays}
                homeNote={payload.context.homeRestNote ?? null}
                awayNote={payload.context.awayRestNote ?? null}
                homeLabel={homeLabel}
                awayLabel={awayLabel}
                estimated={payload.context.restIsEstimated ?? true}
              />
            </div>
          </InsightCard>
        ) : null}

        <InsightCard title="Primary ratings radar" glossaryKey="primaryRadar">
          <DualRadarChart data={radarData} homeLabel={homeLabel} awayLabel={awayLabel} />
        </InsightCard>

        {domainGroups.length ? (
          <InsightCard title="Domain breakdown" glossaryKey="domainBars">
            <DomainCompareList
              groups={domainGroups}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
            {hiddenDomains.length ? (
              <p className="mt-3 text-[11px] text-muted">
                Hidden (no trained signal): {hiddenDomains.join(", ")}.
              </p>
            ) : null}
          </InsightCard>
        ) : hiddenDomains.length ? (
          <InsightCard title="Domain breakdown" glossaryKey="domainBars">
            <p className="text-xs text-muted">
              Sub-skill ratings for this pair are all at the shared 100 ceiling, so
              there is nothing to compare yet.
            </p>
          </InsightCard>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <InsightCard title="Set-piece matchup" glossaryKey="setPieceGauge">
            {setPieceMissing || setPieceNoSignal ? (
              <p className="text-xs text-muted">
                Not available yet. Shot-level set-piece flags are missing, so every
                club is scored the same 100. That is not a real matchup.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-glass-border bg-surface/50 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Set-piece attack
                  </p>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-primary">
                      {homeLabel}{" "}
                      <strong className="tabular-nums">
                        {(payload.insights.home.setPieceThreat ?? 0).toFixed(1)}
                      </strong>
                    </span>
                    <span className="text-accent">
                      {awayLabel}{" "}
                      <strong className="tabular-nums">
                        {(payload.insights.away.setPieceThreat ?? 0).toFixed(1)}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-glass-border bg-surface/50 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Set-piece defence
                  </p>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-primary">
                      {homeLabel}{" "}
                      <strong className="tabular-nums">
                        {(payload.insights.home.setPieceDefence ?? 0).toFixed(1)}
                      </strong>
                    </span>
                    <span className="text-accent">
                      {awayLabel}{" "}
                      <strong className="tabular-nums">
                        {(payload.insights.away.setPieceDefence ?? 0).toFixed(1)}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </InsightCard>

          <InsightCard title="Style confrontation" glossaryKey="styleMatchup">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                  {homeLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {homeStyleLabels.map((l) => (
                    <span
                      key={`h-${l}`}
                      className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary"
                    >
                      {formatStyle(l)}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] tabular-nums text-muted">
                  Poss{" "}
                  {payload.base.homeTeam.style?.avgPossession != null
                    ? `${payload.base.homeTeam.style.avgPossession.toFixed(0)}%`
                    : "-"}
                  {" · "}
                  PPDA{" "}
                  {payload.base.homeTeam.style?.avgPpda != null
                    ? payload.base.homeTeam.style.avgPpda.toFixed(1)
                    : "-"}
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-accent">
                  {awayLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {awayStyleLabels.map((l) => (
                    <span
                      key={`a-${l}`}
                      className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent"
                    >
                      {formatStyle(l)}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] tabular-nums text-muted">
                  Poss{" "}
                  {payload.base.awayTeam.style?.avgPossession != null
                    ? `${payload.base.awayTeam.style.avgPossession.toFixed(0)}%`
                    : "-"}
                  {" · "}
                  PPDA{" "}
                  {payload.base.awayTeam.style?.avgPpda != null
                    ? payload.base.awayTeam.style.avgPpda.toFixed(1)
                    : "-"}
                </p>
              </div>
            </div>
            <StyleClashPills
              clashes={payload.insights.styleMatchups}
              formatLabel={formatStyle}
            />
            {!hasStyleMetrics ? (
              <p className="mt-3 text-[11px] text-muted">
                Possession and PPDA were not on the match stats for this season, so
                labels are inferred from primary ratings.
              </p>
            ) : null}
          </InsightCard>
        </div>

        <InsightCard title="Matchup interactions" glossaryKey="interactions">
          <MatchupTugList
            data={interactionData}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
        </InsightCard>

        {vsStyleBars.length ? (
          <InsightCard title="Historical lift vs opponent styles" glossaryKey="vsStyleLift">
            <GroupedCompareBars
              data={vsStyleBars}
              homeLabel={`${homeLabel} lift %`}
              awayLabel={`${awayLabel} lift %`}
              valueSuffix="%"
            />
            <ul className="mt-2 space-y-1 text-[11px] text-muted">
              {payload.insights.homeVsStyle.slice(0, 3).map((r) => (
                <li key={`h-${r.style}`}>
                  {homeLabel} vs {formatStyle(r.style)}: {r.liftPct >= 0 ? "+" : ""}
                  {r.liftPct}% (n={r.n})
                </li>
              ))}
              {payload.insights.awayVsStyle.slice(0, 3).map((r) => (
                <li key={`a-${r.style}`}>
                  {awayLabel} vs {formatStyle(r.style)}: {r.liftPct >= 0 ? "+" : ""}
                  {r.liftPct}% (n={r.n})
                </li>
              ))}
            </ul>
          </InsightCard>
        ) : null}

        {payload.insights.homeFinishingDelta || payload.insights.awayFinishingDelta ? (
          <InsightCard title="Finishing differential" glossaryKey="finishingDelta">
            <FinishingCompare
              home={payload.insights.homeFinishingDelta}
              away={payload.insights.awayFinishingDelta}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </InsightCard>
        ) : (
          <InsightCard title="Finishing differential" glossaryKey="finishingDelta">
            <p className="text-xs text-muted">
              No season goals and xG are available for this pair yet. The Finishing
              axis on the radar still reflects the trained rating.
            </p>
          </InsightCard>
        )}

        <InsightCard title="Goal markets" glossaryKey="overUnder">
          <OuLadderBars data={ouData} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-stretch">
            <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  BTTS
                </p>
                <InfoTip label={GLPM_CX_GLOSSARY.btts.label}>
                  {glossaryTipBody("btts")}
                </InfoTip>
              </div>
              <BttsPanel yes={markets.bttsYes} no={markets.bttsNo} />
            </div>
            <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Double chance
                </p>
                <InfoTip label={GLPM_CX_GLOSSARY.doubleChance.label}>
                  {glossaryTipBody("doubleChance")}
                </InfoTip>
              </div>
              <DoubleChanceList
                rows={[
                  {
                    code: "1X",
                    label: "Home or draw",
                    prob: payload.cx.derived.doubleChance.homeOrDraw,
                  },
                  {
                    code: "12",
                    label: "Either team wins",
                    prob: payload.cx.derived.doubleChance.homeOrAway,
                  },
                  {
                    code: "X2",
                    label: "Draw or away",
                    prob: payload.cx.derived.doubleChance.drawOrAway,
                  },
                ]}
              />
            </div>
          </div>
        </InsightCard>

        <InsightCard title="Asian handicap & team totals" glossaryKey="asianHandicap">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-glass-border text-[11px] font-medium uppercase tracking-wide text-muted">
                  <th className="py-2 text-left font-medium">AH line</th>
                  <th className="py-2 text-left font-medium">Home cover</th>
                  <th className="py-2 text-left font-medium">Away cover</th>
                </tr>
              </thead>
              <tbody>
                {payload.cx.derived.asianHandicap.map((l) => (
                  <tr key={l.line} className="border-b border-glass-border/50">
                    <td className="py-1.5 tabular-nums">
                      {l.line > 0 ? `+${l.line}` : l.line}
                    </td>
                    <td className="py-1.5 tabular-nums">{pct(l.homeCover)}</td>
                    <td className="py-1.5 tabular-nums">{pct(l.awayCover)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Team totals
            </p>
            <TeamTotalsTable
              rows={payload.cx.derived.teamTotals}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </div>
        </InsightCard>

        <InsightCard title="Score probability matrix" glossaryKey="scoreHeatmap">
          <ScoreHeatmap
            matrix={markets.scoreMatrix}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
        </InsightCard>

        <ValueOpportunitiesPanel payload={payload} useCx={useCx} />

        <InsightCard title="Corners & cards (satellite)" glossaryKey="cornersCards">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiMeter
              label="Total corners"
              value={fmt(payload.satellites.events.totalCorners, 1)}
              hint={`${homeLabel} ${fmt(payload.satellites.events.homeCorners, 1)}`}
            />
            <KpiMeter
              label="Away corners"
              value={fmt(payload.satellites.events.awayCorners, 1)}
              accent="accent"
            />
            <KpiMeter
              label="Total yellows"
              value={fmt(payload.satellites.events.totalYellows, 1)}
            />
            <KpiMeter
              label="Reds (exp.)"
              value={fmt(
                payload.satellites.events.homeReds + payload.satellites.events.awayReds,
                2
              )}
            />
          </div>
        </InsightCard>

        {payload.satellites.playerProps.lines.length ? (
          <InsightCard title="Player shots props (satellite)" glossaryKey="playerProps">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-glass-border text-[11px] uppercase text-muted">
                    <th className="py-2 pr-2">Player</th>
                    <th className="py-2 pr-2">Side</th>
                    <th className="py-2 pr-2">Market</th>
                    <th className="py-2 pr-2">Exp</th>
                    <th className="py-2 pr-2">O0.5</th>
                    <th className="py-2 pr-2">O1.5</th>
                    <th className="py-2">O2.5</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.satellites.playerProps.lines.slice(0, 16).map((line) => (
                    <tr
                      key={`${line.playerSmId}-${line.market}`}
                      className="border-b border-glass-border/50"
                    >
                      <td className="py-1.5 pr-2 font-medium">{line.playerName}</td>
                      <td className="py-1.5 pr-2 capitalize text-muted">{line.side}</td>
                      <td className="py-1.5 pr-2">{line.market}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{fmt(line.expected, 2)}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{pct(line.pOver05)}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{pct(line.pOver15)}</td>
                      <td className="py-1.5 tabular-nums">{pct(line.pOver25)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InsightCard>
        ) : null}

        <InsightCard title="Season outrights (satellite)" glossaryKey="seasonSim">
          <p className="text-xs text-muted">
            Use <code className="text-[11px]">POST /api/glpm/season-sim</code> with remaining
            fixtures and current standings. Simulations draw from GLPM or CX 1X2 probabilities and
            never retrain rating engines.
          </p>
        </InsightCard>
      </div>
    </div>
  );
}

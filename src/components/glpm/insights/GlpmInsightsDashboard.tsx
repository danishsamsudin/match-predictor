"use client";

import { useMemo, useState } from "react";
import { InsightCard } from "@/components/glpm/insights/InsightCard";
import {
  AreaTrendChart,
  BubbleScatterChart,
  CHART_COLORS,
  DivergingDeltaBars,
  DualRadarChart,
  EdgeBars,
  GroupedCompareBars,
  KpiMeter,
  OutcomeDonut,
  OuLadderBars,
  WaterfallBars,
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
} from "@/lib/glpm/load-insight-ratings";
import {
  deriveMarketsFromScoreMatrix,
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
  const flat = matrix.flat();
  const maxP = Math.max(...flat, 1e-9);
  const top: Array<{ h: number; a: number; p: number }> = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      top.push({ h, a, p: matrix[h][a] });
    }
  }
  top.sort((x, y) => y.p - x.p);
  const top5 = top.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="mx-auto border-collapse text-[10px] sm:text-xs">
          <thead>
            <tr>
              <th className="p-1 text-muted">
                {homeLabel.slice(0, 3)}\{awayLabel.slice(0, 3)}
              </th>
              {matrix[0]?.map((_, a) => (
                <th key={a} className="p-1 font-medium tabular-nums text-muted">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, h) => (
              <tr key={h}>
                <th className="p-1 font-medium tabular-nums text-muted">{h}</th>
                {row.map((p, a) => {
                  const intensity = p / maxP;
                  return (
                    <td key={a} className="p-0.5" title={`${h}-${a}: ${pct(p)}`}>
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-sm tabular-nums sm:h-8 sm:w-8"
                        style={{
                          backgroundColor: `color-mix(in srgb, var(--color-primary, #0ea5e9) ${Math.round(intensity * 85)}%, transparent)`,
                          color: intensity > 0.55 ? "white" : undefined,
                        }}
                      >
                        {(p * 100).toFixed(0)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {top5.map((s) => (
          <span
            key={`${s.h}-${s.a}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums dark:bg-slate-800"
          >
            {s.h}-{s.a} · {pct(s.p)}
          </span>
        ))}
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

  const domainBars = [
    ...ATTACK_DOMAINS.map((d) => ({
      name: `Atk ${d}`,
      home: payload.insights.home.domains[d] ?? 0,
      away: payload.insights.away.domains[d] ?? 0,
    })),
    ...DEFENCE_DOMAINS.map((d) => ({
      name: `Def ${d}`,
      home: payload.insights.home.domains[d] ?? 0,
      away: payload.insights.away.domains[d] ?? 0,
    })),
    ...GK_DOMAINS.map((d) => ({
      name: `GK ${d.replace(/_/g, " ")}`,
      home: payload.insights.home.domains[d] ?? 0,
      away: payload.insights.away.domains[d] ?? 0,
    })),
  ].filter((r) => r.home > 0 || r.away > 0);

  const interactionData = [
    {
      name: "ATK-DEF",
      home: payload.base.interactions.home.attack_defence,
      away: payload.base.interactions.away.attack_defence,
    },
    {
      name: "FIN-GK",
      home: payload.base.interactions.home.finishing_goalkeeper,
      away: payload.base.interactions.away.finishing_goalkeeper,
    },
    {
      name: "BU-PRS",
      home: payload.base.interactions.home.build_up_pressing,
      away: payload.base.interactions.away.build_up_pressing,
    },
    {
      name: "POSS-PRS",
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

  const homeWaterfall: Array<{ name: string; value: number; fill?: string }> = (() => {
    const h = payload.apply.home;
    let running = h.baseXg;
    const steps: Array<{ name: string; value: number; fill?: string }> = [
      { name: "Base", value: running, fill: CHART_COLORS.home },
    ];
    const mults: Array<[string, number]> = [
      ["Rest", h.restMult],
      ["Travel", h.travelMult],
      ["Alt", h.altitudeMult],
      ["Weather", h.weatherMult],
      ["Lineup", h.lineupMult],
    ];
    for (const [name, m] of mults) {
      running *= m;
      steps.push({
        name,
        value: running,
        fill: m >= 1 ? CHART_COLORS.positive : CHART_COLORS.negative,
      });
    }
    return steps;
  })();

  const finishingBubble = [
    payload.insights.homeFinishingDelta
      ? {
          name: homeLabel,
          x: payload.insights.homeFinishingDelta.xg,
          y: payload.insights.homeFinishingDelta.delta,
          z: payload.insights.homeFinishingDelta.matches,
          fill: CHART_COLORS.home,
        }
      : null,
    payload.insights.awayFinishingDelta
      ? {
          name: awayLabel,
          x: payload.insights.awayFinishingDelta.xg,
          y: payload.insights.awayFinishingDelta.delta,
          z: payload.insights.awayFinishingDelta.matches,
          fill: CHART_COLORS.away,
        }
      : null,
  ].filter(Boolean) as Array<{
    name: string;
    x: number;
    y: number;
    z: number;
    fill?: string;
  }>;

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

  const restSpark = [
    { label: "H rest", days: payload.context.homeRestDays ?? 7 },
    { label: "A rest", days: payload.context.awayRestDays ?? 7 },
  ].map((r) => ({ label: r.label, days: r.days }));

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
          howToRead="Donut shows 1X2 share. KPI tiles show projected xG for each side under the selected model."
          badge={
            <InfoTip label={GLPM_CX_GLOSSARY.proxyHonesty.label}>
              {glossaryTipBody("proxyHonesty")}
            </InfoTip>
          }
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
          <InsightCard
            title="CX xG waterfall (home)"
            glossaryKey="xgWaterfall"
            howToRead="Each bar is cumulative home xG after applying the next CX multiplier. Starts from frozen GLPM base xG."
          >
            <WaterfallBars data={homeWaterfall} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <KpiMeter
                label="Home rest days"
                value={
                  payload.context.homeRestDays != null
                    ? fmt(payload.context.homeRestDays, 1)
                    : "-"
                }
                hint={`× ${fmt(payload.apply.home.restMult, 3)}`}
              />
              <KpiMeter
                label="Away travel km"
                value={fmt(payload.context.awayTravelKm, 0)}
                hint={`× ${fmt(payload.apply.away.travelMult, 3)}`}
                accent="accent"
              />
              <KpiMeter
                label="Weather"
                value={payload.context.weatherSummary ?? "TBC"}
                hint={`× ${fmt(payload.apply.home.weatherMult, 3)}`}
              />
              <KpiMeter
                label="Lineup"
                value={payload.lineup.confirmed ? "Confirmed" : "Provisional"}
                hint={payload.lineup.summary}
              />
            </div>
            <div className="mt-3">
              <AreaTrendChart
                data={restSpark}
                dataKey="days"
                name="Rest days"
                color={CHART_COLORS.home}
              />
            </div>
          </InsightCard>
        ) : null}

        <InsightCard
          title="Primary ratings radar"
          glossaryKey="primaryRadar"
          howToRead="Larger area means a stronger multi-skill profile on the 0–100 GLPM scale."
        >
          <DualRadarChart data={radarData} homeLabel={homeLabel} awayLabel={awayLabel} />
        </InsightCard>

        {domainBars.length ? (
          <InsightCard
            title="Domain breakdown"
            glossaryKey="domainBars"
            howToRead="Compare attack/defence/GK sub-domains side by side. Missing domains stay at zero when not yet trained."
          >
            <GroupedCompareBars
              data={domainBars}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </InsightCard>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <InsightCard
            title="Set-piece matchup"
            glossaryKey="setPieceGauge"
            howToRead="Home set-piece threat vs away set-piece defence (and the reverse)."
          >
            <GroupedCompareBars
              data={[
                {
                  name: "SP threat",
                  home: payload.insights.home.setPieceThreat ?? 0,
                  away: payload.insights.away.setPieceThreat ?? 0,
                },
                {
                  name: "SP defence",
                  home: payload.insights.home.setPieceDefence ?? 0,
                  away: payload.insights.away.setPieceDefence ?? 0,
                },
              ]}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </InsightCard>

          <InsightCard
            title="Style confrontation"
            glossaryKey="styleMatchup"
            howToRead="Badges highlight how the two tactical styles clash."
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {(payload.base.homeTeam.style?.labels ?? []).map((l) => (
                <span
                  key={`h-${l}`}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary"
                >
                  {homeLabel}: {formatStyle(l)}
                </span>
              ))}
              {(payload.base.awayTeam.style?.labels ?? []).map((l) => (
                <span
                  key={`a-${l}`}
                  className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent"
                >
                  {awayLabel}: {formatStyle(l)}
                </span>
              ))}
            </div>
            <div className="space-y-2">
              {payload.insights.styleMatchups.length ? (
                payload.insights.styleMatchups.map((m) => (
                  <p
                    key={m.label}
                    className="rounded-xl border border-glass-border bg-surface/60 px-3 py-2 text-sm font-medium"
                  >
                    {m.label}
                  </p>
                ))
              ) : (
                <p className="text-xs text-muted">No strong style clash flagged.</p>
              )}
            </div>
          </InsightCard>
        </div>

        <InsightCard
          title="Matchup interactions"
          glossaryKey="interactions"
          howToRead="Positive Δ favours that side’s attacking pathway against the opponent’s corresponding weakness."
        >
          <DivergingDeltaBars data={interactionData} />
        </InsightCard>

        {vsStyleBars.length ? (
          <InsightCard
            title="Historical lift vs opponent styles"
            glossaryKey="vsStyleLift"
            howToRead="Bars show % xG lift versus each opponent style relative to the team’s overall mean. Sample size is in the InfoTip data path."
          >
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

        {finishingBubble.length ? (
          <InsightCard
            title="Finishing differential"
            glossaryKey="finishingDelta"
            howToRead="X = season xG volume, Y = Goals − xG, bubble size = matches used. Above zero means overperforming chances."
          >
            <BubbleScatterChart
              data={finishingBubble}
              xLabel="Season xG"
              yLabel="Goals − xG"
            />
          </InsightCard>
        ) : null}

        <InsightCard
          title="Goal markets"
          glossaryKey="overUnder"
          howToRead="Paired bars show over vs under probability for each total-goals line."
        >
          <OuLadderBars data={ouData} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-glass-border bg-surface/60 p-3">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-medium uppercase text-muted">BTTS</p>
                <InfoTip label={GLPM_CX_GLOSSARY.btts.label}>
                  {glossaryTipBody("btts")}
                </InfoTip>
              </div>
              <p className="text-sm">
                Yes <strong className="tabular-nums">{pct(markets.bttsYes)}</strong>
                <span className="mx-2 text-muted">·</span>
                No <strong className="tabular-nums">{pct(markets.bttsNo)}</strong>
              </p>
            </div>
            <div className="rounded-xl border border-glass-border bg-surface/60 p-3">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-medium uppercase text-muted">Double chance</p>
                <InfoTip label={GLPM_CX_GLOSSARY.doubleChance.label}>
                  {glossaryTipBody("doubleChance")}
                </InfoTip>
              </div>
              <p className="text-sm tabular-nums">
                1X {pct(payload.cx.derived.doubleChance.homeOrDraw)} · 12{" "}
                {pct(payload.cx.derived.doubleChance.homeOrAway)} · X2{" "}
                {pct(payload.cx.derived.doubleChance.drawOrAway)}
              </p>
            </div>
          </div>
        </InsightCard>

        <InsightCard
          title="Asian handicap & team totals"
          glossaryKey="asianHandicap"
          howToRead="Cover probabilities from the score matrix. Team totals use each side’s goal margin from the same matrix."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-glass-border text-[11px] uppercase text-muted">
                  <th className="py-2 text-left">AH line</th>
                  <th className="py-2 text-left">Home cover</th>
                  <th className="py-2 text-left">Away cover</th>
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
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {payload.cx.derived.teamTotals.map((t) => (
              <div
                key={t.line}
                className="rounded-xl border border-glass-border bg-surface/60 p-3 text-xs"
              >
                <p className="font-medium text-muted">Team total {t.line}</p>
                <p className="mt-1 tabular-nums">
                  {homeLabel} O {pct(t.homeOver)} / U {pct(t.homeUnder)}
                </p>
                <p className="tabular-nums">
                  {awayLabel} O {pct(t.awayOver)} / U {pct(t.awayUnder)}
                </p>
              </div>
            ))}
          </div>
        </InsightCard>

        <InsightCard
          title="Score probability matrix"
          glossaryKey="scoreHeatmap"
          howToRead="Darker cells are more likely exact scores. Chips list the top five."
        >
          <ScoreHeatmap
            matrix={markets.scoreMatrix}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
        </InsightCard>

        <ValueOpportunitiesPanel payload={payload} useCx={useCx} />

        <InsightCard
          title="Corners & cards (satellite)"
          glossaryKey="cornersCards"
          howToRead="Expected match event totals from the satellite model - not part of GLPM ratings."
        >
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
          <InsightCard
            title="Player shots props (satellite)"
            glossaryKey="playerProps"
            howToRead="Expected shots / SoT for high-minute players with over-line probabilities."
          >
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

        <InsightCard
          title="Season outrights (satellite)"
          glossaryKey="seasonSim"
          howToRead="Open the season sim API or hub tools to run full Monte Carlo outrights. Match-level CX probabilities are the building blocks."
        >
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

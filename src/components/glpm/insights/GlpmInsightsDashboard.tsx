"use client";

import { useCallback, useMemo, useState } from "react";
import {
  InsightCard,
  InsightChapter,
} from "@/components/glpm/insights/InsightCard";
import {
  CompareRow,
  DataTable,
  MetricStrip,
  SectionTip,
} from "@/components/glpm/insights/primitives";
import { HtmlOddsUpload } from "@/components/value-opportunities/HtmlOddsUpload";
import { useOddsAutoFill } from "@/components/value-opportunities/useOddsAutoFill";
import type { OddsBookSource } from "@/lib/odds-api/types";
import { isSupportedOddsLeague } from "@/lib/odds-api/config";
import {
  BttsPanel,
  CxFactorPanel,
  DomainCompareList,
  DoubleChanceList,
  DualRadarChart,
  FinishingCompare,
  MatchupTugList,
  OutcomeBar,
  OuLadderBars,
  RestDaysCompare,
  StyleMetricsCompare,
  TeamTotalsTable,
  type CxFactorStep,
} from "@/components/glpm/insights/charts";
import type { GlpmCxPredictPayload } from "@/lib/glpm-cx/run-cx-predict";
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
  sliceScoreMatrix,
  SCORE_HEATMAP_MAX_GOALS,
  totoAsianHandicapLabels,
  totoEuropeanHandicapLabels,
} from "@/lib/glpm-cx/derived-markets";
import {
  lookupConfidence,
  valueRowIdToMarketKey,
  type ConfidenceLookup,
} from "@/lib/value-opportunities/confidence-layer";
import {
  shrunkProbability,
  suggestKellyStake,
  type KellyStakeResult,
} from "@/lib/value-opportunities/kelly-stake";
import {
  suggestValueAction,
  type ValueActionResult,
} from "@/lib/value-opportunities/value-action";
import {
  ValueOpportunityFilters,
  valueFiltersEmptyMessage,
} from "@/components/value-opportunities/ValueOpportunityFilters";
import { ValueOpportunityRow } from "@/components/value-opportunities/ValueOpportunityRow";
import {
  VALUE_BOARD_COLS_BASIC,
  VALUE_BOARD_COLS_CONF,
  VALUE_BOARD_HEAD,
} from "@/components/value-opportunities/value-board-layout";
import {
  DEFAULT_VALUE_FILTERS,
  rowMatchesFilters,
  type ValueOpportunityFiltersState,
} from "@/lib/value-opportunities/row-filters";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function oddsLabel(p: number): string | null {
  const odds = fairOddsFromProb(p);
  return odds != null ? odds.toFixed(2) : null;
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
  const topScores = top.slice(0, 8);
  const topMax = topScores[0]?.p ?? 1e-9;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-stretch">
      <div className="min-w-0">
        <div className="table-h-scroll">
          <table className="w-full border-collapse text-[10px] sm:text-xs">
            <thead>
              <tr>
                <th className="p-1 text-left text-muted">
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
                  <th className="p-1 text-left font-medium tabular-nums text-muted">{h}</th>
                  {row.map((p, a) => {
                    const intensity = p / maxP;
                    return (
                      <td key={a} className="p-0.5" title={`${h}-${a}: ${pct(p)}`}>
                        <div
                          className="flex aspect-square min-h-8 w-full items-center justify-center rounded-md tabular-nums sm:min-h-9"
                          style={{
                            backgroundColor: `color-mix(in srgb, var(--color-primary, #0ea5e9) ${Math.round(intensity * 85)}%, transparent)`,
                            color: intensity > 0.55 ? "white" : undefined,
                          }}
                        >
                          <span className="hidden sm:inline">
                            {(p * 100).toFixed(1)}
                          </span>
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
          <p className="type-meta mt-2">5+ either side: {pct(tailMass)}</p>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <p className="type-meta mb-2 font-semibold uppercase tracking-wide">
          Most likely
        </p>
        <ol className="flex min-h-0 flex-1 flex-col">
          {topScores.map((s, i) => (
            <li
              key={`${s.h}-${s.a}`}
              className="flex flex-1 items-center gap-3 border-b border-glass-border/40 last:border-b-0"
            >
              <span className="w-4 type-meta tabular-nums">{i + 1}</span>
              <span className="w-12 text-sm font-bold tabular-nums text-foreground">
                {s.h}-{s.a}
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(s.p / topMax) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right text-sm font-medium tabular-nums">
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
  leagueSmId,
}: {
  payload: GlpmCxPredictPayload;
  useCx: boolean;
  leagueSmId?: number | null;
}) {
  const homeLabel = payload.base.homeTeam.name;
  const awayLabel = payload.base.awayTeam.name;
  const confidenceLayer = useCx ? payload.confidenceLayer : null;
  const showConfidence = Boolean(confidenceLayer);
  const resolvedLeagueSmId =
    (leagueSmId != null && Number.isFinite(leagueSmId) ? leagueSmId : null) ??
    payload.base.competitionId ??
    null;
  const oddsLeagueSupported =
    resolvedLeagueSmId != null && isSupportedOddsLeague(resolvedLeagueSmId);

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

  const [book, setBook] = useState<Record<string, string>>({});
  const [bookSource, setBookSource] = useState<Record<string, OddsBookSource>>({});
  const [bankroll, setBankroll] = useState("100");
  const [voFilters, setVoFilters] =
    useState<ValueOpportunityFiltersState>(DEFAULT_VALUE_FILTERS);
  const [htmlOverwrite, setHtmlOverwrite] = useState(true);
  const [htmlWarnings, setHtmlWarnings] = useState<string[]>([]);
  const [uploadBookLabel, setUploadBookLabel] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const bankrollValue = Number(bankroll);
  const bankrollNum =
    Number.isFinite(bankrollValue) && bankrollValue > 0 ? bankrollValue : 100;

  const setBookOdds = (id: string, value: string) => {
    setBook((b) => ({ ...b, [id]: value }));
    setBookSource((s) => {
      if (!(id in s)) return s;
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const applyAutoFill = useCallback(
    (
      bookByRowId: Record<string, string>,
      sourceByRowId: Record<string, OddsBookSource>,
      opts?: { overwrite?: boolean }
    ) => {
      const overwrite = opts?.overwrite ?? false;
      setBook((prevBook) => {
        const nextBook = { ...prevBook };
        const appliedIds: string[] = [];
        for (const [id, price] of Object.entries(bookByRowId)) {
          if (!overwrite && (prevBook[id] ?? "").trim()) continue;
          nextBook[id] = price;
          appliedIds.push(id);
        }
        if (appliedIds.length) {
          setBookSource((prevSource) => {
            const nextSource = { ...prevSource };
            for (const id of appliedIds) {
              if (sourceByRowId[id]) nextSource[id] = sourceByRowId[id];
            }
            return nextSource;
          });
        }
        return nextBook;
      });
    },
    []
  );

  useOddsAutoFill({
    leagueSmId: oddsLeagueSupported ? resolvedLeagueSmId : null,
    homeTeamName: homeLabel,
    awayTeamName: awayLabel,
    kickoffIso: payload.context.matchDate
      ? `${payload.context.matchDate}T15:00:00Z`
      : null,
    onFill: (bookByRowId, sourceByRowId) =>
      applyAutoFill(bookByRowId, sourceByRowId, { overwrite: false }),
    enabled: oddsLeagueSupported,
  });

  type ValueRow = {
    id: string;
    market: string;
    modelProb: number;
    fairOdds: number | null;
    bookOdds: number | null;
    modelEdgePct: number | null;
    histEdgePct: number | null;
    confidence?: ConfidenceLookup;
    kelly?: KellyStakeResult;
    action?: ValueActionResult;
  };

  type ValueSection = {
    title: string;
    hint?: string;
    rows: ValueRow[];
  };

  const sections = useMemo((): ValueSection[] => {
    const parse = (id: string): number | null => {
      const n = Number((book[id] ?? "").trim());
      return Number.isFinite(n) && n > 1 ? n : null;
    };
    const makeRow = (id: string, market: string, modelProb: number): ValueRow => {
      const bookOdds = parse(id);
      const fairOdds = fairOddsFromProb(modelProb);
      const modelEdgePct =
        bookOdds != null && modelProb > 0 ? (modelProb * bookOdds - 1) * 100 : null;
      const marketKey = valueRowIdToMarketKey(id);
      const confidence =
        marketKey && confidenceLayer
          ? lookupConfidence(marketKey, modelProb, confidenceLayer)
          : undefined;
      const kelly =
        confidence && bookOdds != null
          ? suggestKellyStake({
              modelProb,
              decimalOdds: bookOdds,
              confidence,
              bankroll: bankrollNum,
            })
          : undefined;
      const histEdgePct =
        kelly != null && bookOdds != null
          ? (kelly.pUsed * bookOdds - 1) * 100
          : confidence && bookOdds != null && confidence.n > 0
            ? (shrunkProbability(modelProb, confidence) * bookOdds - 1) * 100
            : null;
      const action = showConfidence
        ? suggestValueAction({
            bookOdds,
            confidence,
            kelly,
            modelEdgePct,
            histEdgePct,
            marketKey,
            leagueSmId: resolvedLeagueSmId,
          })
        : undefined;
      return {
        id,
        market,
        modelProb,
        fairOdds,
        bookOdds,
        modelEdgePct,
        histEdgePct,
        confidence,
        kelly,
        action,
      };
    };

    const ouLines = ["0.5", "1.5", "2.5", "3.5"];
    const ouRows: ValueRow[] = [];
    const overUnder = markets.overUnder ?? {};
    for (const line of ouLines) {
      const ou = overUnder[line];
      ouRows.push(makeRow(`ou-over-${line}`, `Over ${line}`, ou?.over ?? 0));
      ouRows.push(makeRow(`ou-under-${line}`, `Under ${line}`, ou?.under ?? 0));
    }

    const rangeSections: ValueSection[] = (
      [
        ["match", "Match total"],
        ["home", homeLabel],
        ["away", awayLabel],
      ] as const
    ).map(([scope, label]) => ({
      title: `Goal range - ${label}`,
      rows: (activeDerived.goalRanges?.[scope] ?? []).map((b) =>
        makeRow(`range-${scope}-${b.label}`, `${label} ${b.label}`, b.probability)
      ),
    }));

    const ehRows: ValueRow[] = [];
    for (const line of activeDerived.europeanHandicap ?? []) {
      const labels = totoEuropeanHandicapLabels(line.line, homeLabel, awayLabel);
      ehRows.push(
        makeRow(`eh-${line.line}-h`, labels.home, line.home),
        makeRow(`eh-${line.line}-d`, labels.draw, line.draw),
        makeRow(`eh-${line.line}-a`, labels.away, line.away)
      );
    }

    const ahRows: ValueRow[] = [];
    for (const line of activeDerived.asianHandicap ?? []) {
      const labels = totoAsianHandicapLabels(line.line, homeLabel, awayLabel);
      ahRows.push(
        makeRow(`ah-home-${line.line}`, labels.home, line.homeCover),
        makeRow(`ah-away-${line.line}`, labels.away, line.awayCover)
      );
    }

    const dc = activeDerived.doubleChance;
    const ttRows: ValueRow[] = [];
    for (const line of activeDerived.teamTotals ?? []) {
      ttRows.push(
        makeRow(`tt-home-over-${line.line}`, `${homeLabel} Over ${line.line}`, line.homeOver),
        makeRow(`tt-home-under-${line.line}`, `${homeLabel} Under ${line.line}`, line.homeUnder),
        makeRow(`tt-away-over-${line.line}`, `${awayLabel} Over ${line.line}`, line.awayOver),
        makeRow(`tt-away-under-${line.line}`, `${awayLabel} Under ${line.line}`, line.awayUnder)
      );
    }

    const shots = payload.satellites?.shots;
    const shotRows: ValueRow[] = [];
    for (const line of shots?.shotsOverUnder ?? []) {
      shotRows.push(
        makeRow(`shots-over-${line.line}`, `Shots Over ${line.line}`, line.over),
        makeRow(`shots-under-${line.line}`, `Shots Under ${line.line}`, line.under)
      );
    }
    for (const line of shots?.sotOver ?? []) {
      shotRows.push(makeRow(`sot-over-${line.line}`, `SoT Over ${line.line}`, line.over));
    }

    return [
      {
        title: "1X2",
        rows: [
          makeRow("1x2-home", "Home win", markets.homeWin),
          makeRow("1x2-draw", "Draw", markets.draw),
          makeRow("1x2-away", "Away win", markets.awayWin),
        ],
      },
      {
        title: "BTTS",
        rows: [
          makeRow("btts-yes", "BTTS yes", markets.bttsYes),
          makeRow("btts-no", "BTTS no", markets.bttsNo),
        ],
      },
      { title: "Goals O/U", rows: ouRows },
      ...(dc
        ? [
            {
              title: "Double chance",
              rows: [
                makeRow("dc-1x", "1X", dc.homeOrDraw),
                makeRow("dc-12", "12", dc.homeOrAway),
                makeRow("dc-x2", "X2", dc.drawOrAway),
              ],
            },
          ]
        : []),
      ...rangeSections,
      { title: "European handicap", rows: ehRows },
      { title: "Asian handicap", rows: ahRows },
      { title: "Team totals", rows: ttRows },
      {
        title: "Shots",
        hint:
          shots && shots.totalShots > 0
            ? `Exp. shots ${fmt(shots.totalShots, 1)} (${homeLabel} ${fmt(shots.homeShots, 1)} / ${awayLabel} ${fmt(shots.awayShots, 1)}) · SoT ${fmt(shots.totalSot, 1)}`
            : undefined,
        rows: shots && shots.totalShots > 0 ? shotRows : [],
      },
    ].filter((s) => s.rows.length > 0);
  }, [
    book,
    markets,
    activeDerived,
    homeLabel,
    awayLabel,
    payload.satellites?.shots,
    confidenceLayer,
    bankrollNum,
    showConfidence,
    resolvedLeagueSmId,
  ]);

  const totalRowCount = useMemo(
    () => sections.reduce((n, section) => n + section.rows.length, 0),
    [sections]
  );

  const filteredSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((r) => rowMatchesFilters(r, voFilters)),
      }))
      .filter((section) => section.rows.length > 0);
  }, [sections, voFilters]);

  const shownRowCount = useMemo(
    () => filteredSections.reduce((n, section) => n + section.rows.length, 0),
    [filteredSections]
  );

  return (
    <div className="min-w-0 lg:col-span-2">
      <SectionTip title="Value opportunities" glossaryKey="valueEdge" className="mb-3" />
      <div className="mb-4 flex flex-col gap-3 border-b border-glass-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        {showConfidence ? (
          <label className="block w-full max-w-[10rem] space-y-1">
            <span className="type-meta font-semibold uppercase tracking-wide">
              Bankroll (€)
            </span>
            <input
              className="h-9 w-full rounded-lg border border-glass-border bg-background px-2.5 text-sm tabular-nums"
              inputMode="decimal"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              aria-label="Bankroll in euros for Kelly stake"
              placeholder="e.g. 100"
            />
            <span className="type-meta">
              Stake € = Kelly % × {bankrollNum.toFixed(0)}
            </span>
          </label>
        ) : (
          <div />
        )}
        <div className="min-w-0 flex-1 lg:max-w-xl">
          <HtmlOddsUpload
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            overwrite={htmlOverwrite}
            onOverwriteChange={setHtmlOverwrite}
            onFill={(bookByRowId, sourceByRowId, meta) => {
              applyAutoFill(bookByRowId, sourceByRowId, {
                overwrite: htmlOverwrite,
              });
              setHtmlWarnings(meta.warnings);
              if (meta.bookmakerName) setUploadBookLabel(meta.bookmakerName);
            }}
          />
        </div>
      </div>
      {htmlWarnings.length ? (
        <ul className="mb-3 list-disc space-y-0.5 pl-4 type-meta text-amber-800 dark:text-amber-200">
          {htmlWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <ValueOpportunityFilters
        value={voFilters}
        onChange={setVoFilters}
        showConfidence={showConfidence}
        shownCount={shownRowCount}
        totalCount={totalRowCount}
      />

      <div className="space-y-5">
        {filteredSections.length === 0 ? (
          <p className="type-body-muted py-6 text-center">
            {valueFiltersEmptyMessage(voFilters)}
          </p>
        ) : (
          filteredSections.map((section) => {
            const collapsed = Boolean(collapsedSections[section.title]);
            return (
              <section key={section.title} className="min-w-0">
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() =>
                    setCollapsedSections((prev) => ({
                      ...prev,
                      [section.title]: !prev[section.title],
                    }))
                  }
                  className="mb-2 flex w-full items-baseline justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="type-section-title block text-base">
                      {section.title}
                    </span>
                    {section.hint && !collapsed ? (
                      <span className="type-meta mt-0.5 block">{section.hint}</span>
                    ) : null}
                  </span>
                  <span className="type-meta shrink-0">
                    {collapsed ? `${section.rows.length} markets ▾` : "Hide ▴"}
                  </span>
                </button>
                {!collapsed ? (
                  <div>
                    <div
                      className={`${VALUE_BOARD_HEAD} ${
                        showConfidence
                          ? VALUE_BOARD_COLS_CONF
                          : VALUE_BOARD_COLS_BASIC
                      }`}
                    >
                      <span className="text-left">Market</span>
                      <span className="text-right">Model</span>
                      <span className="text-right">Fair</span>
                      <span className="text-left">Book</span>
                      {showConfidence ? (
                        <>
                          <span className="text-center">Confidence</span>
                          <span className="text-right">Edge</span>
                          <span className="text-left">Stake</span>
                          <span className="text-center">Action</span>
                        </>
                      ) : (
                        <span className="text-right">Edge</span>
                      )}
                    </div>
                    {section.rows.map((r) => {
                      const edgePct = showConfidence
                        ? (r.histEdgePct ?? r.modelEdgePct)
                        : r.modelEdgePct;
                      const source = bookSource[r.id];
                      return (
                        <ValueOpportunityRow
                          key={r.id}
                          row={r}
                          bookValue={book[r.id] ?? ""}
                          bookSource={source}
                          bookSourceLabel={
                            source === "upload" ? uploadBookLabel : null
                          }
                          showConfidence={showConfidence}
                          edgePct={edgePct}
                          bankroll={bankrollNum}
                          onBookChange={setBookOdds}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

export function GlpmInsightsDashboard({
  payload,
  leagueSmId = null,
}: {
  payload: GlpmCxPredictPayload;
  /** SportMonks competition id - used to auto-fill Odds API books. */
  leagueSmId?: number | null;
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

  const over25 = markets.overUnder["2.5"]?.over ?? 0;

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
    lineupSummary: string,
    formMult: number,
    postApplyXg: number
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
    // Form multiplies post-apply λ (after mean-preserve), not the raw product of the five factors.
    running = postApplyXg;
    const formXg = Math.max(0.15, running * formMult);
    steps.push({
      name: "Form",
      multiplier: formMult,
      xg: formXg,
      delta: formXg - running,
      detail: "",
    });
    return steps;
  };

  const homeCxSteps = buildCxSteps(
    payload.apply.home,
    payload.context.homeTravelKm,
    payload.context.homeRestDays,
    payload.context.homeRestNote ?? null,
    payload.context.weatherSummary,
    payload.lineup.summary,
    payload.form.homeMult,
    payload.apply.homeXg
  );
  const awayCxSteps = buildCxSteps(
    payload.apply.away,
    payload.context.awayTravelKm,
    payload.context.awayRestDays,
    payload.context.awayRestNote ?? null,
    payload.context.weatherSummary,
    payload.lineup.summary,
    payload.form.awayMult,
    payload.apply.awayXg
  );


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
    <div className="min-w-0 max-w-full space-y-6">
      <InsightChapter title="Overview" glossaryKey="homeAwayXg">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <OutcomeBar
            home={markets.homeWin}
            draw={markets.draw}
            away={markets.awayWin}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            homeTeamId={payload.base.homeTeam.smId}
            awayTeamId={payload.base.awayTeam.smId}
          />
          <div className="flex justify-center">
            <div className="inline-flex shrink-0 rounded-full border border-glass-border bg-background/70 p-1">
              <button
                type="button"
                onClick={() => setUseCx(false)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  !useCx
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Base
              </button>
              <button
                type="button"
                onClick={() => setUseCx(true)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  useCx
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground"
                }`}
              >
                With context
              </button>
            </div>
          </div>
          <MetricStrip
            items={[
              {
                label: `${homeLabel} xG`,
                value: fmt(markets.homeXg),
                hint: useCx ? `Base ${fmt(payload.base.homeXg)}` : undefined,
                accent: "primary",
              },
              {
                label: `${awayLabel} xG`,
                value: fmt(markets.awayXg),
                hint: useCx ? `Base ${fmt(payload.base.awayXg)}` : undefined,
                accent: "accent",
              },
              { label: "Over 2.5", value: pct(over25) },
              { label: "BTTS yes", value: pct(markets.bttsYes) },
              {
                label: "Fair home",
                value: oddsLabel(markets.homeWin) ?? "-",
                accent: "primary",
              },
              {
                label: "Fair away",
                value: oddsLabel(markets.awayWin) ?? "-",
                accent: "accent",
              },
            ]}
          />
          {useCx ? (
            <div className="border-t border-glass-border pt-5">
              <SectionTip title="Context" glossaryKey="xgWaterfall" className="mb-3" />
              <CxFactorPanel
                homeSteps={homeCxSteps}
                awaySteps={awayCxSteps}
                homeLabel={homeLabel}
                awayLabel={awayLabel}
              />
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
          ) : null}
        </div>
      </InsightChapter>

      <InsightChapter title="Ratings" glossaryKey="primaryRadar">
        <InsightCard title="Radar" glossaryKey="primaryRadar">
          <DualRadarChart data={radarData} homeLabel={homeLabel} awayLabel={awayLabel} />
        </InsightCard>
        <InsightCard title="Domains" glossaryKey="domainBars">
          {domainGroups.length ? (
            <>
              <DomainCompareList
                groups={domainGroups}
                homeLabel={homeLabel}
                awayLabel={awayLabel}
              />
              {hiddenDomains.length ? (
                <p className="type-meta mt-2">
                  Hidden: {hiddenDomains.join(", ")}.
                </p>
              ) : null}
            </>
          ) : (
            <p className="type-meta">
              {hiddenDomains.length
                ? "All sub-skills at shared ceiling."
                : "Domain ratings not available."}
            </p>
          )}
        </InsightCard>
      </InsightChapter>

      <InsightChapter title="Matchup" glossaryKey="interactions">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid gap-6 lg:grid-cols-2">
            <InsightCard title="Set pieces" glossaryKey="setPieceGauge">
              {setPieceMissing || setPieceNoSignal ? (
                <p className="type-meta">Set-piece ratings not differentiated yet.</p>
              ) : (
                <div>
                  <div className="mb-1 flex items-center justify-between type-meta uppercase tracking-wide">
                    <span className="font-medium text-primary">{homeLabel}</span>
                    <span className="font-medium text-accent">{awayLabel}</span>
                  </div>
                  <CompareRow
                    label="Attack"
                    home={payload.insights.home.setPieceThreat ?? 0}
                    away={payload.insights.away.setPieceThreat ?? 0}
                    max={100}
                  />
                  <CompareRow
                    label="Defence"
                    home={payload.insights.home.setPieceDefence ?? 0}
                    away={payload.insights.away.setPieceDefence ?? 0}
                    max={100}
                  />
                  {(() => {
                    const homeEdge =
                      (payload.insights.home.setPieceThreat ?? 0) -
                      (payload.insights.away.setPieceDefence ?? 0);
                    const awayEdge =
                      (payload.insights.away.setPieceThreat ?? 0) -
                      (payload.insights.home.setPieceDefence ?? 0);
                    return (
                      <div className="mt-2 flex justify-between gap-3 type-meta uppercase tracking-wide">
                        <span>
                          Cross{" "}
                          <span
                            className={`font-semibold tabular-nums ${
                              homeEdge >= 0 ? "text-primary" : "text-accent"
                            }`}
                          >
                            {homeEdge >= 0 ? "+" : ""}
                            {homeEdge.toFixed(1)}
                          </span>
                        </span>
                        <span>
                          Cross{" "}
                          <span
                            className={`font-semibold tabular-nums ${
                              awayEdge >= 0 ? "text-accent" : "text-primary"
                            }`}
                          >
                            {awayEdge >= 0 ? "+" : ""}
                            {awayEdge.toFixed(1)}
                          </span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </InsightCard>

            <InsightCard title="Style" glossaryKey="styleMatchup">
              {hasStyleMetrics ? (
                <StyleMetricsCompare
                  homeLabel={homeLabel}
                  awayLabel={awayLabel}
                  homePossession={
                    payload.base.homeTeam.style?.avgPossession ?? null
                  }
                  awayPossession={
                    payload.base.awayTeam.style?.avgPossession ?? null
                  }
                  homePpda={payload.base.homeTeam.style?.avgPpda ?? null}
                  awayPpda={payload.base.awayTeam.style?.avgPpda ?? null}
                />
              ) : (
                <p className="type-meta">Possession / PPDA not available.</p>
              )}
            </InsightCard>
          </div>

          <div className="border-t border-glass-border pt-5">
            <InsightCard title="Interactions" glossaryKey="interactions">
              <MatchupTugList
                data={interactionData}
                homeLabel={homeLabel}
                awayLabel={awayLabel}
              />
            </InsightCard>
          </div>

          <div className="grid gap-6 border-t border-glass-border pt-5 lg:grid-cols-2">
            {(payload.insights.homeVsStyle.length ||
              payload.insights.awayVsStyle.length) ? (
              <InsightCard title="Vs styles" glossaryKey="vsStyleLift">
                <DataTable>
                  <thead>
                    <tr>
                      <th className="pr-2 text-left">Style</th>
                      <th className="px-2 text-right text-primary">{homeLabel}</th>
                      <th className="px-2 text-right text-accent">{awayLabel}</th>
                      <th className="pl-2 text-right">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set([
                        ...payload.insights.homeVsStyle.map((r) => r.style),
                        ...payload.insights.awayVsStyle.map((r) => r.style),
                      ])
                    )
                      .slice(0, 6)
                      .map((style) => {
                        const h = payload.insights.homeVsStyle.find(
                          (r) => r.style === style
                        );
                        const a = payload.insights.awayVsStyle.find(
                          (r) => r.style === style
                        );
                        const n = Math.max(h?.n ?? 0, a?.n ?? 0);
                        return (
                          <tr key={style}>
                            <td className="pr-2 text-left font-medium">
                              {formatStyle(style)}
                            </td>
                            <td
                              className={`px-2 text-right ${
                                (h?.liftPct ?? 0) >= 0
                                  ? "text-emerald-500"
                                  : "text-rose-500"
                              }`}
                            >
                              {h
                                ? `${h.liftPct >= 0 ? "+" : ""}${h.liftPct}%`
                                : "-"}
                            </td>
                            <td
                              className={`px-2 text-right ${
                                (a?.liftPct ?? 0) >= 0
                                  ? "text-emerald-500"
                                  : "text-rose-500"
                              }`}
                            >
                              {a
                                ? `${a.liftPct >= 0 ? "+" : ""}${a.liftPct}%`
                                : "-"}
                            </td>
                            <td className="pl-2 text-right text-muted">
                              {n || "-"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </DataTable>
              </InsightCard>
            ) : (
              <div />
            )}

            <div className="space-y-5">
              <InsightCard title="Finishing" glossaryKey="finishingDelta">
                {payload.insights.homeFinishingDelta ||
                payload.insights.awayFinishingDelta ? (
                  <FinishingCompare
                    home={payload.insights.homeFinishingDelta}
                    away={payload.insights.awayFinishingDelta}
                    homeLabel={homeLabel}
                    awayLabel={awayLabel}
                  />
                ) : (
                  <p className="type-meta">No season goals/xG yet.</p>
                )}
              </InsightCard>
              <InsightCard title="Events" glossaryKey="cornersCards">
                <MetricStrip
                  columns={4}
                  items={[
                    {
                      label: "Corners",
                      value: fmt(payload.satellites.events.totalCorners, 1),
                    },
                    {
                      label: "Home",
                      value: fmt(payload.satellites.events.homeCorners, 1),
                      accent: "primary",
                    },
                    {
                      label: "Away",
                      value: fmt(payload.satellites.events.awayCorners, 1),
                      accent: "accent",
                    },
                    {
                      label: "Yellows",
                      value: fmt(payload.satellites.events.totalYellows, 1),
                    },
                  ]}
                />
              </InsightCard>
            </div>
          </div>
        </div>
      </InsightChapter>

      <InsightChapter title="Markets" glossaryKey="overUnder">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
            <div>
              <SectionTip title="Goals O/U" glossaryKey="overUnder" className="mb-3" />
              <OuLadderBars data={ouData} />
            </div>
            <div className="space-y-5">
              <div>
                <SectionTip title="BTTS" glossaryKey="btts" className="mb-3" />
                <BttsPanel yes={markets.bttsYes} no={markets.bttsNo} />
              </div>
              <div>
                <SectionTip
                  title="Double chance"
                  glossaryKey="doubleChance"
                  className="mb-3"
                />
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
          </div>

          <div className="grid gap-6 border-t border-glass-border pt-5 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0">
              <SectionTip
                title="Asian handicap"
                glossaryKey="asianHandicap"
                className="mb-3"
              />
              <DataTable>
                <thead>
                  <tr className="h-9">
                    <th className="pr-2 text-left align-bottom">AH line</th>
                    <th className="px-2 text-right align-bottom" colSpan={2}>
                      Cover
                    </th>
                  </tr>
                  <tr className="h-8">
                    <th className="pr-2 text-left" />
                    <th className="px-2 text-right">Home</th>
                    <th className="pl-2 text-right">Away</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.cx.derived.asianHandicap.map((l) => (
                    <tr key={l.line} className="h-10">
                      <td className="pr-2 text-left font-medium">
                        {l.line > 0 ? `+${l.line}` : l.line}
                      </td>
                      <td className="px-2 text-right">{pct(l.homeCover)}</td>
                      <td className="pl-2 text-right">{pct(l.awayCover)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
            <div className="min-w-0">
              <SectionTip
                title="Team totals"
                glossaryKey="asianHandicap"
                className="mb-3"
              />
              <TeamTotalsTable
                rows={payload.cx.derived.teamTotals}
                homeLabel={homeLabel}
                awayLabel={awayLabel}
              />
            </div>
          </div>

          <div className="border-t border-glass-border pt-5">
            <SectionTip
              title="Score matrix"
              glossaryKey="scoreHeatmap"
              className="mb-3"
            />
            <ScoreHeatmap
              matrix={markets.scoreMatrix}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
            />
          </div>
        </div>
      </InsightChapter>

      <InsightChapter title="Value" glossaryKey="valueEdge">
        <ValueOpportunitiesPanel
          payload={payload}
          useCx={useCx}
          leagueSmId={leagueSmId}
        />

        {payload.satellites.playerProps.lines.length ? (
          <div className="min-w-0 lg:col-span-2">
            <SectionTip
              title="Player shots"
              glossaryKey="playerProps"
              className="mb-3"
            />
            <DataTable minWidth="28rem">
              <thead>
                <tr>
                  <th className="pr-2 text-left">Player</th>
                  <th className="pr-2 text-left">Side</th>
                  <th className="pr-2 text-left">Market</th>
                  <th className="pr-2 text-right">Exp.</th>
                  <th className="pr-2 text-right">O0.5</th>
                  <th className="pr-2 text-right">O1.5</th>
                  <th className="text-right">O2.5</th>
                </tr>
              </thead>
              <tbody>
                {payload.satellites.playerProps.lines.slice(0, 16).map((line) => (
                  <tr key={`${line.playerSmId}-${line.market}`}>
                    <td className="pr-2 text-left font-medium">{line.playerName}</td>
                    <td className="pr-2 text-left text-muted">
                      {line.side === "home" ? homeLabel : awayLabel}
                    </td>
                    <td className="pr-2 text-left">{line.market}</td>
                    <td className="pr-2 text-right">{fmt(line.expected, 2)}</td>
                    <td className="pr-2 text-right">{pct(line.pOver05)}</td>
                    <td className="pr-2 text-right">{pct(line.pOver15)}</td>
                    <td className="text-right">{pct(line.pOver25)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        ) : null}
      </InsightChapter>

      <p className="type-meta text-center">
        {useCx ? payload.cx.modelVersion : payload.base.predModelVersion}
      </p>
    </div>
  );
}


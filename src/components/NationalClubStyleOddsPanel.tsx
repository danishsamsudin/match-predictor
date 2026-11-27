"use client";

import { useMemo, useState } from "react";
import { InsightCard } from "@/components/glpm/insights/InsightCard";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
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
import type { PredictionResult } from "@/lib/types/prediction";
import {
  totoAsianHandicapLabels,
  totoEuropeanHandicapLabels,
} from "@/lib/glpm-cx/derived-markets";
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

type ValueRow = {
  id: string;
  market: string;
  modelProb: number;
  fairOdds: number | null;
  bookOdds: number | null;
  /** Edge vs model fair price. */
  modelEdgePct: number | null;
  /** Edge vs confidence-shrunk historical rate (what Kelly uses). */
  histEdgePct: number | null;
  confidence?: ConfidenceLookup;
  kelly?: KellyStakeResult;
  action?: ValueActionResult;
};

type ValueSection = {
  title: string;
  rows: ValueRow[];
};

/**
 * Club-style odds board for national / Graham predictions.
 */
export function NationalClubStyleOddsPanel({
  result,
  hideAsianHandicap = false,
}: {
  result: PredictionResult;
  /** Omit Asian handicap rows (Nations League predict UI). */
  hideAsianHandicap?: boolean;
}) {
  const [book, setBook] = useState<Record<string, string>>({});
  const [bankroll, setBankroll] = useState("100");
  const [voFilters, setVoFilters] =
    useState<ValueOpportunityFiltersState>(DEFAULT_VALUE_FILTERS);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const analytics = result.analytics;
  const derived = result.derivedMarkets;
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";
  const showConfidence = Boolean(result.confidenceLayer);
  const bankrollValue = Number(bankroll);
  const bankrollNum = Number.isFinite(bankrollValue) && bankrollValue > 0 ? bankrollValue : 100;

  const setBookOdds = (id: string, value: string) => {
    setBook((b) => ({ ...b, [id]: value }));
  };

  const sections = useMemo((): ValueSection[] => {
    if (!analytics) return [];

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
        marketKey && result.confidenceLayer
          ? lookupConfidence(marketKey, modelProb, result.confidenceLayer)
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
          : confidence && bookOdds != null && confidence.tier !== "none"
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

    const out: ValueSection[] = [
      {
        title: "1X2",
        rows: [
          makeRow("1x2-home", "Home win", result.homeWinPct / 100),
          makeRow("1x2-draw", "Draw", result.drawPct / 100),
          makeRow("1x2-away", "Away win", result.awayWinPct / 100),
        ],
      },
      {
        title: "BTTS",
        rows: [
          makeRow("btts-yes", "BTTS yes", analytics.btts.yesPct / 100),
          makeRow("btts-no", "BTTS no", analytics.btts.noPct / 100),
        ],
      },
    ];

    const ouRows: ValueRow[] = [];
    for (const line of analytics.overUnder) {
      ouRows.push(
        makeRow(`ou-over-${line.line}`, `Over ${line.line}`, line.overPct / 100),
        makeRow(`ou-under-${line.line}`, `Under ${line.line}`, line.underPct / 100)
      );
    }
    if (ouRows.length) out.push({ title: "Goals O/U", rows: ouRows });

    if (derived?.doubleChance) {
      out.push({
        title: "Double chance",
        rows: [
          makeRow("dc-1x", "1X", derived.doubleChance.homeOrDraw),
          makeRow("dc-12", "12", derived.doubleChance.homeOrAway),
          makeRow("dc-x2", "X2", derived.doubleChance.drawOrAway),
        ],
      });
    }

    if (derived?.goalRanges) {
      for (const [scope, label] of [
        ["match", "Match total"],
        ["home", homeLabel],
        ["away", awayLabel],
      ] as const) {
        const buckets = derived.goalRanges[scope] ?? [];
        if (!buckets.length) continue;
        out.push({
          title: `Goal range - ${label}`,
          rows: buckets.map((b) =>
            makeRow(`range-${scope}-${b.label}`, `${label} ${b.label}`, b.probability)
          ),
        });
      }
    }

    if (derived?.europeanHandicap?.length) {
      const ehRows: ValueRow[] = [];
      for (const line of derived.europeanHandicap) {
        const labels = totoEuropeanHandicapLabels(line.line, homeLabel, awayLabel);
        ehRows.push(
          makeRow(`eh-${line.line}-h`, labels.home, line.home),
          makeRow(`eh-${line.line}-d`, labels.draw, line.draw),
          makeRow(`eh-${line.line}-a`, labels.away, line.away)
        );
      }
      out.push({ title: "European handicap", rows: ehRows });
    }

    const ahRows: ValueRow[] = [];
    if (!hideAsianHandicap) {
      for (const line of analytics.handicapMarkets.asianHandicap) {
        const labels = totoAsianHandicapLabels(line.line, homeLabel, awayLabel);
        ahRows.push(
          makeRow(`ah-home-${line.line}`, labels.home, line.homeCoverPct / 100),
          makeRow(`ah-away-${line.line}`, labels.away, line.awayCoverPct / 100)
        );
      }
      if (ahRows.length) out.push({ title: "Asian handicap", rows: ahRows });
    }

    if (derived?.teamTotals?.length) {
      const ttRows: ValueRow[] = [];
      for (const line of derived.teamTotals) {
        ttRows.push(
          makeRow(`tt-home-over-${line.line}`, `${homeLabel} Over ${line.line}`, line.homeOver),
          makeRow(`tt-home-under-${line.line}`, `${homeLabel} Under ${line.line}`, line.homeUnder),
          makeRow(`tt-away-over-${line.line}`, `${awayLabel} Over ${line.line}`, line.awayOver),
          makeRow(`tt-away-under-${line.line}`, `${awayLabel} Under ${line.line}`, line.awayUnder)
        );
      }
      out.push({ title: "Team totals", rows: ttRows });
    }

    return out.filter((s) => s.rows.length > 0);
  }, [
    analytics,
    book,
    derived,
    hideAsianHandicap,
    homeLabel,
    awayLabel,
    result.homeWinPct,
    result.drawPct,
    result.awayWinPct,
    result.confidenceLayer,
    bankrollNum,
    showConfidence,
  ]);

  if (!analytics || !sections.length) return null;

  const totalRowCount = sections.reduce((n, section) => n + section.rows.length, 0);
  const filteredSections = sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((r) => rowMatchesFilters(r, voFilters)),
    }))
    .filter((section) => section.rows.length > 0);
  const shownRowCount = filteredSections.reduce(
    (n, section) => n + section.rows.length,
    0
  );

  return (
    <InsightCard
      title="Value opportunities"
      howToRead=""
      tipLabel="Value opportunities"
      tipBody={
        <>
          Model % is the Graham grid price. Confidence compares that band to past locked
          results. Stake is fractional Kelly on the historical hit rate, shown in euros for
          your bankroll. Action is one shared rule for every market: Bet only when
          Moderate/Strong history clears Kelly; Watch for weak history or model-only edges;
          Pass otherwise.
        </>
      }
    >
      {showConfidence ? (
        <label className="mb-4 block w-full max-w-[10rem] space-y-1">
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
        </label>
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
                  <span className="type-section-title text-base">{section.title}</span>
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
                      <span>Market</span>
                      <span className="text-right">Model</span>
                      <span className="text-right">Fair</span>
                      <span>Book</span>
                      {showConfidence ? (
                        <>
                          <span>Confidence</span>
                          <span className="text-right">Edge</span>
                          <span>Stake</span>
                          <span className="text-right">Action</span>
                        </>
                      ) : (
                        <span className="text-right">Edge</span>
                      )}
                    </div>
                    {section.rows.map((r) => {
                      const edgePct = showConfidence
                        ? (r.histEdgePct ?? r.modelEdgePct)
                        : r.modelEdgePct;
                      return (
                        <ValueOpportunityRow
                          key={r.id}
                          row={r}
                          bookValue={book[r.id] ?? ""}
                          showConfidence={showConfidence}
                          edgePct={edgePct}
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
    </InsightCard>
  );
}

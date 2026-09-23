"use client";

import { useMemo, useState } from "react";
import { InsightCard } from "@/components/glpm/insights/InsightCard";
import { EdgeBars } from "@/components/glpm/insights/charts";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import type { PredictionResult } from "@/lib/types/prediction";

function pct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function formatEhLine(line: number): string {
  if (line > 0) return `+${line}`;
  return String(line);
}

function formatAhLine(line: number): string {
  if (line > 0) return `+${line}`;
  return String(line);
}

type ValueRow = {
  id: string;
  market: string;
  modelProb: number;
  fairOdds: number | null;
  bookOdds: number | null;
  edgePct: number | null;
};

type ValueSection = {
  title: string;
  rows: ValueRow[];
};

/**
 * Club-style odds board for national / Graham predictions:
 * Market | Model % | Fair odds | Book | Edge
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
  const analytics = result.analytics;
  const derived = result.derivedMarkets;
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";

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
      const edgePct =
        bookOdds != null && modelProb > 0
          ? (modelProb * bookOdds - 1) * 100
          : null;
      return { id, market, modelProb, fairOdds, bookOdds, edgePct };
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
        const tag = formatEhLine(line.line);
        ehRows.push(
          makeRow(`eh-${line.line}-h`, `EH ${tag} Home`, line.home),
          makeRow(`eh-${line.line}-d`, `EH ${tag} Draw`, line.draw),
          makeRow(`eh-${line.line}-a`, `EH ${tag} Away`, line.away)
        );
      }
      out.push({ title: "European handicap", rows: ehRows });
    }

    const ahRows: ValueRow[] = [];
    if (!hideAsianHandicap) {
      for (const line of analytics.handicapMarkets.asianHandicap) {
        const tag = formatAhLine(line.line);
        ahRows.push(
          makeRow(
            `ah-home-${line.line}`,
            `AH ${tag} Home`,
            line.homeCoverPct / 100
          ),
          makeRow(
            `ah-away-${line.line}`,
            `AH ${tag} Away`,
            line.awayCoverPct / 100
          )
        );
      }
      if (ahRows.length) out.push({ title: "Asian handicap", rows: ahRows });
    }

    if (derived?.teamTotals?.length) {
      const ttRows: ValueRow[] = [];
      for (const line of derived.teamTotals) {
        ttRows.push(
          makeRow(
            `tt-home-over-${line.line}`,
            `${homeLabel} Over ${line.line}`,
            line.homeOver
          ),
          makeRow(
            `tt-home-under-${line.line}`,
            `${homeLabel} Under ${line.line}`,
            line.homeUnder
          ),
          makeRow(
            `tt-away-over-${line.line}`,
            `${awayLabel} Over ${line.line}`,
            line.awayOver
          ),
          makeRow(
            `tt-away-under-${line.line}`,
            `${awayLabel} Under ${line.line}`,
            line.awayUnder
          )
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
  ]);

  if (!analytics || !sections.length) return null;

  const quickBookFields: Array<[string, string]> = [
    ["1x2-home", "Home"],
    ["1x2-draw", "Draw"],
    ["1x2-away", "Away"],
    ["btts-yes", "BTTS yes"],
    ["ou-over-2.5", "Over 2.5"],
  ];
  if (!hideAsianHandicap) {
    quickBookFields.push(["ah-home--0.5", "AH -0.5"]);
  }

  const edgeChart = sections
    .flatMap((s) => s.rows)
    .filter((r) => r.edgePct != null)
    .map((r) => ({ market: r.market, edgePct: r.edgePct as number }));

  return (
    <InsightCard
      title="Value opportunities"
      howToRead="Enter book decimal odds below or on each row to compare with model fair odds. Positive edge means the book price is longer than the model."
      tipLabel="Value opportunities"
      tipBody={
        <>
          Model % and fair odds come from the Graham score grid. Type a book price to see
          edge for that market.
        </>
      }
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {quickBookFields.map(([id, label]) => (
          <label key={id} className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
            <input
              className="w-full rounded-lg border border-glass-border bg-surface px-2 py-1.5 text-sm tabular-nums"
              inputMode="decimal"
              placeholder="e.g. 2.10"
              value={book[id] ?? ""}
              onChange={(e) => setBookOdds(id, e.target.value)}
              aria-label={`Book odds for ${label}`}
            />
          </label>
        ))}
      </div>

      <p className="mb-3 text-xs text-muted">
        Fill Home / Draw / Away above for quick 1X2 edges, or type a book price on any row
        below.
      </p>

      {edgeChart.length ? <EdgeBars data={edgeChart} /> : null}

      <div className="mt-3 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title}
            </p>
            <div className="table-h-scroll">
              <table className="w-full min-w-[28rem] text-left text-sm sm:min-w-[36rem]">
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
                  {section.rows.map((r) => (
                    <tr key={r.id} className="border-b border-glass-border/60">
                      <td className="py-2 pr-2 font-medium">{r.market}</td>
                      <td className="py-2 pr-2 tabular-nums">{pct(r.modelProb)}</td>
                      <td className="py-2 pr-2 tabular-nums">
                        {r.fairOdds?.toFixed(2) ?? "-"}
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-20 rounded-lg border border-glass-border bg-surface px-2 py-1 text-sm tabular-nums"
                          inputMode="decimal"
                          placeholder="e.g. 2.10"
                          value={book[r.id] ?? ""}
                          onChange={(e) => setBookOdds(r.id, e.target.value)}
                          aria-label={`Book odds for ${r.market}`}
                        />
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
          </div>
        ))}
      </div>
    </InsightCard>
  );
}

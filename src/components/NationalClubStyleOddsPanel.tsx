"use client";

import { useMemo, useState } from "react";
import { InsightCard } from "@/components/glpm/insights/InsightCard";
import { EdgeBars } from "@/components/glpm/insights/charts";
import { Tooltip } from "@/components/ui/Tooltip";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import {
  formatConfidenceTier,
  lookupConfidence,
  valueRowIdToMarketKey,
  type ConfidenceLookup,
  type ConfidenceTier,
} from "@/lib/nations-league/confidence-layer";
import {
  shrunkProbability,
  suggestKellyStake,
  type KellyStakeResult,
} from "@/lib/nations-league/kelly-stake";
import {
  formatValueAction,
  suggestValueAction,
  type ValueAction,
  type ValueActionResult,
} from "@/lib/nations-league/value-action";
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

const TIER_STYLES: Record<
  ConfidenceTier,
  { badge: string; dot: string; label: string }
> = {
  strong: {
    badge: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "Decision-ready",
  },
  moderate: {
    badge: "bg-sky-500/15 text-sky-900 ring-sky-500/25 dark:text-sky-300",
    dot: "bg-sky-500",
    label: "Useful signal",
  },
  weak: {
    badge: "bg-amber-500/15 text-amber-900 ring-amber-500/25 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Thin / optimistic model",
  },
  none: {
    badge: "bg-rose-500/10 text-rose-800 ring-rose-500/20 dark:text-rose-300",
    dot: "bg-rose-500",
    label: "Do not rely",
  },
};

function confidenceTierBlurb(tier: ConfidenceTier): string {
  if (tier === "strong") {
    return "History backs this band well enough to treat as a decision-ready signal.";
  }
  if (tier === "moderate") {
    return "Useful history - treat as a guardrail, not a guarantee.";
  }
  if (tier === "weak") {
    return "Enough history to size a small stake from the hit rate, but the model % may still be optimistic.";
  }
  return "Not enough reliable history in this band - stake stays €0.00.";
}

function formatStakeEuros(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

function ConfidencePopup({ lookup }: { lookup: ConfidenceLookup }) {
  const tier = lookup.tier;
  const hitPct = (lookup.historicalHitRate * 100).toFixed(0);
  const hasHistory = lookup.n > 0;

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Confidence
        </p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">
          {formatConfidenceTier(tier)}
          <span className="font-medium text-muted"> - {TIER_STYLES[tier].label}</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">
          {confidenceTierBlurb(tier)}
        </p>
      </div>

      {hasHistory ? (
        <div className="space-y-2 border-t border-glass-border pt-2.5">
          <div>
            <p className="text-[11px] font-semibold text-foreground">
              Hit {hitPct}%
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              When the model showed a similar % on this market before, the outcome
              actually won in {hitPct}% of those locked predictions. Stake sizing
              uses this rate, not the raw model %.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-foreground">
              n = {lookup.n}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Sample size: how many past cases that hit rate is based on. Larger n
              means the % is more trustworthy; small n means it can swing a lot.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            What this tells you: compare book odds to the hit rate. If the book is
            shorter than ~{hitPct}% implied, history says there is no edge - even
            if the model % looks higher.
          </p>
        </div>
      ) : (
        <p className="border-t border-glass-border pt-2.5 text-xs leading-relaxed text-muted">
          No locked predictions in this model-% band yet, so we cannot check how
          often this price actually hit.
        </p>
      )}
    </div>
  );
}

function ConfidenceCell({ lookup }: { lookup: ConfidenceLookup }) {
  const tier = lookup.tier;
  const style = TIER_STYLES[tier];
  const ariaLabel =
    lookup.n > 0
      ? `${formatConfidenceTier(tier)} confidence: hit ${(lookup.historicalHitRate * 100).toFixed(0)}% in ${lookup.n} past games. Tap for explanation.`
      : `${formatConfidenceTier(tier)} confidence: no history yet. Tap for explanation.`;

  return (
    <div className="min-w-[7.5rem]">
      <Tooltip
        label="Confidence explained"
        content={<ConfidencePopup lookup={lookup} />}
        side="top"
      >
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-flex max-w-full cursor-help flex-col items-start gap-1 rounded-md px-2 py-1 text-left ring-1 ring-inset transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${style.badge}`}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
            {formatConfidenceTier(tier)}
          </span>
          {lookup.n > 0 ? (
            <span className="text-[11px] font-medium leading-snug opacity-80">
              Hit{" "}
              <span className="tabular-nums">
                {(lookup.historicalHitRate * 100).toFixed(0)}%
              </span>
              {" · "}
              <span className="tabular-nums">{lookup.n}</span> games
            </span>
          ) : (
            <span className="text-[11px] font-medium leading-snug opacity-80">
              No history yet
            </span>
          )}
        </button>
      </Tooltip>
    </div>
  );
}

function StakeCell({
  bookOdds,
  kelly,
  confidenceTier,
}: {
  bookOdds: number | null;
  kelly?: KellyStakeResult;
  confidenceTier?: ConfidenceLookup["tier"];
}) {
  if (bookOdds == null) {
    return <span className="text-muted">-</span>;
  }
  if (kelly && kelly.fraction > 0) {
    return (
      <div title={kelly.reason}>
        <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatStakeEuros(kelly.units)}
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          {(kelly.fraction * 100).toFixed(1)}% of bankroll
        </p>
      </div>
    );
  }
  if (confidenceTier === "none") {
    return (
      <div title={kelly?.reason ?? "Not enough history for a stake."}>
        <p className="text-xs font-medium tabular-nums text-muted">
          {formatStakeEuros(0)}
        </p>
        <p className="text-[11px] leading-snug text-muted">No history</p>
      </div>
    );
  }
  if (kelly?.minBookOdds != null) {
    return (
      <div title={kelly.reason}>
        <p className="text-xs font-medium tabular-nums text-muted">
          {formatStakeEuros(0)}
        </p>
        <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
          Need ≥ <span className="tabular-nums">{kelly.minBookOdds.toFixed(2)}</span>
        </p>
      </div>
    );
  }
  return (
    <div title={kelly?.reason ?? "No stake"}>
      <p className="text-xs font-medium tabular-nums text-muted">
        {formatStakeEuros(0)}
      </p>
      <p className="text-[11px] leading-snug text-muted">No stake</p>
    </div>
  );
}

const ACTION_STYLES: Record<
  ValueAction,
  { badge: string; blurb: string }
> = {
  pass: {
    badge: "bg-rose-500/10 text-rose-800 ring-rose-500/20 dark:text-rose-300",
    blurb: "Skip this price",
  },
  watch: {
    badge: "bg-amber-500/15 text-amber-900 ring-amber-500/25 dark:text-amber-300",
    blurb: "Interesting - do not force",
  },
  bet: {
    badge: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300",
    blurb: "History + price align",
  },
};

function ActionCell({ decision }: { decision: ValueActionResult }) {
  const style = ACTION_STYLES[decision.action];
  return (
    <Tooltip
      label={`${formatValueAction(decision.action)} explained`}
      content={
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">
            {decision.label}
            <span className="font-medium text-muted"> - {style.blurb}</span>
          </p>
          <p className="text-xs leading-relaxed text-muted">{decision.reason}</p>
          <p className="text-xs leading-relaxed text-muted">
            Same rule for every market: confidence tier, historical edge, and Kelly
            stake. Markets already specialize through their own hit-rate history.
          </p>
        </div>
      }
      side="top"
    >
      <button
        type="button"
        aria-label={`${decision.label}: ${decision.reason}`}
        className={`inline-flex cursor-help items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${style.badge}`}
      >
        {decision.label}
      </button>
    </Tooltip>
  );
}

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
 * Club-style odds board for national / Graham predictions:
 * Market | Confidence | Model % | Fair odds | Book | Edge | Stake | Action
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
        confidence && bookOdds != null && confidence.tier !== "none"
          ? (shrunkProbability(modelProb, confidence) * bookOdds - 1) * 100
          : null;
      const action = showConfidence
        ? suggestValueAction({
            bookOdds,
            confidence,
            kelly,
            modelEdgePct,
            histEdgePct,
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
          makeRow(`ah-home-${line.line}`, `AH ${tag} Home`, line.homeCoverPct / 100),
          makeRow(`ah-away-${line.line}`, `AH ${tag} Away`, line.awayCoverPct / 100)
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
    .filter((r) => (showConfidence ? r.histEdgePct : r.modelEdgePct) != null)
    .map((r) => ({
      market: r.market,
      edgePct: (showConfidence ? r.histEdgePct : r.modelEdgePct) as number,
    }));

  return (
    <InsightCard
      title="Value opportunities"
      howToRead="Enter book decimal odds to compare with model fair odds. Confidence, stake, and Pass/Watch/Bet use historical hit rates at this model %, not the raw model % alone."
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
        {showConfidence ? (
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted">Bankroll (€)</span>
            <input
              className="w-full rounded-lg border border-glass-border bg-surface px-2 py-1.5 text-sm tabular-nums"
              inputMode="decimal"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              aria-label="Bankroll in euros for Kelly stake"
              placeholder="e.g. 100"
            />
          </label>
        ) : null}
      </div>

      {showConfidence ? (
        <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
          {(
            [
              ["strong", "Strong"],
              ["moderate", "Moderate"],
              ["weak", "Weak"],
              ["none", "None"],
            ] as const
          ).map(([tier, label]) => (
            <span
              key={tier}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ring-1 ring-inset ${TIER_STYLES[tier].badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${TIER_STYLES[tier].dot}`} />
              {label}
              <span className="font-normal opacity-70">· {TIER_STYLES[tier].label}</span>
            </span>
          ))}
        </div>
      ) : null}

      <p className="mb-3 text-xs text-muted">
        Type a book price on a row (or in the quick fields). Edge and stake are measured
        against the historical hit rate when confidence is available - not only against the
        model %. Action is Pass / Watch / Bet from that same history. If stake shows
        “Need ≥ …”, the book is still shorter than that history.
      </p>

      {edgeChart.length ? <EdgeBars data={edgeChart} /> : null}

      <div className="mt-3 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title}
            </p>
            <div className="table-h-scroll">
              <table className="w-full min-w-[28rem] text-left text-sm sm:min-w-[52rem]">
                <thead>
                  <tr className="border-b border-glass-border text-[11px] uppercase text-muted">
                    <th className="py-2 pr-2">Market</th>
                    {showConfidence ? <th className="py-2 pr-2">Confidence</th> : null}
                    <th className="py-2 pr-2">Model %</th>
                    <th className="py-2 pr-2">Fair odds</th>
                    <th className="py-2 pr-2">Book</th>
                    <th className="py-2">{showConfidence ? "Hist edge" : "Edge"}</th>
                    {showConfidence ? <th className="py-2 pl-2">Stake</th> : null}
                    {showConfidence ? <th className="py-2 pl-2">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r) => {
                    const edgePct = showConfidence
                      ? (r.histEdgePct ?? r.modelEdgePct)
                      : r.modelEdgePct;
                    return (
                      <tr key={r.id} className="border-b border-glass-border/60 align-top">
                        <td className="py-2.5 pr-2 font-medium">{r.market}</td>
                        {showConfidence ? (
                          <td className="py-2.5 pr-2">
                            {r.confidence ? <ConfidenceCell lookup={r.confidence} /> : "-"}
                          </td>
                        ) : null}
                        <td className="py-2.5 pr-2 tabular-nums">{pct(r.modelProb)}</td>
                        <td className="py-2.5 pr-2 tabular-nums">
                          {r.fairOdds?.toFixed(2) ?? "-"}
                        </td>
                        <td className="py-2.5 pr-2">
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
                          className={`py-2.5 tabular-nums font-semibold ${
                            edgePct == null
                              ? "text-muted"
                              : edgePct >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {edgePct == null
                            ? "-"
                            : `${edgePct >= 0 ? "+" : ""}${edgePct.toFixed(1)}%`}
                        </td>
                        {showConfidence ? (
                          <td className="py-2.5 pl-2">
                            <StakeCell
                              bookOdds={r.bookOdds}
                              kelly={r.kelly}
                              confidenceTier={r.confidence?.tier}
                            />
                          </td>
                        ) : null}
                        {showConfidence ? (
                          <td className="py-2.5 pl-2">
                            {r.action ? <ActionCell decision={r.action} /> : "-"}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </InsightCard>
  );
}

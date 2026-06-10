"use client";

import { useMemo, useState } from "react";
import {
  computeTwoWayEdge,
  decimalToImpliedPct,
} from "@/lib/prediction/odds-value";
import type { PredictionResult } from "@/lib/types/prediction";
import { InfoTip } from "@/components/ui/InfoTip";

const EDGE_HIGHLIGHT = 3;

function parseOddsInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function formatAsianLine(line: number): string {
  if (line > 0) return `+${line}`;
  return String(line);
}

function EdgeCell({ edge }: { edge: number }) {
  return (
    <span
      className={`font-semibold ${
        Math.abs(edge) >= EDGE_HIGHLIGHT
          ? edge > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
          : ""
      }`}
    >
      {edge > 0 ? "+" : ""}
      {edge.toFixed(1)}%
    </span>
  );
}

function OddsInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full min-w-[3.5rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 ${className}`}
    />
  );
}

export function HandicapMarketPanel({ result }: { result: PredictionResult }) {
  const analytics = result.analytics;
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";

  const [marginOdds, setMarginOdds] = useState<Record<string, string>>({});
  const [ahHomeOdds, setAhHomeOdds] = useState<Record<string, string>>({});
  const [ahAwayOdds, setAhAwayOdds] = useState<Record<string, string>>({});

  const marginRows = useMemo(() => {
    if (!analytics) return [];
    return analytics.handicapMarkets.winningMargins.map((m) => {
      const key = `${m.side}-${m.margin}`;
      const odds = parseOddsInput(marginOdds[key] ?? "");
      const implied = odds != null ? decimalToImpliedPct(odds) : null;
      const edge = implied != null ? m.probabilityPct - implied : null;
      const sideLabel = m.side === "home" ? homeLabel : awayLabel;
      return {
        key,
        label: `${sideLabel} win by +${m.margin}`,
        modelPct: m.probabilityPct,
        odds,
        implied,
        edge,
      };
    });
  }, [analytics, marginOdds, homeLabel, awayLabel]);

  const ahRows = useMemo(() => {
    if (!analytics) return [];
    return analytics.handicapMarkets.asianHandicap.map((line) => {
      const key = String(line.line);
      const homeOdds = parseOddsInput(ahHomeOdds[key] ?? "");
      const awayOdds = parseOddsInput(ahAwayOdds[key] ?? "");
      let edge: number | null = null;
      let fairHome: number | null = null;
      if (homeOdds != null && awayOdds != null) {
        const analysis = computeTwoWayEdge(line.homeCoverPct, {
          home: homeOdds,
          away: awayOdds,
        });
        if (analysis.fair.method !== "invalid") {
          edge = analysis.homeEdgePct;
          fairHome = analysis.fair.homePct;
        }
      }
      return {
        key,
        label: `Home ${formatAsianLine(line.line)}`,
        modelPct: line.homeCoverPct,
        pushPct: line.pushPct,
        homeOdds,
        awayOdds,
        fairHome,
        edge,
      };
    });
  }, [analytics, ahHomeOdds, ahAwayOdds]);

  if (!analytics) return null;

  return (
    <div className="rounded-2xl border border-white/20 bg-white/40 p-4 dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Handicap market comparison
        </h3>
        <InfoTip label="Handicap markets">
          Winning margin and Asian Handicap probabilities come from the same Poisson score grid as
          the main prediction. Lines are from the <strong>home</strong> perspective (negative =
          home gives goals). Enter bookmaker decimal odds to compare fair implied % (MPTO de-vig
          for two-way AH markets) vs this model.
        </InfoTip>
      </div>

      <div className="mt-4 space-y-6">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Winning margin
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-2">Market</th>
                  <th className="pb-2 pr-2">Model %</th>
                  <th className="pb-2 pr-2">Odds</th>
                  <th className="pb-2 pr-2">Implied %</th>
                  <th className="pb-2">Edge</th>
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {marginRows.map((row) => (
                  <tr key={row.key}>
                    <td className="py-1.5 pr-2 font-medium">{row.label}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{row.modelPct.toFixed(1)}%</td>
                    <td className="py-1.5 pr-2">
                      <OddsInput
                        value={marginOdds[row.key] ?? ""}
                        onChange={(v) =>
                          setMarginOdds((prev) => ({ ...prev, [row.key]: v }))
                        }
                        placeholder="5.50"
                      />
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {row.implied != null ? `${row.implied.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-1.5">
                      {row.edge != null ? <EdgeCell edge={row.edge} /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Asian Handicap
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-2">Line</th>
                  <th className="pb-2 pr-2">Model %</th>
                  <th className="pb-2 pr-2">{homeLabel}</th>
                  <th className="pb-2 pr-2">{awayLabel}</th>
                  <th className="pb-2 pr-2">Fair home %</th>
                  <th className="pb-2">Home edge</th>
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {ahRows.map((row) => (
                  <tr key={row.key}>
                    <td className="py-1.5 pr-2 font-medium">
                      {row.label}
                      {row.pushPct != null ? (
                        <span className="ml-1 text-[10px] text-slate-400">
                          (push {row.pushPct.toFixed(1)}%)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{row.modelPct.toFixed(1)}%</td>
                    <td className="py-1.5 pr-2">
                      <OddsInput
                        value={ahHomeOdds[row.key] ?? ""}
                        onChange={(v) =>
                          setAhHomeOdds((prev) => ({ ...prev, [row.key]: v }))
                        }
                        placeholder="1.90"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <OddsInput
                        value={ahAwayOdds[row.key] ?? ""}
                        onChange={(v) =>
                          setAhAwayOdds((prev) => ({ ...prev, [row.key]: v }))
                        }
                        placeholder="1.95"
                      />
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {row.fairHome != null ? `${row.fairHome.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-1.5">
                      {row.edge != null ? <EdgeCell edge={row.edge} /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-slate-400">
              AH de-vig: MPTO on home/away cover odds · Edge = model home cover % − fair home %
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

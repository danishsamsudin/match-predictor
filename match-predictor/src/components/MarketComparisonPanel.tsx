"use client";

import { useMemo, useState } from "react";
import { computeValueEdges } from "@/lib/prediction/odds-value";
import type { PredictionResult } from "@/lib/types/prediction";

const EDGE_HIGHLIGHT = 3;

function parseOddsInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function MarketComparisonPanel({ result }: { result: PredictionResult }) {
  const [homeOdds, setHomeOdds] = useState("");
  const [drawOdds, setDrawOdds] = useState("");
  const [awayOdds, setAwayOdds] = useState("");

  const analysis = useMemo(() => {
    const home = parseOddsInput(homeOdds);
    const draw = parseOddsInput(drawOdds);
    const away = parseOddsInput(awayOdds);
    if (home == null || draw == null || away == null) return null;

    return computeValueEdges(
      {
        homeWinPct: result.homeWinPct,
        drawPct: result.drawPct,
        awayWinPct: result.awayWinPct,
      },
      { home, draw, away }
    );
  }, [homeOdds, drawOdds, awayOdds, result]);

  return (
    <div className="rounded-2xl border border-white/20 bg-white/40 p-4 dark:border-slate-700/60 dark:bg-slate-900/40">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
        Market comparison
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Enter bookmaker decimal odds to compare fair implied % (MPTO de-vig) vs this model.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="text-xs text-slate-500">
          Home
          <input
            type="text"
            inputMode="decimal"
            value={homeOdds}
            onChange={(e) => setHomeOdds(e.target.value)}
            placeholder="2.10"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          Draw
          <input
            type="text"
            inputMode="decimal"
            value={drawOdds}
            onChange={(e) => setDrawOdds(e.target.value)}
            placeholder="3.40"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          Away
          <input
            type="text"
            inputMode="decimal"
            value={awayOdds}
            onChange={(e) => setAwayOdds(e.target.value)}
            placeholder="3.60"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        </label>
      </div>

      {analysis && analysis.fair.method !== "invalid" && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Outcome</th>
                <th className="pb-2">Model %</th>
                <th className="pb-2">Fair implied %</th>
                <th className="pb-2">Edge</th>
              </tr>
            </thead>
            <tbody className="text-slate-800 dark:text-slate-200">
              {(
                [
                  ["Home", result.homeWinPct, analysis.fair.homePct, analysis.homeEdgePct],
                  ["Draw", result.drawPct, analysis.fair.drawPct, analysis.drawEdgePct],
                  ["Away", result.awayWinPct, analysis.fair.awayPct, analysis.awayEdgePct],
                ] as const
              ).map(([label, model, fair, edge]) => (
                <tr key={label}>
                  <td className="py-1 font-medium">{label}</td>
                  <td className="py-1">{model.toFixed(1)}%</td>
                  <td className="py-1">{fair.toFixed(1)}%</td>
                  <td
                    className={`py-1 font-semibold ${
                      Math.abs(edge) >= EDGE_HIGHLIGHT
                        ? edge > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                        : ""
                    }`}
                  >
                    {edge > 0 ? "+" : ""}
                    {edge.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-400">
            De-vig: {analysis.fair.method.toUpperCase()} · raw market{" "}
            {analysis.fair.totalRawImpliedPct.toFixed(1)}%
          </p>
        </div>
      )}
    </div>
  );
}

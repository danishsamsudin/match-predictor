"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Target, TrendingUp } from "lucide-react";
import type { PredictionResult } from "@/lib/types/prediction";

export function PredictionResultCard({ result }: { result: PredictionResult }) {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold">Prediction Results</h2>
          {result.mode === "compare" && (
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
              Hypothetical match
            </span>
          )}
          {result.entityType === "national" && (
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
              National teams
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6 p-6">
        <WinProbabilityBar
          home={result.homeWinPct}
          draw={result.drawPct}
          away={result.awayWinPct}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <StatBox label="Home xG" value={result.expectedGoals.home.toFixed(2)} />
          <StatBox label="Away xG" value={result.expectedGoals.away.toFixed(2)} />
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <Target className="h-4 w-4" />
            Estimated Match Stats
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Corners" value={String(result.estimated.corners)} small />
            <StatBox label="Fouls" value={String(result.estimated.fouls)} small />
            <StatBox label="Yellow Cards" value={String(result.estimated.yellowCards)} small />
            <StatBox label="Red Cards" value={String(result.estimated.redCards)} small />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex w-full items-center justify-between rounded-lg bg-zinc-50 px-4 py-3 text-sm font-medium transition hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Analysis Breakdown
            {showExplanation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showExplanation && (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {result.explanation}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function WinProbabilityBar({
  home,
  draw,
  away,
}: {
  home: number;
  draw: number;
  away: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex h-8 overflow-hidden rounded-full">
        <div
          className="flex items-center justify-center bg-emerald-600 text-xs font-semibold text-white"
          style={{ width: `${home}%` }}
        >
          {home >= 12 ? `${home}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-zinc-400 text-xs font-semibold text-white"
          style={{ width: `${draw}%` }}
        >
          {draw >= 12 ? `${draw}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-blue-600 text-xs font-semibold text-white"
          style={{ width: `${away}%` }}
        >
          {away >= 12 ? `${away}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>Home Win {home}%</span>
        <span>Draw {draw}%</span>
        <span>Away Win {away}%</span>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50 ${small ? "p-3" : "p-4"}`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-semibold ${small ? "text-lg" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

export function PredictionResultDisplay({
  result,
}: {
  result: {
    home_win_pct: number;
    away_win_pct: number;
    draw_pct: number;
    home_xg: number;
    away_xg: number;
    estimated_corners: number;
    estimated_fouls: number;
    estimated_yellow_cards: number;
    estimated_red_cards: number;
    explanation: string;
  };
}) {
  return (
    <PredictionResultCard
      result={{
        homeWinPct: Number(result.home_win_pct),
        awayWinPct: Number(result.away_win_pct),
        drawPct: Number(result.draw_pct),
        expectedGoals: { home: Number(result.home_xg), away: Number(result.away_xg) },
        estimated: {
          corners: Number(result.estimated_corners),
          fouls: Number(result.estimated_fouls),
          yellowCards: Number(result.estimated_yellow_cards),
          redCards: Number(result.estimated_red_cards),
        },
        explanation: result.explanation,
      }}
    />
  );
}

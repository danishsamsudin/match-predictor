"use client";

import type { PlayerPropsPayload } from "@/lib/prediction/player-props";

export type ModelSquadPredictionCompare = {
  matchId: string;
  computedAt: string | null;
  teamPrediction: {
    homeWinPct?: number;
    drawPct?: number;
    awayWinPct?: number;
    expectedGoals?: { home: number; away: number };
    predictedScore?: { home: number; away: number };
  } | null;
  playerProps: PlayerPropsPayload | null;
  actual: {
    homeGoals: number | null;
    awayGoals: number | null;
    homeSot?: number | null;
    awaySot?: number | null;
  };
};

export function ModelPredictionComparePanel({
  homeName,
  awayName,
  compare,
}: {
  homeName: string;
  awayName: string;
  compare: ModelSquadPredictionCompare;
}) {
  if (!compare.teamPrediction) return null;

  const pred = compare.teamPrediction;
  const eg = pred.expectedGoals;
  const score = pred.predictedScore;
  const actual = compare.actual;

  return (
    <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 text-sm dark:border-slate-700/80 dark:bg-slate-900/40">
      <h4 className="mb-3 font-semibold text-slate-900 dark:text-white">
        Model Squad (pre-match) vs actual
      </h4>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
            Model (pre-match)
          </p>
          <ul className="space-y-1 text-slate-700 dark:text-slate-200">
            <li>
              1X2: {(pred.homeWinPct ?? 0).toFixed(1)}% / {(pred.drawPct ?? 0).toFixed(1)}% /{" "}
              {(pred.awayWinPct ?? 0).toFixed(1)}%
            </li>
            {eg && (
              <li>
                xG: {eg.home.toFixed(2)} – {eg.away.toFixed(2)}
              </li>
            )}
            {score && (
              <li>
                Pred. score: {score.home}–{score.away}
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Actual (Opta)
          </p>
          <ul className="space-y-1 text-slate-700 dark:text-slate-200">
            <li>
              Score: {actual.homeGoals ?? "—"}–{actual.awayGoals ?? "—"}
            </li>
            {(actual.homeSot != null || actual.awaySot != null) && (
              <li>
                SoT: {actual.homeSot ?? "—"} – {actual.awaySot ?? "—"}
              </li>
            )}
          </ul>
        </div>
      </div>
      {compare.playerProps && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Top scorer props (model)</p>
          <div className="grid gap-2 md:grid-cols-2">
            {[compare.playerProps.home, compare.playerProps.away].map((side, idx) => (
              <div key={idx}>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {idx === 0 ? homeName : awayName}
                </p>
                <ul className="text-xs text-slate-600 dark:text-slate-400">
                  {side.anytimeScorer.slice(0, 3).map((p) => (
                    <li key={p.playerName}>
                      {p.playerName}: {p.probabilityPct}% anytime
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

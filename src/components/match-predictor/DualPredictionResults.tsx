"use client";

import { PredictionResultCard } from "@/components/PredictionResult";
import type { FixtureLineup } from "@/lib/types/football";
import type { PredictionLineupSource, PredictionResult } from "@/lib/types/prediction";

function formatDelta(value: number, suffix = ""): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function CompareSummary({
  manual,
  model,
}: {
  manual: PredictionResult;
  model: PredictionResult;
}) {
  const homeXgDelta =
    manual.expectedGoals.home - model.expectedGoals.home;
  const awayXgDelta =
    manual.expectedGoals.away - model.expectedGoals.away;
  const homeWinDelta = manual.homeWinPct - model.homeWinPct;

  return (
    <div className="rounded-xl border border-white/30 bg-white/40 px-4 py-3 text-sm dark:border-slate-800/60 dark:bg-slate-900/40">
      <p className="font-semibold text-slate-900 dark:text-white">Comparison</p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>
          Home xG: Your XI {manual.expectedGoals.home.toFixed(2)} vs Model{" "}
          {model.expectedGoals.home.toFixed(2)} ({formatDelta(homeXgDelta)})
        </li>
        <li>
          Away xG: Your XI {manual.expectedGoals.away.toFixed(2)} vs Model{" "}
          {model.expectedGoals.away.toFixed(2)} ({formatDelta(awayXgDelta)})
        </li>
        <li>
          Home win %: Your XI {manual.homeWinPct}% vs Model {model.homeWinPct}% (
          {formatDelta(homeWinDelta, "%")})
        </li>
      </ul>
    </div>
  );
}

export function DualPredictionResults({
  resultsBySource,
  loading,
  onRerunWithLineups,
}: {
  resultsBySource: Partial<Record<PredictionLineupSource, PredictionResult>>;
  loading?: boolean;
  onRerunWithLineups?: (lineups: FixtureLineup[]) => void;
}) {
  const manual = resultsBySource.manual_xi;
  const model = resultsBySource.model_xi;
  const hasBoth = Boolean(manual && model);
  const single = manual ?? model;

  if (!single) return null;

  if (!hasBoth) {
    return (
      <div className="space-y-3">
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Switch lineup mode on Generate and run again to compare Your XI vs Model
          squad.
        </p>
        <PredictionResultCard
          result={single}
          onRerunWithLineups={
            single.lineupSource === "model_xi" ? undefined : onRerunWithLineups
          }
          loading={loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CompareSummary manual={manual!} model={model!} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Your XI · Player xG
          </p>
          <PredictionResultCard
            result={manual!}
            onRerunWithLineups={onRerunWithLineups}
            loading={loading}
            compact
          />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Model squad · Team xG
          </p>
          <PredictionResultCard
            result={model!}
            loading={loading}
            compact
          />
        </div>
      </div>
    </div>
  );
}

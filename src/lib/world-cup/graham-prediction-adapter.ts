import { computeHandicapMarkets } from "@/lib/prediction/handicap-probabilities";
import { computeMarketAnalytics } from "@/lib/prediction/market-probabilities";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import {
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
} from "@/lib/world-cup/score-grid";
import type {
  PredictionAnalytics,
  PredictionLineupSource,
  PredictionResult,
} from "@/lib/types/prediction";
import type { EstimatedMatchStats } from "@/lib/prediction/estimated-match-stats";
import type { WcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

export function buildAnalyticsFromHubPrediction(
  pred: HubPredictionRow,
  homeName: string,
  awayName: string,
  context?: WcPredictionAnalyticsContext
): PredictionAnalytics {
  const snap = pred.snapshot;
  const homeXg = snapshotNumber(snap, "home_xg", "lambda");
  const awayXg = snapshotNumber(snap, "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");

  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);
  const matrix = grid.cells.map((c) => ({
    home: c.home,
    away: c.away,
    probability: c.probability,
  }));

  const handicapMarkets = computeHandicapMarkets(matrix);

  return computeMarketAnalytics(homeXg, awayXg, {
    h2hHomeWinRate: context?.h2hHomeWinRate ?? pred.home_win_pct,
    h2hDrawRate: context?.h2hDrawRate ?? pred.draw_pct,
    h2hAwayWinRate: context?.h2hAwayWinRate ?? pred.away_win_pct,
    homeFormScore: context?.homeFormScore ?? 0.5,
    awayFormScore: context?.awayFormScore ?? 0.5,
    momentumIndex: Number(snap.momentum_index ?? 0),
    modelImpact: [
      {
        label: "Graham WC hub",
        homeMultiplier: Number(snap.gamma_home ?? 1),
        awayMultiplier: Number(snap.gamma_away ?? 1),
      },
    ],
    statComparison: context?.statComparison ?? [
      { metric: "Expected goals", home: homeXg, away: awayXg },
    ],
    correlation: rho,
    heatmapMaxGoals: grid.maxGoals,
  });
}

export function grahamHubRowToPredictionResult(input: {
  pred: HubPredictionRow;
  homeName: string;
  awayName: string;
  explanation?: string;
  estimated?: EstimatedMatchStats;
  lineupSource?: PredictionLineupSource;
  lineupNotes?: string[];
  analyticsContext?: WcPredictionAnalyticsContext;
}): PredictionResult {
  const { pred, homeName, awayName } = input;
  const lineupSource = input.lineupSource ?? "model_xi";
  const lineupNotes = input.lineupNotes ?? [];
  const snap = pred.snapshot;
  const homeXg = snapshotNumber(snap, "home_xg", "lambda");
  const awayXg = snapshotNumber(snap, "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");
  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw);
  const analytics = buildAnalyticsFromHubPrediction(
    pred,
    homeName,
    awayName,
    input.analyticsContext
  );

  return {
    modelVersion: pred.model_version,
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeWinPct: Math.round(pred.home_win_pct * 1000) / 10,
    drawPct: Math.round(pred.draw_pct * 1000) / 10,
    awayWinPct: Math.round(pred.away_win_pct * 1000) / 10,
    expectedGoals: { home: homeXg, away: awayXg },
    estimated: input.estimated ?? {
      corners: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
    },
    explanation:
      input.explanation ??
      [
        `Graham World Cup model (${pred.model_version}): λ=${homeXg.toFixed(2)}, μ=${awayXg.toFixed(2)}, ρ=${rho.toFixed(3)}. Most likely ${outcomes.predictedHome}–${outcomes.predictedAway}.`,
        lineupNotes.length ? "" : null,
        lineupNotes.length ? "## Lineup Impact" : null,
        ...lineupNotes,
      ]
        .filter((line): line is string => line != null && line.length > 0)
        .join("\n"),
    analytics,
    teamComparison: input.analyticsContext?.teamComparison,
    mode: "compare",
    entityType: "national",
    lineupSource,
    debug: { factors: snap as Record<string, number> },
  };
}

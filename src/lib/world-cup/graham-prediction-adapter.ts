import { resolveFormMomentumOutcomeDisplayRates } from "@/lib/prediction/form-momentum";
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
import { clampEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import type { WcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";
import { applyMarketModelCalibration } from "@/lib/world-cup/market-models/apply";
import { buildWcGrahamModelImpact } from "@/lib/world-cup/build-wc-model-impact";
import { loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";

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
  context?: WcPredictionAnalyticsContext,
  calibration?: Awaited<ReturnType<typeof loadWcCalibrationConfig>>
): PredictionAnalytics {
  const snap = pred.snapshot;
  const homeXg = snapshotNumber(snap, "home_xg", "lambda");
  const awayXg = snapshotNumber(snap, "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");

  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);

  const formMomentumOutcomes = resolveFormMomentumOutcomeDisplayRates({
    h2hHasData: context?.h2hHasData ?? false,
    h2hHomeWinRate: context?.h2hHomeWinRate ?? pred.home_win_pct,
    h2hDrawRate: context?.h2hDrawRate ?? pred.draw_pct,
    h2hAwayWinRate: context?.h2hAwayWinRate ?? pred.away_win_pct,
    modelHomeWinRate: pred.home_win_pct,
    modelDrawRate: pred.draw_pct,
    modelAwayWinRate: pred.away_win_pct,
  });

  const base = computeMarketAnalytics(homeXg, awayXg, {
    h2hHomeWinRate: formMomentumOutcomes.homeWinRate,
    h2hDrawRate: formMomentumOutcomes.drawRate,
    h2hAwayWinRate: formMomentumOutcomes.awayWinRate,
    h2hHasData: context?.h2hHasData ?? false,
    homeFormScore: context?.homeFormScore ?? 0.5,
    awayFormScore: context?.awayFormScore ?? 0.5,
    momentumIndex: Number(snap.momentum_index ?? 0),
    modelImpact: buildWcGrahamModelImpact(snap),
    statComparison: context?.statComparison ?? [
      { metric: "Expected goals", home: homeXg, away: awayXg },
    ],
    correlation: rho,
    heatmapMaxGoals: grid.maxGoals,
  });

  if (!calibration) return base;

  return applyMarketModelCalibration(base, pred, calibration, {
    homeFormScore: context?.homeFormScore,
    awayFormScore: context?.awayFormScore,
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
  calibration?: Awaited<ReturnType<typeof loadWcCalibrationConfig>>;
  analytics?: PredictionAnalytics;
}): PredictionResult {
  const { pred, homeName, awayName } = input;
  const lineupSource = input.lineupSource ?? "model_xi";
  const lineupNotes = input.lineupNotes ?? [];
  const snap = pred.snapshot;
  const homeXg = snapshotNumber(snap, "display_home_xg", "home_xg", "lambda");
  const awayXg = snapshotNumber(snap, "display_away_xg", "away_xg", "mu");
  const rho = snapshotNumber(snap, "rho");
  const mutualDraw = String(snap.scenario ?? "").includes("mutual_draw");
  const weatherCondition =
    typeof snap.weather_condition === "string" ? snap.weather_condition : null;
  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw);
  const analytics =
    input.analytics ??
    buildAnalyticsFromHubPrediction(
      pred,
      homeName,
      awayName,
      input.analyticsContext,
      input.calibration
    );

  return {
    modelVersion: pred.model_version,
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeWinPct: Math.round(pred.home_win_pct * 1000) / 10,
    drawPct: Math.round(pred.draw_pct * 1000) / 10,
    awayWinPct: Math.round(pred.away_win_pct * 1000) / 10,
    expectedGoals: { home: homeXg, away: awayXg },
    estimated: clampEstimatedMatchStats(
      input.estimated ?? {
        corners: 0,
        fouls: 0,
        yellowCards: 0,
        redCards: 0,
      }
    ),
    explanation:
      input.explanation ??
      [
        `Graham World Cup model (${pred.model_version}): λ=${homeXg.toFixed(2)}, μ=${awayXg.toFixed(2)}, ρ=${rho.toFixed(3)}. Most likely ${outcomes.predictedHome}–${outcomes.predictedAway}.`,
        weatherCondition ? `Kickoff forecast: ${weatherCondition}.` : null,
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

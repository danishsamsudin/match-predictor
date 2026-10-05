import {
  EUROPEAN_HANDICAP_LINES,
  MATCH_GOAL_RANGE_BANDS,
  TEAM_GOAL_RANGE_BANDS,
  TEAM_TOTAL_LINES,
} from "@/lib/glpm-cx/derived-markets";
import { deriveClubMarketsFromGraham } from "@/lib/prediction/derive-graham-club-markets";
import { brierScore } from "@/lib/world-cup/market-models/stacking";
import { buildAnalyticsFromHubPrediction } from "@/lib/world-cup/graham-prediction-adapter";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

export type DerivedMarketEvalRow = {
  matchId: string;
  marketId: string;
  marketKey: string;
  predicted: { prob: number };
  actual: { hit: boolean };
  lossMetric: "brier";
  lossValue: number;
  modelVersion: string;
};

function snapshotNumber(snapshot: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1.2;
}

function ehTag(line: number): string {
  return line > 0 ? `+${line}` : String(line);
}

function inRange(goals: number, lo: number, hi: number): boolean {
  return goals >= lo && goals <= hi;
}

function row(
  marketId: string,
  marketKey: string,
  prob: number,
  hit: boolean,
  modelVersion: string
): DerivedMarketEvalRow {
  const p = Number.isFinite(prob) ? Math.max(0, Math.min(1, prob)) : 0;
  return {
    matchId: "",
    marketId,
    marketKey,
    predicted: { prob: p },
    actual: { hit },
    lossMetric: "brier",
    lossValue: brierScore(p, hit),
    modelVersion,
  };
}

export function settleDerivedMarketHits(actualHome: number, actualAway: number) {
  const total = actualHome + actualAway;
  const outcome = actualHome > actualAway ? "home" : actualHome === actualAway ? "draw" : "away";
  return {
    doubleChance: {
      "1x": outcome === "home" || outcome === "draw",
      "12": outcome === "home" || outcome === "away",
      x2: outcome === "draw" || outcome === "away",
    },
    matchRange: MATCH_GOAL_RANGE_BANDS.map((band) => ({
      label: band.label,
      hit: inRange(total, band.lo, band.hi),
    })),
    homeRange: TEAM_GOAL_RANGE_BANDS.map((band) => ({
      label: band.label,
      hit: inRange(actualHome, band.lo, band.hi),
    })),
    awayRange: TEAM_GOAL_RANGE_BANDS.map((band) => ({
      label: band.label,
      hit: inRange(actualAway, band.lo, band.hi),
    })),
    europeanHandicap: EUROPEAN_HANDICAP_LINES.map((line) => {
      const margin = actualHome - actualAway + line;
      const side = margin > 0 ? "home" : margin === 0 ? "draw" : "away";
      return { line, side };
    }),
    teamTotals: TEAM_TOTAL_LINES.map((line) => ({
      line,
      homeOver: actualHome > line,
      homeUnder: actualHome < line,
      awayOver: actualAway > line,
      awayUnder: actualAway < line,
    })),
  };
}

export function evaluateDerivedMarketsForMatch(input: {
  pred: HubPredictionRow;
  actualHome: number;
  actualAway: number;
  calibration?: WcCalibrationConstants;
  modelVersion: string;
}): DerivedMarketEvalRow[] {
  const { pred, actualHome, actualAway, calibration, modelVersion } = input;
  const analytics = buildAnalyticsFromHubPrediction(pred, "Home", "Away", undefined, calibration);
  const snap = pred.snapshot;
  const asPct = (n: number) => (n > 1 ? n : n * 100);
  const derived = deriveClubMarketsFromGraham({
    homeWinPct: asPct(Number(pred.home_win_pct)),
    drawPct: asPct(Number(pred.draw_pct)),
    awayWinPct: asPct(Number(pred.away_win_pct)),
    homeXg: snapshotNumber(snap, "home_xg", "lambda"),
    awayXg: snapshotNumber(snap, "away_xg", "mu"),
    rho: snapshotNumber(snap, "rho"),
    mutualDraw: String(snap.scenario ?? "").includes("mutual_draw"),
    analytics,
  });
  const settled = settleDerivedMarketHits(actualHome, actualAway);
  const out: DerivedMarketEvalRow[] = [];

  out.push(
    row("double_chance", "1x", derived.doubleChance.homeOrDraw, settled.doubleChance["1x"], modelVersion),
    row("double_chance", "12", derived.doubleChance.homeOrAway, settled.doubleChance["12"], modelVersion),
    row("double_chance", "x2", derived.doubleChance.drawOrAway, settled.doubleChance.x2, modelVersion)
  );

  for (const band of settled.matchRange) {
    const predBand = derived.goalRanges.match.find((b) => b.label === band.label);
    out.push(
      row("goal_range_match", band.label, predBand?.probability ?? 0, band.hit, modelVersion)
    );
  }
  for (const band of settled.homeRange) {
    const predBand = derived.goalRanges.home.find((b) => b.label === band.label);
    out.push(
      row("goal_range_home", band.label, predBand?.probability ?? 0, band.hit, modelVersion)
    );
  }
  for (const band of settled.awayRange) {
    const predBand = derived.goalRanges.away.find((b) => b.label === band.label);
    out.push(
      row("goal_range_away", band.label, predBand?.probability ?? 0, band.hit, modelVersion)
    );
  }

  for (const eh of derived.europeanHandicap) {
    const actual = settled.europeanHandicap.find((s) => s.line === eh.line);
    const tag = ehTag(eh.line);
    out.push(
      row("european_handicap", `${tag}_home`, eh.home, actual?.side === "home", modelVersion),
      row("european_handicap", `${tag}_draw`, eh.draw, actual?.side === "draw", modelVersion),
      row("european_handicap", `${tag}_away`, eh.away, actual?.side === "away", modelVersion)
    );
  }

  for (const line of derived.teamTotals) {
    const actual = settled.teamTotals.find((t) => t.line === line.line);
    out.push(
      row("team_total", `home_over_${line.line}`, line.homeOver, actual?.homeOver ?? false, modelVersion),
      row("team_total", `home_under_${line.line}`, line.homeUnder, actual?.homeUnder ?? false, modelVersion),
      row("team_total", `away_over_${line.line}`, line.awayOver, actual?.awayOver ?? false, modelVersion),
      row("team_total", `away_under_${line.line}`, line.awayUnder, actual?.awayUnder ?? false, modelVersion)
    );
  }

  return out;
}

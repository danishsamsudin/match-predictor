import fs from "node:fs";
import path from "node:path";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import {
  accumulateTeamWidgetSample,
  buildWcTeamStyleProfile,
  computeTournamentStyleBaselines,
  type WcTeamStyleProfile,
  type WcTournamentStyleBaselines,
} from "@/lib/world-cup/opta-widget-stats";
export type { WcTeamStyleProfile, WcTournamentStyleBaselines } from "@/lib/world-cup/opta-widget-stats";
import {
  listWcOptaHtmlFixtureFiles,
  WC_OPTA_HTML_FIXTURES_DIR,
} from "@/lib/world-cup/wc-opta-results-dir";

/** @deprecated Use WcTeamStyleProfile — kept for callers expecting event rates only. */
export interface WcTeamEventRates {
  teamApiId: number;
  cornersPerGame: number;
  foulsPerGame: number;
  yellowPerGame: number;
  redPerGame: number;
  games: number;
}

export interface WcOptaMatchEventSample {
  homeTeamApiId: number;
  awayTeamApiId: number;
  totalXg: number;
  totalCorners: number;
  totalFouls: number;
  totalYellow: number;
  totalRed: number;
  totalShotsOnTarget: number;
  totalCrosses: number;
  totalFinalThirdEntries: number;
  totalTackles: number;
}

/** Tournament-level priors and xG-linked regression from completed WC matches. */
export interface WcTournamentEventCalibration {
  sampleCount: number;
  avgCornersPerMatch: number;
  avgFoulsPerMatch: number;
  avgYellowPerMatch: number;
  avgRedPerMatch: number;
  avgShotsOnTargetPerMatch: number;
  cornersIntercept: number;
  cornersXgSlope: number;
  yellowIntercept: number;
  yellowXgSlope: number;
  redIntercept: number;
  foulsIntercept: number;
  foulsXgSlope: number;
  /** Per-team event rates (legacy shape). */
  teamRates: Map<number, WcTeamEventRates>;
  /** Richer per-team style from full Opta widget stats. */
  teamStyles: Map<number, WcTeamStyleProfile>;
  styleBaselines: WcTournamentStyleBaselines;
}

/** Fallback priors when no Opta HTML has been ingested yet. */
export const WC_EVENT_PRIORS = {
  cornersPerMatch: 9.8,
  foulsPerMatch: 23.5,
  yellowPerMatch: 3.6,
  redPerMatch: 0.12,
  shotsOnTargetPerMatch: 8.5,
  cornersIntercept: 4.2,
  cornersXgSlope: 1.85,
  yellowIntercept: 2.1,
  yellowXgSlope: 0.55,
  redIntercept: 0.08,
  foulsIntercept: 18,
  foulsXgSlope: 1.2,
} as const;

let cachedCalibration: WcTournamentEventCalibration | null = null;

type TeamAccum = {
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  shotsOnTarget: number;
  crosses: number;
  finalThirdEntries: number;
  tackles: number;
  interceptions: number;
  recoveries: number;
  duels: number;
  aerialDuels: number;
  possessionPct: number;
  games: number;
};

function emptyTeamAccum(): TeamAccum {
  return {
    corners: 0,
    fouls: 0,
    yellow: 0,
    red: 0,
    shotsOnTarget: 0,
    crosses: 0,
    finalThirdEntries: 0,
    tackles: 0,
    interceptions: 0,
    recoveries: 0,
    duels: 0,
    aerialDuels: 0,
    possessionPct: 0,
    games: 0,
  };
}

function linearRegression(
  points: Array<{ x: number; y: number }>
): { intercept: number; slope: number } {
  if (points.length === 0) {
    return { intercept: WC_EVENT_PRIORS.cornersIntercept, slope: WC_EVENT_PRIORS.cornersXgSlope };
  }
  if (points.length === 1) {
    const p = points[0];
    return {
      intercept: Math.max(0, p.y - WC_EVENT_PRIORS.cornersXgSlope * p.x),
      slope: WC_EVENT_PRIORS.cornersXgSlope,
    };
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) {
    return { intercept: sumY / n, slope: 0 };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}

function listFixtureOptaHtmlFiles(): string[] {
  return listWcOptaHtmlFixtureFiles(WC_OPTA_HTML_FIXTURES_DIR);
}

/** Runtime calibration uses committed test fixtures only; production relies on Supabase + priors. */
function collectOptaHtmlPaths(): string[] {
  return listFixtureOptaHtmlFiles().map((file) => path.resolve(file));
}

function teamRatesFromAccum(teamApiId: number, acc: TeamAccum): WcTeamEventRates {
  const g = Math.max(1, acc.games);
  return {
    teamApiId,
    cornersPerGame: acc.corners / g,
    foulsPerGame: acc.fouls / g,
    yellowPerGame: acc.yellow / g,
    redPerGame: acc.red / g,
    games: acc.games,
  };
}

function buildCalibrationFromSamples(
  samples: WcOptaMatchEventSample[],
  teamAccum: Map<number, TeamAccum>
): WcTournamentEventCalibration {
  const styleBaselines = computeTournamentStyleBaselines(
    [...teamAccum.values()].map((acc) => ({
      corners: acc.corners / Math.max(1, acc.games),
      fouls: acc.fouls / Math.max(1, acc.games),
      crosses: acc.crosses / Math.max(1, acc.games),
      finalThirdEntries: acc.finalThirdEntries / Math.max(1, acc.games),
      tackles: acc.tackles / Math.max(1, acc.games),
      interceptions: acc.interceptions / Math.max(1, acc.games),
      recoveries: acc.recoveries / Math.max(1, acc.games),
      duels: acc.duels / Math.max(1, acc.games),
      aerialDuels: acc.aerialDuels / Math.max(1, acc.games),
      possessionPct: acc.possessionPct / Math.max(1, acc.games),
    }))
  );

  const teamStyles = new Map<number, WcTeamStyleProfile>();
  const teamRates = new Map<number, WcTeamEventRates>();
  for (const [teamApiId, acc] of teamAccum) {
    if (acc.games <= 0) continue;
    teamRates.set(teamApiId, teamRatesFromAccum(teamApiId, acc));
    teamStyles.set(
      teamApiId,
      buildWcTeamStyleProfile({
        teamApiId,
        games: acc.games,
        corners: acc.corners,
        fouls: acc.fouls,
        yellow: acc.yellow,
        red: acc.red,
        shotsOnTarget: acc.shotsOnTarget,
        crosses: acc.crosses,
        finalThirdEntries: acc.finalThirdEntries,
        tackles: acc.tackles,
        interceptions: acc.interceptions,
        recoveries: acc.recoveries,
        duels: acc.duels,
        aerialDuels: acc.aerialDuels,
        possessionPct: acc.possessionPct,
        tournamentBaselines: styleBaselines,
      })
    );
  }

  if (samples.length === 0) {
    return {
      sampleCount: 0,
      avgCornersPerMatch: WC_EVENT_PRIORS.cornersPerMatch,
      avgFoulsPerMatch: WC_EVENT_PRIORS.foulsPerMatch,
      avgYellowPerMatch: WC_EVENT_PRIORS.yellowPerMatch,
      avgRedPerMatch: WC_EVENT_PRIORS.redPerMatch,
      avgShotsOnTargetPerMatch: WC_EVENT_PRIORS.shotsOnTargetPerMatch,
      cornersIntercept: WC_EVENT_PRIORS.cornersIntercept,
      cornersXgSlope: WC_EVENT_PRIORS.cornersXgSlope,
      yellowIntercept: WC_EVENT_PRIORS.yellowIntercept,
      yellowXgSlope: WC_EVENT_PRIORS.yellowXgSlope,
      redIntercept: WC_EVENT_PRIORS.redIntercept,
      foulsIntercept: WC_EVENT_PRIORS.foulsIntercept,
      foulsXgSlope: WC_EVENT_PRIORS.foulsXgSlope,
      teamRates,
      teamStyles,
      styleBaselines,
    };
  }

  const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  const cornerRegression = linearRegression(
    samples.map((s) => ({ x: s.totalXg, y: s.totalCorners }))
  );
  const yellowRegression = linearRegression(
    samples.map((s) => ({ x: s.totalXg, y: s.totalYellow }))
  );
  const foulRegression = linearRegression(
    samples.map((s) => ({ x: s.totalXg, y: s.totalFouls }))
  );
  const foulsWithData = samples.filter((s) => s.totalFouls > 0);

  return {
    sampleCount: samples.length,
    avgCornersPerMatch: avg(samples.map((s) => s.totalCorners)),
    avgFoulsPerMatch:
      foulsWithData.length > 0
        ? avg(foulsWithData.map((s) => s.totalFouls))
        : WC_EVENT_PRIORS.foulsPerMatch,
    avgYellowPerMatch: avg(samples.map((s) => s.totalYellow)),
    avgRedPerMatch: avg(samples.map((s) => s.totalRed)),
    avgShotsOnTargetPerMatch: avg(samples.map((s) => s.totalShotsOnTarget)),
    cornersIntercept: Math.max(2.5, cornerRegression.intercept),
    cornersXgSlope: Math.max(0.4, cornerRegression.slope),
    yellowIntercept: Math.max(1.2, yellowRegression.intercept),
    yellowXgSlope: Math.max(0.15, yellowRegression.slope),
    redIntercept: Math.max(0.04, avg(samples.map((s) => s.totalRed))),
    foulsIntercept:
      foulsWithData.length > 0
        ? Math.max(12, foulRegression.intercept)
        : WC_EVENT_PRIORS.foulsIntercept,
    foulsXgSlope:
      foulsWithData.length > 0
        ? Math.max(0.3, foulRegression.slope)
        : WC_EVENT_PRIORS.foulsXgSlope,
    teamRates,
    teamStyles,
    styleBaselines,
  };
}

function parseOptaEventSample(filePath: string): WcOptaMatchEventSample | null {
  try {
    const parsed = parseOptaMatchFromFile(filePath);
    if (!parsed.homeTeamApiId || !parsed.awayTeamApiId) return null;
    if (parsed.homeXg == null || parsed.awayXg == null) return null;

    const ws = parsed.widgetStats;
    const homeCorners = ws?.home.cornersWon ?? parsed.homeCorners ?? 0;
    const awayCorners = ws?.away.cornersWon ?? parsed.awayCorners ?? 0;
    if (homeCorners <= 0 && awayCorners <= 0) return null;

    const homeFouls = ws?.home.foulsConceded ?? parsed.homeFoulsConceded ?? 0;
    const awayFouls = ws?.away.foulsConceded ?? parsed.awayFoulsConceded ?? 0;
    const totalYellow =
      (ws?.home.yellowCards ?? parsed.narrativeFeatures.yellowCardsHome) +
      (ws?.away.yellowCards ?? parsed.narrativeFeatures.yellowCardsAway);
    const totalRed =
      (ws?.home.redCards ?? parsed.narrativeFeatures.redCardsHome) +
      (ws?.away.redCards ?? parsed.narrativeFeatures.redCardsAway);

    return {
      homeTeamApiId: parsed.homeTeamApiId,
      awayTeamApiId: parsed.awayTeamApiId,
      totalXg: parsed.homeXg + parsed.awayXg,
      totalCorners: homeCorners + awayCorners,
      totalFouls: homeFouls + awayFouls,
      totalYellow,
      totalRed,
      totalShotsOnTarget:
        (ws?.home.shotsOnTarget ?? parsed.homeShotsOnTarget ?? 0) +
        (ws?.away.shotsOnTarget ?? parsed.awayShotsOnTarget ?? 0),
      totalCrosses: (ws?.home.crosses ?? 0) + (ws?.away.crosses ?? 0),
      totalFinalThirdEntries:
        (ws?.home.finalThirdEntries ?? 0) + (ws?.away.finalThirdEntries ?? 0),
      totalTackles: (ws?.home.tackles ?? 0) + (ws?.away.tackles ?? 0),
    };
  } catch {
    return null;
  }
}

function accumulateTeamRates(
  parsed: ReturnType<typeof parseOptaMatchFromFile>,
  teamAccum: Map<number, TeamAccum>
): void {
  const ws = parsed.widgetStats;
  if (!ws || !parsed.homeTeamApiId || !parsed.awayTeamApiId) return;

  const homeAcc = teamAccum.get(parsed.homeTeamApiId) ?? emptyTeamAccum();
  const awayAcc = teamAccum.get(parsed.awayTeamApiId) ?? emptyTeamAccum();
  accumulateTeamWidgetSample(homeAcc, ws.home);
  accumulateTeamWidgetSample(awayAcc, ws.away);
  teamAccum.set(parsed.homeTeamApiId, homeAcc);
  teamAccum.set(parsed.awayTeamApiId, awayAcc);
}

/** Load tournament event calibration from committed test fixtures (cached in-process). */
export function loadWcOptaEventCalibration(
  options?: { refresh?: boolean }
): WcTournamentEventCalibration {
  if (cachedCalibration && !options?.refresh) return cachedCalibration;

  const samples: WcOptaMatchEventSample[] = [];
  const teamAccum = new Map<number, TeamAccum>();
  const seen = new Set<string>();

  for (const filePath of collectOptaHtmlPaths()) {
    const sample = parseOptaEventSample(filePath);
    if (!sample) continue;

    const key = `${sample.homeTeamApiId}|${sample.awayTeamApiId}|${sample.totalXg.toFixed(2)}|${sample.totalCorners}`;
    if (seen.has(key)) continue;
    seen.add(key);

    samples.push(sample);
    try {
      const parsed = parseOptaMatchFromFile(filePath);
      accumulateTeamRates(parsed, teamAccum);
    } catch {
      // sample already validated — skip team accumulation
    }
  }

  cachedCalibration = buildCalibrationFromSamples(samples, teamAccum);
  return cachedCalibration;
}

export function clearWcOptaEventCalibrationCache(): void {
  cachedCalibration = null;
}

export function wcOptaResultsDirExists(): boolean {
  return fs.existsSync(WC_OPTA_HTML_FIXTURES_DIR);
}

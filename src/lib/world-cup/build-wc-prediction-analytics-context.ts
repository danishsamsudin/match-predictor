import type { TeamStatAverages } from "@/lib/types/prediction";
import type { TeamComparisonSnapshot, TeamFormMatch } from "@/lib/types/team-comparison";
import { buildNationalTeamStatAverages } from "@/lib/data/national-team-stats";
import {
  computeInternationalRatesFromMatches,
  INTERNATIONAL_BASE_GOALS,
} from "@/lib/world-cup/international-strength";
import {
  computeGrahamH2HRates,
  computeGrahamXgFormScore,
} from "@/lib/world-cup/graham-momentum";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  canonicalInternationalFormMatchKey,
  opponentInInternationalForm,
  teamGoalsInInternationalForm,
} from "@/lib/world-cup/international-form-team-side";
import { loadWcOptaEventCalibration } from "@/lib/world-cup/wc-opta-event-calibration";
import type { PredictionAnalytics } from "@/lib/types/prediction";

const EMPTY_SQUAD = {
  starters: [],
  substitutes: [],
  hasLineupData: false,
  hasScoutlystData: false,
  squadSource: "none" as const,
  preferredFormation: null,
  snapshotDate: null,
};

function snapshotNum(snapshot: Record<string, unknown>, key: string): number | null {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mapInternationalFormToRecentForm(
  matches: InternationalFormMatch[],
  teamId: string,
  teamName: string,
  max = 5
): TeamFormMatch[] {
  const rows: TeamFormMatch[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (rows.length >= max) break;
    const dedupeKey = canonicalInternationalFormMatchKey(m);
    if (seen.has(dedupeKey)) continue;
    const scored = teamGoalsInInternationalForm(m, teamId, teamName);
    if (!scored) continue;
    seen.add(dedupeKey);
    const opponent = opponentInInternationalForm(m, teamId, teamName);
    const { goalsFor, goalsAgainst } = scored;
    let result: TeamFormMatch["result"] = "N/A";
    if (goalsFor > goalsAgainst) result = "W";
    else if (goalsFor < goalsAgainst) result = "L";
    else result = "D";
    rows.push({
      date: m.date ?? "",
      opponent: opponent?.name ?? "Opponent",
      score: `${goalsFor}-${goalsAgainst}`,
      result,
    });
  }
  return rows;
}

function seasonStatsFromAverages(
  stats: TeamStatAverages,
  rates: { attack: number; defense: number },
  formScore: number,
  recentForm: TeamFormMatch[]
): TeamComparisonSnapshot["home"]["seasonStats"] {
  const goalsFor = (rates.attack * INTERNATIONAL_BASE_GOALS).toFixed(2);
  const goalsAgainst = (rates.defense * INTERNATIONAL_BASE_GOALS).toFixed(2);
  return {
    formScorePct: `${Math.round(formScore * 100)}%`,
    form: recentForm.map((m) => m.result).join(""),
    goalsForPerGame: goalsFor,
    goalsAgainstPerGame: goalsAgainst,
    cornersPerGame: stats.corners.toFixed(1),
    foulsPerGame: stats.fouls.toFixed(1),
    yellowCardsPerGame: stats.yellowCards.toFixed(2),
    redCardsPerGame: stats.redCards.toFixed(2),
    shotsOnTargetPerGame: stats.shotsOnTarget.toFixed(1),
    preferredFormation: null,
    venueName: null,
    venueCapacity: null,
  };
}

function buildWcComparisonSide(input: {
  teamApiId: number;
  teamDbId: string;
  teamName: string;
  formMatches: InternationalFormMatch[];
  formScore: number;
}): TeamComparisonSnapshot["home"] {
  const calibration = loadWcOptaEventCalibration();
  const rates = computeInternationalRatesFromMatches(
    input.teamDbId,
    input.formMatches,
    Date.now(),
    input.teamName
  );
  const baseStats = buildNationalTeamStatAverages(
    rates,
    input.teamApiId,
    input.teamName
  );
  const wcRates = calibration.teamRates.get(input.teamApiId);
  const stats: TeamStatAverages = wcRates?.games
    ? {
        ...baseStats,
        corners: baseStats.corners * 0.5 + wcRates.cornersPerGame * 0.5,
        fouls:
          wcRates.foulsPerGame > 0
            ? baseStats.fouls * 0.5 + wcRates.foulsPerGame * 0.5
            : baseStats.fouls,
        yellowCards: baseStats.yellowCards * 0.5 + wcRates.yellowPerGame * 0.5,
        redCards: baseStats.redCards * 0.5 + wcRates.redPerGame * 0.5,
        shotsOnTarget:
          baseStats.shotsOnTarget * 0.5 +
          (calibration.teamStyles.get(input.teamApiId)?.shotsOnTargetPerGame ??
            baseStats.shotsOnTarget) *
            0.5,
      }
    : baseStats;

  const recentForm = mapInternationalFormToRecentForm(
    input.formMatches,
    input.teamDbId,
    input.teamName
  );

  return {
    teamId: input.teamApiId,
    teamName: input.teamName,
    leagueName: "International",
    seasonStats: seasonStatsFromAverages(stats, rates, input.formScore, recentForm),
    recentForm,
    players: [],
    squad: { ...EMPTY_SQUAD },
    insights: null,
  };
}

export interface WcPredictionAnalyticsContext {
  homeFormScore: number;
  awayFormScore: number;
  h2hHomeWinRate: number;
  h2hDrawRate: number;
  h2hAwayWinRate: number;
  statComparison: PredictionAnalytics["statComparison"];
  teamComparison: TeamComparisonSnapshot;
}

export function buildWcPredictionAnalyticsContext(input: {
  snapshot: Record<string, unknown>;
  homeXg: number;
  awayXg: number;
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeDbTeamId: string;
  awayDbTeamId: string;
  homeName: string;
  awayName: string;
  homeFormMatches: InternationalFormMatch[];
  awayFormMatches: InternationalFormMatch[];
}): WcPredictionAnalyticsContext {
  const snap = input.snapshot;
  const homeFormScore = computeGrahamXgFormScore(
    input.homeFormMatches,
    input.homeDbTeamId,
    5,
    input.homeName
  );
  const awayFormScore = computeGrahamXgFormScore(
    input.awayFormMatches,
    input.awayDbTeamId,
    5,
    input.awayName
  );

  const combinedForm = [...input.homeFormMatches, ...input.awayFormMatches].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "")
  );
  const h2h = computeGrahamH2HRates(
    combinedForm,
    input.homeDbTeamId,
    input.awayDbTeamId,
    input.homeName,
    input.awayName
  );

  const statComparison: PredictionAnalytics["statComparison"] = [
    { metric: "Expected goals", home: input.homeXg, away: input.awayXg },
  ];

  const homeXgElo = snapshotNum(snap, "home_xg_elo");
  const awayXgElo = snapshotNum(snap, "away_xg_elo");
  if (homeXgElo != null && awayXgElo != null) {
    statComparison.push({ metric: "xG-Elo", home: homeXgElo, away: awayXgElo });
  }

  const homeWctr = snapshotNum(snap, "home_wctr");
  const awayWctr = snapshotNum(snap, "away_wctr");
  if (homeWctr != null && awayWctr != null) {
    statComparison.push({
      metric: "Tournament rating (WCTR)",
      home: homeWctr,
      away: awayWctr,
    });
  }

  const homeAttack = snapshotNum(snap, "home_attack");
  const awayAttack = snapshotNum(snap, "away_attack");
  if (homeAttack != null && awayAttack != null) {
    statComparison.push({
      metric: "Attack process rate",
      home: homeAttack,
      away: awayAttack,
    });
  }

  const homeDefense = snapshotNum(snap, "home_defense");
  const awayDefense = snapshotNum(snap, "away_defense");
  if (homeDefense != null && awayDefense != null) {
    statComparison.push({
      metric: "Defense process rate",
      home: homeDefense,
      away: awayDefense,
    });
  }

  const calibration = loadWcOptaEventCalibration();
  const homeStyle = calibration.teamStyles.get(input.homeTeamApiId);
  const awayStyle = calibration.teamStyles.get(input.awayTeamApiId);
  if (homeStyle && awayStyle) {
    statComparison.push({
      metric: "Corners per game (WC)",
      home: homeStyle.cornersPerGame ?? calibration.avgCornersPerMatch / 2,
      away: awayStyle.cornersPerGame ?? calibration.avgCornersPerMatch / 2,
    });
    statComparison.push({
      metric: "Fouls per game (WC)",
      home: homeStyle.foulsPerGame ?? calibration.avgFoulsPerMatch / 2,
      away: awayStyle.foulsPerGame ?? calibration.avgFoulsPerMatch / 2,
    });
  }

  const teamComparison: TeamComparisonSnapshot = {
    home: buildWcComparisonSide({
      teamApiId: input.homeTeamApiId,
      teamDbId: input.homeDbTeamId,
      teamName: input.homeName,
      formMatches: input.homeFormMatches,
      formScore: homeFormScore,
    }),
    away: buildWcComparisonSide({
      teamApiId: input.awayTeamApiId,
      teamDbId: input.awayDbTeamId,
      teamName: input.awayName,
      formMatches: input.awayFormMatches,
      formScore: awayFormScore,
    }),
    usesDatabaseStats: false,
    fixtureContext: null,
  };

  return {
    homeFormScore,
    awayFormScore,
    h2hHomeWinRate: h2h.homeWinRate,
    h2hDrawRate: h2h.drawRate,
    h2hAwayWinRate: h2h.awayWinRate,
    statComparison,
    teamComparison,
  };
}

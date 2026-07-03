import type { TeamStatAverages } from "@/lib/types/prediction";
import type { TeamComparisonSnapshot, TeamFormMatch, SquadPlayer } from "@/lib/types/team-comparison";
import { buildNationalTeamStatAverages } from "@/lib/data/national-team-stats";
import { getCanonicalTeamHomeVenue } from "@/lib/data/team-home-venues";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import { resolveWcModelStartingXi } from "@/lib/world-cup/resolve-wc-model-starting-xi";
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
import { loadNationalTeamRating } from "@/lib/world-cup/load-national-ratings";
import { loadWcOptaEventCalibration } from "@/lib/world-cup/wc-opta-event-calibration";
import type { PredictionAnalytics } from "@/lib/types/prediction";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  recentForm: TeamFormMatch[],
  venue: { name: string; capacity: number } | null,
  preferredFormation: string | null
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
    preferredFormation,
    venueName: venue?.name ?? null,
    venueCapacity: venue?.capacity != null ? String(venue.capacity) : null,
  };
}

async function buildWcComparisonSide(input: {
  teamApiId: number;
  teamDbId: string;
  teamName: string;
  formMatches: InternationalFormMatch[];
  formScore: number;
  supabase?: SupabaseClient | null;
}): Promise<TeamComparisonSnapshot["home"]> {
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

  const venue = getCanonicalTeamHomeVenue(input.teamApiId, input.teamName);
  const preferredFormation = input.supabase
    ? await loadPreferredFormationForTeam(input.supabase, input.teamApiId, input.teamName)
    : null;

  let squad: TeamComparisonSnapshot["home"]["squad"] = { ...EMPTY_SQUAD };
  let players: TeamComparisonSnapshot["home"]["players"] = [];

  if (input.supabase) {
    const modelXi = await resolveWcModelStartingXi({
      supabase: input.supabase,
      teamApiId: input.teamApiId,
      teamName: input.teamName,
    });
    if (modelXi.playerNames.length) {
      players = modelXi.playerNames.map((name, idx) => ({
        name,
        position: modelXi.playerDetails[idx]?.squadRole ?? null,
        goals: null,
        appearances: null,
        rating: null,
      }));
      const starters: SquadPlayer[] = players.slice(0, 11).map((p, idx) => ({
        sofascorePlayerId: idx,
        scoutlystPlayerKey: null,
        name: p.name,
        position: p.position ?? "MID",
        fieldPosition: modelXi.playerDetails[idx]?.squadRole ?? p.position,
        performanceScore: null,
        startSharePct: 100,
        detailStats: [],
        age: null,
      }));
      squad = {
        starters,
        substitutes: [],
        hasLineupData: true,
        hasScoutlystData: false,
        squadSource: "lineups",
        preferredFormation: preferredFormation,
        snapshotDate: new Date().toISOString().slice(0, 10),
      };
    }
  }

  return {
    teamId: input.teamApiId,
    teamName: input.teamName,
    leagueName: "International",
    seasonStats: seasonStatsFromAverages(
      stats,
      rates,
      input.formScore,
      recentForm,
      venue,
      squad.preferredFormation ?? preferredFormation
    ),
    recentForm,
    players,
    squad,
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

export async function buildWcPredictionAnalyticsContext(input: {
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
  supabase?: SupabaseClient | null;
}): Promise<WcPredictionAnalyticsContext> {
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

  const [homeXgEloDb, awayXgEloDb, homeWctrDb, awayWctrDb] = input.supabase
    ? await Promise.all([
        loadNationalTeamRating(input.homeTeamApiId, "xg_elo"),
        loadNationalTeamRating(input.awayTeamApiId, "xg_elo"),
        loadNationalTeamRating(input.homeTeamApiId, "tournament"),
        loadNationalTeamRating(input.awayTeamApiId, "tournament"),
      ])
    : [null, null, null, null];

  const homeXgElo = homeXgEloDb ?? snapshotNum(snap, "home_xg_elo");
  const awayXgElo = awayXgEloDb ?? snapshotNum(snap, "away_xg_elo");
  if (homeXgElo != null && awayXgElo != null) {
    statComparison.push({
      metric: "xG-Elo rating",
      home: Math.round(homeXgElo * 10) / 10,
      away: Math.round(awayXgElo * 10) / 10,
    });
  }

  const homeWctr = homeWctrDb ?? snapshotNum(snap, "home_wctr");
  const awayWctr = awayWctrDb ?? snapshotNum(snap, "away_wctr");
  if (homeWctr != null && awayWctr != null) {
    statComparison.push({
      metric: "Tournament rating (WCTR)",
      home: Math.round(homeWctr * 10) / 10,
      away: Math.round(awayWctr * 10) / 10,
    });
  }

  const homeAttack = snapshotNum(snap, "home_attack");
  const awayAttack = snapshotNum(snap, "away_attack");
  if (homeAttack != null && awayAttack != null) {
    statComparison.push({
      metric: "Attack process rate",
      home: Math.round(homeAttack * 1000) / 1000,
      away: Math.round(awayAttack * 1000) / 1000,
    });
  }

  const homeDefense = snapshotNum(snap, "home_defense");
  const awayDefense = snapshotNum(snap, "away_defense");
  if (homeDefense != null && awayDefense != null) {
    statComparison.push({
      metric: "Defense process rate",
      home: Math.round(homeDefense * 1000) / 1000,
      away: Math.round(awayDefense * 1000) / 1000,
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

  const [homeSide, awaySide] = await Promise.all([
    buildWcComparisonSide({
      teamApiId: input.homeTeamApiId,
      teamDbId: input.homeDbTeamId,
      teamName: input.homeName,
      formMatches: input.homeFormMatches,
      formScore: homeFormScore,
      supabase: input.supabase,
    }),
    buildWcComparisonSide({
      teamApiId: input.awayTeamApiId,
      teamDbId: input.awayDbTeamId,
      teamName: input.awayName,
      formMatches: input.awayFormMatches,
      formScore: awayFormScore,
      supabase: input.supabase,
    }),
  ]);

  const teamComparison: TeamComparisonSnapshot = {
    home: homeSide,
    away: awaySide,
    usesDatabaseStats: Boolean(input.supabase),
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

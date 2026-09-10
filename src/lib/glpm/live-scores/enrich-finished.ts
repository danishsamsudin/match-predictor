/**
 * Enrich finished live-score rows with locked (or reconstructed) markets,
 * matchup interactions, and predicted match-stat satellites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  computeInteractionMatrix,
  defaultXgEngineConfig,
  estimateExpectedGoals,
  predictMatch,
  type SideInteractions,
} from "@/lib/glpm/engine";
import {
  hubPredictionFromHistoryRow,
  type HubCardPrediction,
  type HubHistoryMarketRow,
} from "@/lib/glpm/hub-prediction-map";
import { resolveVectorSeasonId } from "@/lib/glpm/resolve-vector-season";
import {
  avgOrHeuristic,
  heuristicCorners,
  heuristicReds,
  heuristicYellows,
  mean,
  type TeamStatSample,
} from "@/lib/glpm-cx/satellites/event-markets";
import { resolveActualMatchTotals } from "./settle-markets";
import type {
  LiveScoreActualSideStats,
  LiveScoreMatch,
  LiveScorePredictedSideStats,
  LiveScorePredictionSource,
} from "./types";

type Client = SupabaseClient<Database>;

/** Soft cap so one scoreboard request cannot fan into unbounded DB work. */
const MAX_ENRICH_MATCHES = 48;

const HISTORY_MARKET_SELECT =
  "match_sm_id,home_win_pct,draw_pct,away_win_pct,home_xg,away_xg,btts_yes_pct,over_under,executed_at";

const TEAM_STATS_SELECT =
  "match_sm_id,team_sm_id,is_home,goals,xg,shots,shots_on_target,possession_pct,ppda,corners,yellow_cards,red_cards";

const VECTOR_SELECT =
  "team_sm_id,season_id,as_of_date,r_attack,r_defence,r_goalkeeper,r_build_up,r_possession,r_pressing,r_finishing";

const STYLE_SELECT = "team_sm_id,season_id,possession_avg,ppda_avg";

const RECENT_STAT_SELECT =
  "team_sm_id,match_sm_id,corners,yellow_cards,red_cards,fouls,shots,shots_on_target,possession_pct,pressures,pressing_duels,tackles,interceptions";

type HistoryMarketDbRow = HubHistoryMarketRow & {
  match_sm_id: number | null;
  executed_at?: string;
};

type TeamStatsDbRow = {
  match_sm_id: number;
  team_sm_id: number;
  is_home: boolean;
  goals: number | null;
  xg: number | null;
  shots: number | null;
  shots_on_target: number | null;
  possession_pct: number | null;
  ppda: number | null;
  corners: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
};

type VectorDbRow = {
  team_sm_id: number;
  season_id: number;
  as_of_date: string;
  r_attack: number | null;
  r_defence: number | null;
  r_goalkeeper: number | null;
  r_build_up: number | null;
  r_possession: number | null;
  r_pressing: number | null;
  r_finishing: number | null;
};

function isHistoryMarketRow(row: unknown): row is HistoryMarketDbRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    "home_win_pct" in r &&
    "draw_pct" in r &&
    "away_win_pct" in r &&
    "home_xg" in r &&
    "away_xg" in r
  );
}

function isTeamStatsRow(row: unknown): row is TeamStatsDbRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.match_sm_id === "number" && typeof r.is_home === "boolean";
}

function isVectorRow(row: unknown): row is VectorDbRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.team_sm_id === "number" && "r_attack" in r;
}

/** Locked early-season snapshots often collapse to near-equal 1X2 + xG. */
export function isCollapsedCardPrediction(p: HubCardPrediction): boolean {
  const xgDiff = Math.abs(p.homeXg - p.awayXg);
  const winDiff = Math.abs(p.homeWin - p.awayWin);
  return xgDiff < 0.08 && winDiff < 0.04;
}

function ratingInputFromVector(row: VectorDbRow) {
  return {
    attack: Number(row.r_attack ?? 60),
    defence: Number(row.r_defence ?? 60),
    goalkeeper: Number(row.r_goalkeeper ?? 60),
    build_up: Number(row.r_build_up ?? 60),
    possession: Number(row.r_possession ?? 60),
    pressing: Number(row.r_pressing ?? 60),
    finishing: Number(row.r_finishing ?? 60),
  };
}

function predictCardFromVectors(
  home: VectorDbRow,
  away: VectorDbRow
): {
  prediction: HubCardPrediction;
  interactions: { home: SideInteractions; away: SideInteractions };
} {
  const cfg = defaultXgEngineConfig();
  const homeIn = ratingInputFromVector(home);
  const awayIn = ratingInputFromVector(away);
  const xg = estimateExpectedGoals(homeIn, awayIn, { isNeutralVenue: false }, cfg);
  const pred = predictMatch(xg);
  const matrix = computeInteractionMatrix(homeIn, awayIn, cfg);
  return {
    prediction: {
      homeWin: pred.homeWin,
      draw: pred.draw,
      awayWin: pred.awayWin,
      homeXg: pred.homeXg,
      awayXg: pred.awayXg,
      over25: pred.overUnder["2.5"]?.over ?? 0,
      bttsYes: pred.bttsYes,
    },
    interactions: { home: matrix.home, away: matrix.away },
  };
}

function statsBlockFromDb(row: TeamStatsDbRow): LiveScoreActualSideStats {
  return {
    xg: row.xg != null ? Number(row.xg) : null,
    shots: row.shots,
    shotsOnTarget: row.shots_on_target,
    possession: row.possession_pct != null ? Number(row.possession_pct) : null,
    ppda: row.ppda != null ? Number(row.ppda) : null,
    corners: row.corners,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
  };
}

function mergeActualSideStats(
  db: LiveScoreActualSideStats | null | undefined,
  metrics: LiveScoreMatch["homeMetrics"],
  cards: { yellow: number | null; red: number | null; corners: number | null }
): LiveScoreActualSideStats {
  return {
    xg: db?.xg ?? metrics.xg,
    shots: db?.shots ?? metrics.shots,
    shotsOnTarget: db?.shotsOnTarget ?? metrics.shotsOnTarget,
    possession: db?.possession ?? metrics.possessionPct,
    ppda: db?.ppda ?? null,
    corners: cards.corners,
    yellowCards: cards.yellow,
    redCards: cards.red,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function meanFinite(vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  return mean(nums);
}

function asTeamSample(row: {
  corners: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  fouls?: number | null;
  shots: number | null;
  shots_on_target?: number | null;
  possession_pct: number | null;
  pressures?: number | null;
  pressing_duels?: number | null;
  tackles?: number | null;
  interceptions?: number | null;
}): TeamStatSample & { shotsOnTarget: number | null } {
  return {
    corners: row.corners,
    yellow_cards: row.yellow_cards,
    red_cards: row.red_cards,
    fouls: row.fouls ?? null,
    shots: row.shots,
    possession_pct: row.possession_pct,
    pressures: row.pressures ?? null,
    pressing_duels: row.pressing_duels ?? null,
    tackles: row.tackles ?? null,
    interceptions: row.interceptions ?? null,
    shotsOnTarget: row.shots_on_target ?? null,
  };
}

/**
 * Attach locked/reconstructed predictions, actual stats, predicted satellites,
 * and matchup interactions to finished scoreboard rows.
 *
 * Satellite corners/cards are derived from the already-batched recent team
 * stats below. Avoid per-matchup `estimateEventMarkets` awaits: sequential
 * worker chains blow Next.js dev `visitAsyncNode` (Maximum call stack size).
 */
export async function enrichFinishedMatches(
  client: Client,
  matches: LiveScoreMatch[]
): Promise<LiveScoreMatch[]> {
  if (matches.length === 0) return matches;

  const enrichTargets =
    matches.length > MAX_ENRICH_MATCHES ? matches.slice(0, MAX_ENRICH_MATCHES) : matches;
  const skippedTail =
    matches.length > MAX_ENRICH_MATCHES ? matches.slice(MAX_ENRICH_MATCHES) : [];

  const matchIds = [...new Set(enrichTargets.map((m) => m.matchSmId))].filter((id) => id > 0);
  const teamIds = [
    ...new Set(enrichTargets.flatMap((m) => [m.homeTeamSmId, m.awayTeamSmId])),
  ].filter((id) => Number.isFinite(id) && id > 0);
  if (matchIds.length === 0) return matches;

  const seasonIds = [
    ...new Set(
      enrichTargets.map((m) => m.seasonId).filter((id): id is number => id != null && id > 0)
    ),
  ];

  const [cxRes, baseRes, statsRes, styleRes, recentStatRes] = await Promise.all([
    client
      .from("glpm_cx_prediction_history")
      .select(HISTORY_MARKET_SELECT)
      .in("match_sm_id", matchIds)
      .order("executed_at", { ascending: false })
      .limit(Math.max(matchIds.length * 4, 40)),
    client
      .from("glpm_prediction_history")
      .select(HISTORY_MARKET_SELECT)
      .in("match_sm_id", matchIds)
      .order("executed_at", { ascending: false })
      .limit(Math.max(matchIds.length * 4, 40)),
    client
      .from("glpm_match_team_stats")
      .select(TEAM_STATS_SELECT)
      .in("match_sm_id", matchIds)
      .limit(Math.max(matchIds.length * 2, 40)),
    teamIds.length > 0
      ? client
          .from("glpm_team_style_snapshots")
          .select(STYLE_SELECT)
          .in("team_sm_id", teamIds)
          .order("as_of_date", { ascending: false })
          .limit(Math.max(teamIds.length * 4, 40))
      : Promise.resolve({ data: [] as never[], error: null }),
    teamIds.length > 0
      ? client
          .from("glpm_match_team_stats")
          .select(RECENT_STAT_SELECT)
          .in("team_sm_id", teamIds)
          .order("match_sm_id", { ascending: false })
          .limit(Math.max(teamIds.length * 12, 80))
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);

  if (cxRes.error) {
    console.warn(`[live-scores] cx history load failed: ${cxRes.error.message}`);
  }
  if (baseRes.error) {
    console.warn(`[live-scores] prediction history load failed: ${baseRes.error.message}`);
  }
  if (statsRes.error) {
    console.warn(`[live-scores] match stats load failed: ${statsRes.error.message}`);
  }

  const cxByMatch = new Map<number, HubCardPrediction>();
  for (const raw of cxRes.data ?? []) {
    if (!isHistoryMarketRow(raw)) continue;
    const id = Number(raw.match_sm_id);
    if (!Number.isFinite(id) || cxByMatch.has(id)) continue;
    cxByMatch.set(id, hubPredictionFromHistoryRow(raw));
  }

  const baseByMatch = new Map<number, HubCardPrediction>();
  for (const raw of baseRes.data ?? []) {
    if (!isHistoryMarketRow(raw)) continue;
    const id = Number(raw.match_sm_id);
    if (!Number.isFinite(id) || baseByMatch.has(id)) continue;
    baseByMatch.set(id, hubPredictionFromHistoryRow(raw));
  }

  const statsByMatch = new Map<
    number,
    { home: LiveScoreActualSideStats | null; away: LiveScoreActualSideStats | null }
  >();
  for (const raw of statsRes.data ?? []) {
    if (!isTeamStatsRow(raw)) continue;
    const cur = statsByMatch.get(raw.match_sm_id) ?? { home: null, away: null };
    const block = statsBlockFromDb(raw);
    if (raw.is_home) cur.home = block;
    else cur.away = block;
    statsByMatch.set(raw.match_sm_id, cur);
  }

  const stylePossByTeam = new Map<number, number>();
  for (const raw of styleRes.data ?? []) {
    const teamId = Number((raw as { team_sm_id?: number }).team_sm_id);
    const poss = (raw as { possession_avg?: number | null }).possession_avg;
    if (!Number.isFinite(teamId) || stylePossByTeam.has(teamId)) continue;
    if (poss != null && Number.isFinite(Number(poss))) {
      stylePossByTeam.set(teamId, Number(poss));
    }
  }

  const recentByTeam = new Map<number, Array<TeamStatSample & { shotsOnTarget: number | null }>>();
  for (const raw of recentStatRes.data ?? []) {
    const teamId = Number((raw as { team_sm_id?: number }).team_sm_id);
    if (!Number.isFinite(teamId)) continue;
    const list = recentByTeam.get(teamId) ?? [];
    if (list.length >= 12) continue;
    list.push(asTeamSample(raw as never));
    recentByTeam.set(teamId, list);
  }

  // Resolve vector seasons per fixture season, then load vectors.
  const vectorSeasonByFixtureSeason = new Map<number, number>();
  await Promise.all(
    seasonIds.map(async (seasonId) => {
      const competitionId =
        enrichTargets.find((m) => m.seasonId === seasonId)?.leagueSmId ?? null;
      try {
        const resolved = await resolveVectorSeasonId(client, seasonId, competitionId);
        vectorSeasonByFixtureSeason.set(seasonId, resolved.seasonId);
      } catch (err) {
        console.warn(`[live-scores] vector season resolve failed for ${seasonId}`, err);
        vectorSeasonByFixtureSeason.set(seasonId, seasonId);
      }
    })
  );

  const vectorSeasonIds = [...new Set(vectorSeasonByFixtureSeason.values())];
  const vectorByTeamSeason = new Map<string, VectorDbRow>();
  if (teamIds.length > 0 && vectorSeasonIds.length > 0) {
    const { data: vectorRows, error: vectorErr } = await client
      .from("glpm_team_rating_vectors")
      .select(VECTOR_SELECT)
      .in("team_sm_id", teamIds)
      .in("season_id", vectorSeasonIds)
      .order("as_of_date", { ascending: false })
      .limit(Math.max(teamIds.length * vectorSeasonIds.length * 4, 80));
    if (vectorErr) {
      console.warn(`[live-scores] rating vectors load failed: ${vectorErr.message}`);
    }
    for (const raw of vectorRows ?? []) {
      if (!isVectorRow(raw)) continue;
      const key = `${raw.team_sm_id}:${raw.season_id}`;
      if (!vectorByTeamSeason.has(key)) vectorByTeamSeason.set(key, raw);
    }
  }

  // Also keep any-season latest as fallback when season-scoped missing.
  const anyVectorByTeam = new Map<number, VectorDbRow>();
  if (teamIds.length > 0) {
    const { data: anyRows } = await client
      .from("glpm_team_rating_vectors")
      .select(VECTOR_SELECT)
      .in("team_sm_id", teamIds)
      .order("as_of_date", { ascending: false })
      .limit(Math.max(teamIds.length * 4, 40));
    for (const raw of anyRows ?? []) {
      if (!isVectorRow(raw)) continue;
      if (!anyVectorByTeam.has(raw.team_sm_id)) anyVectorByTeam.set(raw.team_sm_id, raw);
    }
  }

  const enriched = enrichTargets.map((match) => {
    const cx = cxByMatch.get(match.matchSmId);
    const base = baseByMatch.get(match.matchSmId);

    let prediction: HubCardPrediction | null = null;
    let predictionSource: LiveScorePredictionSource | null = null;
    if (cx && !isCollapsedCardPrediction(cx)) {
      prediction = cx;
      predictionSource = "cx";
    } else if (base && !isCollapsedCardPrediction(base)) {
      prediction = base;
      predictionSource = "stored";
    } else if (cx) {
      // Keep collapsed CX only until we try vector reconstruct below.
      prediction = cx;
      predictionSource = "cx";
    } else if (base) {
      prediction = base;
      predictionSource = "stored";
    }

    const vectorSeasonId =
      match.seasonId != null
        ? (vectorSeasonByFixtureSeason.get(match.seasonId) ?? match.seasonId)
        : null;
    const homeVec =
      (vectorSeasonId != null
        ? vectorByTeamSeason.get(`${match.homeTeamSmId}:${vectorSeasonId}`)
        : null) ?? anyVectorByTeam.get(match.homeTeamSmId);
    const awayVec =
      (vectorSeasonId != null
        ? vectorByTeamSeason.get(`${match.awayTeamSmId}:${vectorSeasonId}`)
        : null) ?? anyVectorByTeam.get(match.awayTeamSmId);

    let interactions: { home: SideInteractions; away: SideInteractions } | null = null;
    if (homeVec && awayVec) {
      const rebuilt = predictCardFromVectors(homeVec, awayVec);
      interactions = rebuilt.interactions;
      const lockedIsCollapsed =
        prediction == null || isCollapsedCardPrediction(prediction);
      if (lockedIsCollapsed) {
        prediction = rebuilt.prediction;
        predictionSource = "live";
      }
    }

    const dbStats = statsByMatch.get(match.matchSmId);
    const totals = resolveActualMatchTotals({
      homeStats: dbStats?.home
        ? {
            corners: dbStats.home.corners,
            yellowCards: dbStats.home.yellowCards,
            redCards: dbStats.home.redCards,
          }
        : null,
      awayStats: dbStats?.away
        ? {
            corners: dbStats.away.corners,
            yellowCards: dbStats.away.yellowCards,
            redCards: dbStats.away.redCards,
          }
        : null,
      homeMetrics: match.homeMetrics,
      awayMetrics: match.awayMetrics,
      timeline: match.timeline,
    });

    const actualHomeStats = mergeActualSideStats(dbStats?.home, match.homeMetrics, {
      corners: totals.homeCorners,
      yellow: totals.homeYellow,
      red: totals.homeRed,
    });
    const actualAwayStats = mergeActualSideStats(dbStats?.away, match.awayMetrics, {
      corners: totals.awayCorners,
      yellow: totals.awayYellow,
      red: totals.awayRed,
    });

    const homeRecent = recentByTeam.get(match.homeTeamSmId) ?? [];
    const awayRecent = recentByTeam.get(match.awayTeamSmId) ?? [];

    const homeShots =
      meanFinite(homeRecent.map((r) => r.shots)) ??
      (homeRecent.length
        ? avgOrHeuristic(homeRecent, "corners", heuristicCorners) * 2.2
        : null);
    const awayShots =
      meanFinite(awayRecent.map((r) => r.shots)) ??
      (awayRecent.length
        ? avgOrHeuristic(awayRecent, "corners", heuristicCorners) * 2.2
        : null);
    const homeSot =
      meanFinite(homeRecent.map((r) => r.shotsOnTarget)) ??
      (homeShots != null ? homeShots * 0.35 : null);
    const awaySot =
      meanFinite(awayRecent.map((r) => r.shotsOnTarget)) ??
      (awayShots != null ? awayShots * 0.35 : null);

    const homeCorners = homeRecent.length
      ? avgOrHeuristic(homeRecent, "corners", heuristicCorners) * 1.04
      : null;
    const awayCorners = awayRecent.length
      ? avgOrHeuristic(awayRecent, "corners", heuristicCorners) / 1.04
      : null;
    const homeYellow = homeRecent.length
      ? avgOrHeuristic(homeRecent, "yellow_cards", heuristicYellows)
      : null;
    const awayYellow = awayRecent.length
      ? avgOrHeuristic(awayRecent, "yellow_cards", heuristicYellows)
      : null;
    const homeRed = homeYellow != null ? heuristicReds(homeYellow) : null;
    const awayRed = awayYellow != null ? heuristicReds(awayYellow) : null;

    const predictedHomeStats: LiveScorePredictedSideStats = {
      corners: homeCorners != null ? round1(homeCorners) : null,
      yellowCards: homeYellow != null ? round1(homeYellow) : null,
      redCards: homeRed != null ? round1(homeRed) : null,
      shots: homeShots != null ? round1(homeShots) : null,
      shotsOnTarget: homeSot != null ? round1(homeSot) : null,
      possession: stylePossByTeam.get(match.homeTeamSmId) ?? meanFinite(homeRecent.map((r) => r.possession_pct)),
    };
    const predictedAwayStats: LiveScorePredictedSideStats = {
      corners: awayCorners != null ? round1(awayCorners) : null,
      yellowCards: awayYellow != null ? round1(awayYellow) : null,
      redCards: awayRed != null ? round1(awayRed) : null,
      shots: awayShots != null ? round1(awayShots) : null,
      shotsOnTarget: awaySot != null ? round1(awaySot) : null,
      possession: stylePossByTeam.get(match.awayTeamSmId) ?? meanFinite(awayRecent.map((r) => r.possession_pct)),
    };

    return {
      ...match,
      prediction,
      predictionSource,
      actualHomeStats,
      actualAwayStats,
      predictedHomeStats,
      predictedAwayStats,
      interactions,
    };
  });

  return skippedTail.length ? [...enriched, ...skippedTail] : enriched;
}

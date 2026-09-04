/**
 * Satellite corners / cards estimates for GLPM-CX.
 * Uses ingested team-match counts when present; otherwise shot / pressing heuristics.
 * Historical rows come from the prior season until the current season has 20
 * finished matches (same n as Bayesian rating confidence). Current-season ML
 * (empirical-Bayes shrinkage) starts only after that floor, and only when
 * corners / cards cells are actually filled.
 * Does not feed GLPM ratings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { GLPM_BAYESIAN_MATCH_CONFIDENCE_N } from "@/lib/glpm/resolve-train-season";

type Client = SupabaseClient<Database>;

const RECENT_LIMIT = 12;
const HOME_CORNER_TILT = 1.04;

export type CxEventMarketsEstimate = {
  homeCorners: number;
  awayCorners: number;
  totalCorners: number;
  homeYellows: number;
  awayYellows: number;
  totalYellows: number;
  homeReds: number;
  awayReds: number;
  source: "satellite_v1" | "satellite_ml_v1";
  statsSeasonId: number | null;
  mlActive: boolean;
};

export type TeamStatSample = {
  corners: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  fouls: number | null;
  shots: number | null;
  possession_pct: number | null;
  pressures: number | null;
  pressing_duels: number | null;
  tackles: number | null;
  interceptions: number | null;
};

const EMPTY_SAMPLE: TeamStatSample = {
  corners: null,
  yellow_cards: null,
  red_cards: null,
  fouls: null,
  shots: null,
  possession_pct: null,
  pressures: null,
  pressing_duels: null,
  tackles: null,
  interceptions: null,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Empirical-Bayes shrink of a team rate toward the league mean. */
export function shrinkRate(
  teamMean: number,
  leagueMean: number,
  n: number,
  k: number = GLPM_BAYESIAN_MATCH_CONFIDENCE_N
): number {
  const nn = Math.max(0, n);
  const kk = Math.max(0, k);
  if (nn + kk <= 0) return leagueMean;
  return (nn / (nn + kk)) * teamMean + (kk / (nn + kk)) * leagueMean;
}

export function eventMlEligible(opts: {
  statsSeasonIsCurrent: boolean;
  labeledMatchCount: number;
  minLabeled?: number;
}): boolean {
  const min = opts.minLabeled ?? GLPM_BAYESIAN_MATCH_CONFIDENCE_N;
  return opts.statsSeasonIsCurrent && opts.labeledMatchCount >= min;
}

/** Heuristic corners when corners column is null / sparse. */
export function heuristicCorners(row: TeamStatSample): number {
  const shots = row.shots ?? 10;
  const possession = row.possession_pct ?? 50;
  const base = 4.5 + (shots - 10) * 0.15;
  const possessionTilt = ((possession - 50) / 50) * 0.6;
  return clamp(base + possessionTilt, 2.0, 9.5);
}

/**
 * Heuristic yellows from fouls or pressing-ish proxies.
 * yellows ≈ 2.0 + clamp(intensity, -0.7, 1.0)
 */
export function heuristicYellows(row: TeamStatSample): number {
  if (row.fouls != null && Number.isFinite(row.fouls)) {
    return clamp(2.0 + clamp((row.fouls - 11) * 0.08, -0.7, 1.0), 0.6, 4.5);
  }
  const pressures =
    row.pressures ??
    row.pressing_duels ??
    (row.tackles != null || row.interceptions != null
      ? (row.tackles ?? 0) + (row.interceptions ?? 0)
      : null);
  const intensity =
    pressures != null
      ? clamp(pressures / 40 - 0.5, -0.7, 1.0)
      : clamp(((row.shots ?? 10) - 10) * -0.04, -0.4, 0.4);
  return clamp(2.0 + intensity, 0.6, 4.5);
}

export function heuristicReds(yellows: number): number {
  return clamp(0.08 + Math.max(0, yellows - 2.2) * 0.04, 0.02, 0.35);
}

export function avgOrHeuristic(
  rows: TeamStatSample[],
  key: "corners" | "yellow_cards" | "red_cards",
  heuristic: (row: TeamStatSample) => number
): number {
  const observed = rows
    .map((r) => r[key])
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (observed.length >= Math.max(3, Math.ceil(rows.length * 0.4))) {
    return mean(observed) ?? heuristic(rows[0] ?? EMPTY_SAMPLE);
  }
  if (!rows.length) {
    return heuristic(EMPTY_SAMPLE);
  }
  return mean(rows.map(heuristic)) ?? heuristic(rows[0]);
}

function labeledCount(
  rows: TeamStatSample[],
  key: "corners" | "yellow_cards" | "red_cards"
): number {
  return rows.filter((r) => r[key] != null && Number.isFinite(r[key])).length;
}

function rateForKey(
  rows: TeamStatSample[],
  key: "corners" | "yellow_cards" | "red_cards",
  heuristic: (row: TeamStatSample) => number,
  leagueMean: number | null,
  mlActive: boolean
): number {
  const raw = avgOrHeuristic(rows, key, heuristic);
  if (!mlActive || leagueMean == null) return raw;
  return shrinkRate(raw, leagueMean, labeledCount(rows, key));
}

async function loadRecentTeamStats(
  client: Client,
  teamSmId: number,
  seasonId: number | null | undefined
): Promise<TeamStatSample[]> {
  let matchQuery = client
    .from("glpm_matches")
    .select("sm_id,kickoff_at,match_date")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .or(`home_team_sm_id.eq.${teamSmId},away_team_sm_id.eq.${teamSmId}`)
    .order("kickoff_at", { ascending: false })
    .limit(RECENT_LIMIT);

  if (seasonId != null) {
    matchQuery = matchQuery.eq("season_id", seasonId);
  }

  const { data: matches, error: matchErr } = await matchQuery;
  if (matchErr || !matches?.length) return [];

  const matchIds = matches.map((m) => m.sm_id);
  const { data: rows, error: statsErr } = await client
    .from("glpm_match_team_stats")
    .select(
      "corners,yellow_cards,red_cards,fouls,shots,possession_pct,pressures,pressing_duels,tackles,interceptions"
    )
    .eq("team_sm_id", teamSmId)
    .in("match_sm_id", matchIds);

  if (statsErr) return [];
  return (rows ?? []) as TeamStatSample[];
}

async function loadSeasonLabeledMeans(
  client: Client,
  seasonId: number
): Promise<{ corners: number | null; yellows: number | null; reds: number | null; n: number }> {
  const { data: matches } = await client
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(500);

  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) {
    return { corners: null, yellows: null, reds: null, n: 0 };
  }

  const { data: rows } = await client
    .from("glpm_match_team_stats")
    .select("match_sm_id,corners,yellow_cards,red_cards")
    .in("match_sm_id", matchIds.slice(0, 500));

  const corners: number[] = [];
  const yellows: number[] = [];
  const reds: number[] = [];
  const labeledMatches = new Set<number>();
  for (const row of rows ?? []) {
    if (row.corners != null && Number.isFinite(row.corners)) {
      corners.push(Number(row.corners));
      labeledMatches.add(row.match_sm_id);
    }
    if (row.yellow_cards != null && Number.isFinite(row.yellow_cards)) {
      yellows.push(Number(row.yellow_cards));
      labeledMatches.add(row.match_sm_id);
    }
    if (row.red_cards != null && Number.isFinite(row.red_cards)) {
      reds.push(Number(row.red_cards));
      labeledMatches.add(row.match_sm_id);
    }
  }

  return {
    corners: mean(corners),
    yellows: mean(yellows),
    reds: mean(reds),
    n: labeledMatches.size,
  };
}

export async function estimateEventMarkets(
  client: Client,
  opts: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId?: number | null;
    statsSeasonIsCurrent?: boolean;
  }
): Promise<CxEventMarketsEstimate> {
  const seasonId = opts.seasonId ?? null;
  const [homeRows, awayRows, league] = await Promise.all([
    loadRecentTeamStats(client, opts.homeTeamSmId, seasonId),
    loadRecentTeamStats(client, opts.awayTeamSmId, seasonId),
    seasonId != null
      ? loadSeasonLabeledMeans(client, seasonId)
      : Promise.resolve({ corners: null, yellows: null, reds: null, n: 0 }),
  ]);

  const mlActive = eventMlEligible({
    statsSeasonIsCurrent: Boolean(opts.statsSeasonIsCurrent),
    labeledMatchCount: league.n,
  });

  const homeCorners = rateForKey(
    homeRows,
    "corners",
    heuristicCorners,
    league.corners,
    mlActive
  );
  const awayCorners = rateForKey(
    awayRows,
    "corners",
    heuristicCorners,
    league.corners,
    mlActive
  );
  const homeYellows = rateForKey(
    homeRows,
    "yellow_cards",
    heuristicYellows,
    league.yellows,
    mlActive
  );
  const awayYellows = rateForKey(
    awayRows,
    "yellow_cards",
    heuristicYellows,
    league.yellows,
    mlActive
  );
  const homeReds = rateForKey(
    homeRows,
    "red_cards",
    (r) => heuristicReds(heuristicYellows(r)),
    league.reds,
    mlActive
  );
  const awayReds = rateForKey(
    awayRows,
    "red_cards",
    (r) => heuristicReds(heuristicYellows(r)),
    league.reds,
    mlActive
  );

  const homeCornersAdj = homeCorners * HOME_CORNER_TILT;
  const awayCornersAdj = awayCorners / HOME_CORNER_TILT;

  return {
    homeCorners: round2(homeCornersAdj),
    awayCorners: round2(awayCornersAdj),
    totalCorners: round2(homeCornersAdj + awayCornersAdj),
    homeYellows: round2(homeYellows),
    awayYellows: round2(awayYellows),
    totalYellows: round2(homeYellows + awayYellows),
    homeReds: round2(homeReds),
    awayReds: round2(awayReds),
    source: mlActive ? "satellite_ml_v1" : "satellite_v1",
    statsSeasonId: seasonId,
    mlActive,
  };
}

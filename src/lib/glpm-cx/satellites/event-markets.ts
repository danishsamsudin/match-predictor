/**
 * Satellite corners / cards estimates for GLPM-CX.
 * Uses ingested team-match counts when present; otherwise shot / pressing heuristics.
 * Does not feed GLPM ratings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type Client = SupabaseClient<Database>;

const RECENT_LIMIT = 12;

export type CxEventMarketsEstimate = {
  homeCorners: number;
  awayCorners: number;
  totalCorners: number;
  homeYellows: number;
  awayYellows: number;
  totalYellows: number;
  homeReds: number;
  awayReds: number;
  source: "satellite_v1";
};

type TeamStatSample = {
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Heuristic corners when corners column is null / sparse. */
function heuristicCorners(row: TeamStatSample): number {
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
function heuristicYellows(row: TeamStatSample): number {
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

function heuristicReds(yellows: number): number {
  return clamp(0.08 + Math.max(0, yellows - 2.2) * 0.04, 0.02, 0.35);
}

function avgOrHeuristic(
  rows: TeamStatSample[],
  key: "corners" | "yellow_cards" | "red_cards",
  heuristic: (row: TeamStatSample) => number
): number {
  const observed = rows
    .map((r) => r[key])
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (observed.length >= Math.max(3, Math.ceil(rows.length * 0.4))) {
    return mean(observed) ?? heuristic(rows[0] ?? { corners: null, yellow_cards: null, red_cards: null, fouls: null, shots: null, possession_pct: null, pressures: null, pressing_duels: null, tackles: null, interceptions: null });
  }
  if (!rows.length) {
    const empty: TeamStatSample = {
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
    return heuristic(empty);
  }
  return mean(rows.map(heuristic)) ?? heuristic(rows[0]);
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

  const { data: matches } = await matchQuery;
  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) return [];

  const { data: rows } = await client
    .from("glpm_match_team_stats")
    .select(
      "corners,yellow_cards,red_cards,fouls,shots,possession_pct,pressures,pressing_duels,tackles,interceptions"
    )
    .eq("team_sm_id", teamSmId)
    .in("match_sm_id", matchIds);

  return (rows ?? []) as TeamStatSample[];
}

export async function estimateEventMarkets(
  client: Client,
  opts: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId?: number | null;
  }
): Promise<CxEventMarketsEstimate> {
  const [homeRows, awayRows] = await Promise.all([
    loadRecentTeamStats(client, opts.homeTeamSmId, opts.seasonId),
    loadRecentTeamStats(client, opts.awayTeamSmId, opts.seasonId),
  ]);

  const homeCorners = avgOrHeuristic(homeRows, "corners", heuristicCorners);
  const awayCorners = avgOrHeuristic(awayRows, "corners", heuristicCorners);
  const homeYellows = avgOrHeuristic(homeRows, "yellow_cards", heuristicYellows);
  const awayYellows = avgOrHeuristic(awayRows, "yellow_cards", heuristicYellows);
  const homeReds = avgOrHeuristic(homeRows, "red_cards", (r) =>
    heuristicReds(heuristicYellows(r))
  );
  const awayReds = avgOrHeuristic(awayRows, "red_cards", (r) =>
    heuristicReds(heuristicYellows(r))
  );

  return {
    homeCorners: round2(homeCorners),
    awayCorners: round2(awayCorners),
    totalCorners: round2(homeCorners + awayCorners),
    homeYellows: round2(homeYellows),
    awayYellows: round2(awayYellows),
    totalYellows: round2(homeYellows + awayYellows),
    homeReds: round2(homeReds),
    awayReds: round2(awayReds),
    source: "satellite_v1",
  };
}

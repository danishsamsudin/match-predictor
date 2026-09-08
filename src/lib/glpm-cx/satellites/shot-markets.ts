/**
 * Satellite match total shots / shots-on-target estimates for GLPM-CX.
 * Uses recent glpm_match_team_stats on the same statsSeasonId as corners/cards.
 * Does not feed GLPM ratings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { poissonOverProb } from "@/lib/glpm-cx/satellites/player-props";
import {
  eventMlEligible,
  mean,
  shrinkRate,
} from "@/lib/glpm-cx/satellites/event-markets";
import { GLPM_BAYESIAN_MATCH_CONFIDENCE_N } from "@/lib/glpm/resolve-train-season";

type Client = SupabaseClient<Database>;

const RECENT_LIMIT = 12;
const HOME_SHOT_TILT = 1.04;
/** Typical SoT share when shots_on_target is sparse. */
const SOT_SHARE = 0.35;
const DEFAULT_SHOTS = 11;

export const TOTAL_SHOT_LINES = [20.5, 22.5, 24.5, 26.5] as const;
export const TOTAL_SOT_LINES = [8.5, 9.5, 10.5, 11.5] as const;

export type CxShotOuLine = {
  line: number;
  over: number;
  under: number;
};

export type CxShotOverLine = {
  line: number;
  over: number;
};

export type CxShotMarketsEstimate = {
  homeShots: number;
  awayShots: number;
  totalShots: number;
  homeSot: number;
  awaySot: number;
  totalSot: number;
  shotsOverUnder: CxShotOuLine[];
  /** Toto offers SoT Over only (no Under). */
  sotOver: CxShotOverLine[];
  source: "satellite_v1" | "satellite_ml_v1";
  statsSeasonId: number | null;
  mlActive: boolean;
};

type ShotSample = {
  shots: number | null;
  shots_on_target: number | null;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function ouLines(lambda: number, lines: readonly number[]): CxShotOuLine[] {
  return lines.map((line) => {
    const over = round3(poissonOverProb(lambda, line));
    return { line, over, under: round3(1 - over) };
  });
}

function overOnlyLines(lambda: number, lines: readonly number[]): CxShotOverLine[] {
  return lines.map((line) => ({
    line,
    over: round3(poissonOverProb(lambda, line)),
  }));
}

function observedMean(
  rows: ShotSample[],
  key: "shots" | "shots_on_target"
): number | null {
  const vals = rows
    .map((r) => r[key])
    .filter((v): v is number => v != null && Number.isFinite(v));
  return mean(vals);
}

function labeledCount(
  rows: ShotSample[],
  key: "shots" | "shots_on_target"
): number {
  return rows.filter((r) => r[key] != null && Number.isFinite(r[key])).length;
}

function rateShots(rows: ShotSample[], leagueMean: number | null, mlActive: boolean): number {
  const raw = observedMean(rows, "shots") ?? DEFAULT_SHOTS;
  if (!mlActive || leagueMean == null) return raw;
  return shrinkRate(raw, leagueMean, labeledCount(rows, "shots"));
}

function rateSot(
  rows: ShotSample[],
  shotsRate: number,
  leagueMean: number | null,
  mlActive: boolean
): number {
  const observed = observedMean(rows, "shots_on_target");
  const raw =
    observed != null
      ? observed
      : clamp(shotsRate * SOT_SHARE, 1.5, 9);
  if (!mlActive || leagueMean == null) return raw;
  return shrinkRate(raw, leagueMean, labeledCount(rows, "shots_on_target"));
}

async function loadRecentShotStats(
  client: Client,
  teamSmId: number,
  seasonId: number | null | undefined
): Promise<ShotSample[]> {
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
    .select("shots,shots_on_target")
    .eq("team_sm_id", teamSmId)
    .in("match_sm_id", matchIds);

  if (statsErr) return [];
  return (rows ?? []) as ShotSample[];
}

async function loadSeasonShotMeans(
  client: Client,
  seasonId: number
): Promise<{ shots: number | null; sot: number | null; n: number }> {
  const { data: matches } = await client
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(500);

  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) {
    return { shots: null, sot: null, n: 0 };
  }

  const { data: rows } = await client
    .from("glpm_match_team_stats")
    .select("match_sm_id,shots,shots_on_target")
    .in("match_sm_id", matchIds.slice(0, 500));

  const shots: number[] = [];
  const sot: number[] = [];
  const labeledMatches = new Set<number>();
  for (const row of rows ?? []) {
    if (row.shots != null && Number.isFinite(row.shots)) {
      shots.push(Number(row.shots));
      labeledMatches.add(row.match_sm_id);
    }
    if (row.shots_on_target != null && Number.isFinite(row.shots_on_target)) {
      sot.push(Number(row.shots_on_target));
      labeledMatches.add(row.match_sm_id);
    }
  }

  return {
    shots: mean(shots),
    sot: mean(sot),
    n: labeledMatches.size,
  };
}

export const EMPTY_SHOT_MARKETS: CxShotMarketsEstimate = {
  homeShots: 0,
  awayShots: 0,
  totalShots: 0,
  homeSot: 0,
  awaySot: 0,
  totalSot: 0,
  shotsOverUnder: ouLines(0, TOTAL_SHOT_LINES),
  sotOver: overOnlyLines(0, TOTAL_SOT_LINES),
  source: "satellite_v1",
  statsSeasonId: null,
  mlActive: false,
};

export async function estimateShotMarkets(
  client: Client,
  opts: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId?: number | null;
    statsSeasonIsCurrent?: boolean;
  }
): Promise<CxShotMarketsEstimate> {
  const seasonId = opts.seasonId ?? null;
  const [homeRows, awayRows, league] = await Promise.all([
    loadRecentShotStats(client, opts.homeTeamSmId, seasonId),
    loadRecentShotStats(client, opts.awayTeamSmId, seasonId),
    seasonId != null
      ? loadSeasonShotMeans(client, seasonId)
      : Promise.resolve({ shots: null, sot: null, n: 0 }),
  ]);

  const mlActive = eventMlEligible({
    statsSeasonIsCurrent: Boolean(opts.statsSeasonIsCurrent),
    labeledMatchCount: league.n,
    minLabeled: GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
  });

  const homeShotsRaw = rateShots(homeRows, league.shots, mlActive);
  const awayShotsRaw = rateShots(awayRows, league.shots, mlActive);
  const homeShots = homeShotsRaw * HOME_SHOT_TILT;
  const awayShots = awayShotsRaw / HOME_SHOT_TILT;

  const homeSotRaw = rateSot(homeRows, homeShots, league.sot, mlActive);
  const awaySotRaw = rateSot(awayRows, awayShots, league.sot, mlActive);
  const homeSot = homeSotRaw * HOME_SHOT_TILT;
  const awaySot = awaySotRaw / HOME_SHOT_TILT;

  const totalShots = homeShots + awayShots;
  const totalSot = homeSot + awaySot;

  return {
    homeShots: round2(homeShots),
    awayShots: round2(awayShots),
    totalShots: round2(totalShots),
    homeSot: round2(homeSot),
    awaySot: round2(awaySot),
    totalSot: round2(totalSot),
    shotsOverUnder: ouLines(totalShots, TOTAL_SHOT_LINES),
    sotOver: overOnlyLines(totalSot, TOTAL_SOT_LINES),
    source: mlActive ? "satellite_ml_v1" : "satellite_v1",
    statsSeasonId: seasonId,
    mlActive,
  };
}

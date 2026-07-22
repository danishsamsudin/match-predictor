/**
 * Monte Carlo season outrights from remaining 1X2 fixtures.
 * Pure core sim - no DB required. Optional persist helper for glpm_cx_season_sim_runs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type Client = SupabaseClient<Database>;

export type SeasonSimFixture = {
  homeTeamSmId: number;
  awayTeamSmId: number;
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type SeasonSimStandingRow = {
  teamSmId: number;
  points: number;
  gd?: number;
};

export type SeasonSimResult = {
  iterations: number;
  titleProb: Record<number, number>;
  topFourProb: Record<number, number>;
  relegationProb: Record<number, number>;
  meanPoints: Record<number, number>;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function drawOutcome(
  fixture: SeasonSimFixture,
  rng: () => number
): "H" | "D" | "A" {
  const h = Math.max(0, fixture.homeWin);
  const d = Math.max(0, fixture.draw);
  const a = Math.max(0, fixture.awayWin);
  const sum = h + d + a;
  if (sum <= 0) return "D";
  const r = rng() * sum;
  if (r < h) return "H";
  if (r < h + d) return "D";
  return "A";
}

type RankRow = { teamSmId: number; points: number; gd: number };

function rankTable(rows: RankRow[]): RankRow[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return a.teamSmId - b.teamSmId;
  });
}

/**
 * Run N Monte Carlo simulations of remaining fixtures.
 * Relegation = bottom 3 finishers. Title = rank 1. Top four = ranks 1-4.
 */
export function simulateSeason(
  fixtures: SeasonSimFixture[],
  currentTable: SeasonSimStandingRow[],
  iterations = 2000,
  rng: () => number = Math.random
): SeasonSimResult {
  const n = Math.max(1, Math.floor(iterations));
  const teamIds = new Set<number>();
  for (const row of currentTable) teamIds.add(row.teamSmId);
  for (const f of fixtures) {
    teamIds.add(f.homeTeamSmId);
    teamIds.add(f.awayTeamSmId);
  }

  const basePoints = new Map<number, number>();
  const baseGd = new Map<number, number>();
  for (const id of teamIds) {
    basePoints.set(id, 0);
    baseGd.set(id, 0);
  }
  for (const row of currentTable) {
    basePoints.set(row.teamSmId, row.points);
    baseGd.set(row.teamSmId, row.gd ?? 0);
  }

  const titleHits = new Map<number, number>();
  const topFourHits = new Map<number, number>();
  const relegHits = new Map<number, number>();
  const pointsSum = new Map<number, number>();
  for (const id of teamIds) {
    titleHits.set(id, 0);
    topFourHits.set(id, 0);
    relegHits.set(id, 0);
    pointsSum.set(id, 0);
  }

  for (let i = 0; i < n; i++) {
    const points = new Map(basePoints);
    const gd = new Map(baseGd);

    for (const f of fixtures) {
      const outcome = drawOutcome(f, rng);
      const hp = points.get(f.homeTeamSmId) ?? 0;
      const ap = points.get(f.awayTeamSmId) ?? 0;
      if (outcome === "H") {
        points.set(f.homeTeamSmId, hp + 3);
        gd.set(f.homeTeamSmId, (gd.get(f.homeTeamSmId) ?? 0) + 1);
        gd.set(f.awayTeamSmId, (gd.get(f.awayTeamSmId) ?? 0) - 1);
      } else if (outcome === "A") {
        points.set(f.awayTeamSmId, ap + 3);
        gd.set(f.awayTeamSmId, (gd.get(f.awayTeamSmId) ?? 0) + 1);
        gd.set(f.homeTeamSmId, (gd.get(f.homeTeamSmId) ?? 0) - 1);
      } else {
        points.set(f.homeTeamSmId, hp + 1);
        points.set(f.awayTeamSmId, ap + 1);
      }
    }

    const ranked = rankTable(
      [...teamIds].map((teamSmId) => ({
        teamSmId,
        points: points.get(teamSmId) ?? 0,
        gd: gd.get(teamSmId) ?? 0,
      }))
    );

    for (const row of ranked) {
      pointsSum.set(row.teamSmId, (pointsSum.get(row.teamSmId) ?? 0) + row.points);
    }

    if (ranked[0]) {
      titleHits.set(ranked[0].teamSmId, (titleHits.get(ranked[0].teamSmId) ?? 0) + 1);
    }
    for (const row of ranked.slice(0, 4)) {
      topFourHits.set(row.teamSmId, (topFourHits.get(row.teamSmId) ?? 0) + 1);
    }
    for (const row of ranked.slice(-3)) {
      relegHits.set(row.teamSmId, (relegHits.get(row.teamSmId) ?? 0) + 1);
    }
  }

  const titleProb: Record<number, number> = {};
  const topFourProb: Record<number, number> = {};
  const relegationProb: Record<number, number> = {};
  const meanPoints: Record<number, number> = {};
  for (const id of teamIds) {
    titleProb[id] = clamp01((titleHits.get(id) ?? 0) / n);
    topFourProb[id] = clamp01((topFourHits.get(id) ?? 0) / n);
    relegationProb[id] = clamp01((relegHits.get(id) ?? 0) / n);
    meanPoints[id] = Math.round(((pointsSum.get(id) ?? 0) / n) * 100) / 100;
  }

  return { iterations: n, titleProb, topFourProb, relegationProb, meanPoints };
}

/** Object-form wrapper used by the season-sim API and tests. */
export function runSeasonMonteCarlo(args: {
  fixtures: SeasonSimFixture[];
  standings: SeasonSimStandingRow[];
  iterations?: number;
  rng?: () => number;
}): SeasonSimResult {
  return simulateSeason(
    args.fixtures,
    args.standings,
    args.iterations ?? 2000,
    args.rng
  );
}

/** Optional helper to archive a sim summary in glpm_cx_season_sim_runs. */
export async function persistSeasonSimRun(
  client: Client,
  opts: {
    seasonId: number;
    modelSource?: string;
    iterations: number;
    summary: SeasonSimResult | Record<string, unknown>;
    executedAt?: string;
  }
): Promise<string | null> {
  const { data, error } = await client
    .from("glpm_cx_season_sim_runs")
    .insert({
      season_id: opts.seasonId,
      model_source: opts.modelSource ?? "glpm_cx",
      iterations: opts.iterations,
      summary: opts.summary,
      executed_at: opts.executedAt ?? new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

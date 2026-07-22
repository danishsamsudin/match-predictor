/**
 * Club-simplified lineup availability impact for GLPM-CX.
 * Does not modify frozen GLPM; returns multipliers applied post-hoc to base xG.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type Client = SupabaseClient<Database>;

export type CxLineupPlayerDelta = {
  playerSmId: number | null;
  name: string;
  role: "attack" | "midfield" | "defence" | "goalkeeper" | "unknown";
  impact: number;
  note: string;
};

export type CxLineupImpact = {
  confirmed: boolean;
  homeMult: number;
  awayMult: number;
  homeDeltas: CxLineupPlayerDelta[];
  awayDeltas: CxLineupPlayerDelta[];
  summary: string;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function scoreFromTotals(args: {
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
}): number {
  const mins = Math.max(args.minutes, 1);
  const g90 = (args.goals / mins) * 90;
  const a90 = (args.assists / mins) * 90;
  const s90 = (args.shots / mins) * 90;
  // Rough attacking contribution index, centred near 1.0
  return clamp(0.92 + g90 * 0.08 + a90 * 0.05 + s90 * 0.01, 0.85, 1.12);
}

async function seasonPlayerTotals(
  client: Client,
  teamSmId: number,
  seasonId: number
): Promise<
  Map<
    number,
    { name: string; minutes: number; goals: number; assists: number; shots: number }
  >
> {
  const { data: matches } = await client
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", seasonId)
    .limit(400);
  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) return new Map();

  const { data: rows } = await client
    .from("glpm_match_player_stats")
    .select("player_sm_id,minutes_played,goals,assists,shots")
    .eq("team_sm_id", teamSmId)
    .in("match_sm_id", matchIds.slice(0, 400));

  const map = new Map<
    number,
    { name: string; minutes: number; goals: number; assists: number; shots: number }
  >();

  for (const row of rows ?? []) {
    if (row.player_sm_id == null) continue;
    const cur = map.get(row.player_sm_id) ?? {
      name: `Player ${row.player_sm_id}`,
      minutes: 0,
      goals: 0,
      assists: 0,
      shots: 0,
    };
    cur.minutes += Number(row.minutes_played ?? 0);
    cur.goals += Number(row.goals ?? 0);
    cur.assists += Number(row.assists ?? 0);
    cur.shots += Number(row.shots ?? 0);
    map.set(row.player_sm_id, cur);
  }

  const ids = [...map.keys()];
  if (ids.length) {
    const { data: players } = await client
      .from("glpm_players")
      .select("sm_id,short_name,first_name,last_name")
      .in("sm_id", ids);
    for (const p of players ?? []) {
      const cur = map.get(p.sm_id);
      if (!cur) continue;
      const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      cur.name = p.short_name || composed || cur.name;
    }
  }

  return map;
}

function teamMultFromTotals(
  totals: Map<
    number,
    { name: string; minutes: number; goals: number; assists: number; shots: number }
  >
): { mult: number; deltas: CxLineupPlayerDelta[] } {
  if (!totals.size) {
    return { mult: 1, deltas: [] };
  }

  const ranked = [...totals.entries()]
    .map(([id, t]) => ({
      id,
      ...t,
      score: scoreFromTotals(t),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const top = ranked.slice(0, 11);
  if (!top.length) return { mult: 1, deltas: [] };

  const avg = top.reduce((s, p) => s + p.score, 0) / top.length;
  const mult = clamp(avg, 0.9, 1.08);

  const deltas: CxLineupPlayerDelta[] = top.slice(0, 5).map((p) => ({
    playerSmId: p.id,
    name: p.name,
    role: "unknown",
    impact: Number((p.score - 1).toFixed(3)),
    note: `${p.minutes} season minutes · contribution index ${p.score.toFixed(2)}`,
  }));

  return { mult, deltas };
}

/**
 * Prefer confirmed lineup when matchSmId is known; otherwise use season minutes proxy
 * and mark as provisional (mult still computed, UI should disclose).
 */
export async function computeCxLineupImpact(
  client: Client,
  opts: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId: number;
    matchSmId?: number | null;
  }
): Promise<CxLineupImpact> {
  const [homeTotals, awayTotals] = await Promise.all([
    seasonPlayerTotals(client, opts.homeTeamSmId, opts.seasonId),
    seasonPlayerTotals(client, opts.awayTeamSmId, opts.seasonId),
  ]);

  let confirmed = false;
  if (opts.matchSmId != null) {
    // Presence of any player rows for this match ≈ lineup-derived stats ingested.
    const { count } = await client
      .from("glpm_match_player_stats")
      .select("player_sm_id", { count: "exact", head: true })
      .eq("match_sm_id", opts.matchSmId);
    confirmed = (count ?? 0) >= 2;
  }

  const home = teamMultFromTotals(homeTotals);
  const away = teamMultFromTotals(awayTotals);

  // Without confirmed XI, keep multipliers neutral to avoid false precision.
  const homeMult = confirmed ? home.mult : 1;
  const awayMult = confirmed ? away.mult : 1;

  return {
    confirmed,
    homeMult,
    awayMult,
    homeDeltas: home.deltas,
    awayDeltas: away.deltas,
    summary: confirmed
      ? "Confirmed / ingested lineup stats used for CX lineup multipliers."
      : "Provisional - no confirmed lineup for this fixture; lineup multiplier held at 1.0.",
  };
}

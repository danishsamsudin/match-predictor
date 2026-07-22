/**
 * Satellite player shots / SoT props from glpm_match_player_stats.
 * Minutes-weighted rates scaled to expected minutes (75). Labeled satellite only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type Client = SupabaseClient<Database>;

const TOP_PLAYERS = 8;
const EXPECTED_MINUTES = 75;
/** Typical shots-on-target share when SoT is not stored on player rows. */
const SOT_SHARE = 0.35;

export type CxPlayerPropLine = {
  playerSmId: number;
  playerName: string;
  teamSmId: number;
  side: "home" | "away";
  market: "shots" | "shots_on_target";
  expected: number;
  expectedMinutes: number;
  pOver05: number;
  pOver15: number;
  pOver25: number;
  source: "satellite";
};

export type CxPlayerPropsEstimate = {
  lines: CxPlayerPropLine[];
  source: "satellite_v1";
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Poisson-ish P(X > line) via cumulative 1 - F(floor(line)). */
export function poissonOverProb(lambda: number, line: 0.5 | 1.5 | 2.5): number {
  const lam = Math.max(0, lambda);
  if (lam <= 0) return 0;
  const kMax = Math.floor(line);
  // P(X >= kMax + 1) = 1 - sum_{k=0..kMax} e^{-λ} λ^k / k!
  let term = Math.exp(-lam);
  let cdf = term;
  for (let k = 1; k <= kMax; k++) {
    term *= lam / k;
    cdf += term;
  }
  return clamp01(1 - cdf);
}

type PlayerAgg = {
  playerSmId: number;
  minutes: number;
  shots: number;
};

async function seasonPlayerShotAggs(
  client: Client,
  teamSmId: number,
  seasonId: number | null | undefined
): Promise<PlayerAgg[]> {
  const matchQuery =
    seasonId != null
      ? client.from("glpm_matches").select("sm_id").eq("season_id", seasonId).limit(400)
      : client
          .from("glpm_matches")
          .select("sm_id")
          .or(`home_team_sm_id.eq.${teamSmId},away_team_sm_id.eq.${teamSmId}`)
          .limit(400);

  const { data: matches } = await matchQuery;
  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) return [];

  const { data: rows } = await client
    .from("glpm_match_player_stats")
    .select("player_sm_id,minutes_played,shots,is_goalkeeper")
    .eq("team_sm_id", teamSmId)
    .in("match_sm_id", matchIds.slice(0, 400));

  const map = new Map<number, PlayerAgg>();
  for (const row of rows ?? []) {
    if (row.player_sm_id == null) continue;
    if (row.is_goalkeeper === true) continue;
    const cur = map.get(row.player_sm_id) ?? {
      playerSmId: row.player_sm_id,
      minutes: 0,
      shots: 0,
    };
    cur.minutes += Number(row.minutes_played ?? 0);
    cur.shots += Number(row.shots ?? 0);
    map.set(row.player_sm_id, cur);
  }

  return [...map.values()]
    .filter((p) => p.minutes >= 90)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, TOP_PLAYERS);
}

function linesForPlayer(
  agg: PlayerAgg,
  name: string,
  teamSmId: number,
  side: "home" | "away"
): CxPlayerPropLine[] {
  const per90 = agg.minutes > 0 ? (agg.shots / agg.minutes) * 90 : 0;
  const expectedShots = Math.max(0, per90 * (EXPECTED_MINUTES / 90));
  const expectedSot = expectedShots * SOT_SHARE;

  const mk = (
    market: "shots" | "shots_on_target",
    expected: number
  ): CxPlayerPropLine => ({
    playerSmId: agg.playerSmId,
    playerName: name,
    teamSmId,
    side,
    market,
    expected: round3(expected),
    expectedMinutes: EXPECTED_MINUTES,
    pOver05: round3(poissonOverProb(expected, 0.5)),
    pOver15: round3(poissonOverProb(expected, 1.5)),
    pOver25: round3(poissonOverProb(expected, 2.5)),
    source: "satellite",
  });

  return [mk("shots", expectedShots), mk("shots_on_target", expectedSot)];
}

export async function estimatePlayerProps(
  client: Client,
  opts: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId?: number | null;
  }
): Promise<CxPlayerPropsEstimate> {
  const [homeAggs, awayAggs] = await Promise.all([
    seasonPlayerShotAggs(client, opts.homeTeamSmId, opts.seasonId),
    seasonPlayerShotAggs(client, opts.awayTeamSmId, opts.seasonId),
  ]);

  const ids = [...homeAggs, ...awayAggs].map((p) => p.playerSmId);
  const nameById = new Map<number, string>();
  if (ids.length) {
    const { data: players } = await client
      .from("glpm_players")
      .select("sm_id,short_name,first_name,last_name")
      .in("sm_id", ids);
    for (const p of players ?? []) {
      const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      const label = (p.short_name ?? composed).trim();
      if (label) nameById.set(p.sm_id, label);
    }
  }

  const lines: CxPlayerPropLine[] = [];
  for (const agg of homeAggs) {
    lines.push(
      ...linesForPlayer(
        agg,
        nameById.get(agg.playerSmId) ?? `Player ${agg.playerSmId}`,
        opts.homeTeamSmId,
        "home"
      )
    );
  }
  for (const agg of awayAggs) {
    lines.push(
      ...linesForPlayer(
        agg,
        nameById.get(agg.playerSmId) ?? `Player ${agg.playerSmId}`,
        opts.awayTeamSmId,
        "away"
      )
    );
  }

  return { lines, source: "satellite_v1" };
}

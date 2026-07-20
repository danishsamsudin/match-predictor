/**
 * Upsert goalkeeper / player match stats derived from Wyscout events + advanced totals.
 * Populates glpm_match_player_stats for Chapter 5 Goalkeeper Engine inputs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import type {
  WyscoutEventPayload,
  WyscoutMatchAdvancedStatsPayload,
  WyscoutTag,
} from "../../wyscout/types";
import {
  WYSCOUT_EVENT,
  WYSCOUT_SUB_EVENT,
  WYSCOUT_TAG,
} from "../../wyscout/types";
import { isShotLikeEvent } from "./extractShots";
import { listAdvancedStatsSides } from "./upsertMatchTeamStats";

type Client = SupabaseClient<Database>;
type PlayerStatsInsert = Database["public"]["Tables"]["glpm_match_player_stats"]["Insert"];

const BOX_X = 16;
const OUTSIDE_BOX_X = 18;

function tagIds(tags: WyscoutTag[] | undefined): number[] {
  return (tags ?? []).map((t) => t.id).filter((id) => Number.isFinite(id));
}

function hasTag(ids: number[], tag: number): boolean {
  return ids.includes(tag);
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function emptyAgg(): {
  team_sm_id: number;
  minutes_played: number | null;
  is_goalkeeper: boolean;
  goals_conceded: number;
  shots_faced: number;
  sot_faced: number;
  gk_saves: number;
  psxg_faced: number;
  crosses_faced: number;
  claims_attempted: number;
  claims_successful: number;
  punches: number;
  aerial_duels_won: number;
  passes: number;
  passes_completed: number;
  long_passes: number;
  long_passes_completed: number;
  progressive_passes: number;
  progressive_pass_distance: number;
  passes_under_pressure: number;
  passes_under_pressure_completed: number;
  def_actions_outside_box: number;
  sweeper_clearances: number;
  through_ball_interceptions: number;
  recoveries_outside_box: number;
  def_action_x_sum: number;
  def_action_x_n: number;
  penalties_faced: number;
  penalties_saved: number;
  penalty_psxg_faced: number;
} {
  return {
    team_sm_id: 0,
    minutes_played: null,
    is_goalkeeper: false,
    goals_conceded: 0,
    shots_faced: 0,
    sot_faced: 0,
    gk_saves: 0,
    psxg_faced: 0,
    crosses_faced: 0,
    claims_attempted: 0,
    claims_successful: 0,
    punches: 0,
    aerial_duels_won: 0,
    passes: 0,
    passes_completed: 0,
    long_passes: 0,
    long_passes_completed: 0,
    progressive_passes: 0,
    progressive_pass_distance: 0,
    passes_under_pressure: 0,
    passes_under_pressure_completed: 0,
    def_actions_outside_box: 0,
    sweeper_clearances: 0,
    through_ball_interceptions: 0,
    recoveries_outside_box: 0,
    def_action_x_sum: 0,
    def_action_x_n: 0,
    penalties_faced: 0,
    penalties_saved: 0,
    penalty_psxg_faced: 0,
  };
}

/**
 * Aggregate per-player GK-relevant counters from Wyscout events.
 * Goalkeepers are players with SAVE_ATTEMPT events or role flagged via options.
 */
export function aggregateGkPlayerStatsFromEvents(args: {
  events: WyscoutEventPayload[];
  matchSmId: number;
  teamSmIdByWyId: Map<number, number>;
  playerSmIdByWyId: Map<number, number>;
  /** Defending team SM id → GK player SM id (starter) */
  gkByDefendingTeamSmId: Map<number, number>;
  opponentGoalsByTeamSmId: Map<number, number | null>;
}): PlayerStatsInsert[] {
  const {
    events,
    matchSmId,
    teamSmIdByWyId,
    playerSmIdByWyId,
    gkByDefendingTeamSmId,
    opponentGoalsByTeamSmId,
  } = args;

  const byPlayer = new Map<number, ReturnType<typeof emptyAgg>>();

  function ensure(playerSmId: number, teamSmId: number) {
    let row = byPlayer.get(playerSmId);
    if (!row) {
      row = emptyAgg();
      row.team_sm_id = teamSmId;
      byPlayer.set(playerSmId, row);
    }
    return row;
  }

  // Seed known GKs so they always get a row
  for (const [teamSm, gkSm] of gkByDefendingTeamSmId) {
    const row = ensure(gkSm, teamSm);
    row.is_goalkeeper = true;
  }

  for (const event of events) {
    if (event.teamId == null || event.playerId == null) continue;
    const teamSm = teamSmIdByWyId.get(event.teamId);
    const playerSm = playerSmIdByWyId.get(event.playerId);
    if (teamSm == null || playerSm == null) continue;

    const ids = tagIds(event.tags);
    const accurate = hasTag(ids, WYSCOUT_TAG.ACCURATE);
    const pos = event.positions?.[0];
    const x = pos?.x ?? null;
    const row = ensure(playerSm, teamSm);

    if (event.eventId === WYSCOUT_EVENT.SAVE_ATTEMPT) {
      row.is_goalkeeper = true;
      row.gk_saves += 1;
      if (x != null && x > OUTSIDE_BOX_X) {
        row.def_actions_outside_box += 1;
        row.def_action_x_sum += x;
        row.def_action_x_n += 1;
      }
    }

    if (event.eventId === WYSCOUT_EVENT.PASS) {
      row.passes += 1;
      if (accurate) row.passes_completed += 1;
      const sub = event.subEventId;
      const isLong =
        sub === WYSCOUT_SUB_EVENT.HIGH_PASS ||
        sub === WYSCOUT_SUB_EVENT.LAUNCH ||
        (event.subEventName ?? "").toLowerCase().includes("long");
      if (isLong) {
        row.long_passes += 1;
        if (accurate) row.long_passes_completed += 1;
      }
      const endX = event.positions?.[1]?.x;
      if (x != null && endX != null && endX - x >= 10) {
        row.progressive_passes += 1;
        row.progressive_pass_distance += endX - x;
      }
      // Pressure proxy: inaccurate + duel context tags 1401/1501 nearby not available;
      // treat NOT_ACCURATE long/short under "pressure" when event name mentions pressure.
      const name = (event.eventName ?? "").toLowerCase() + (event.subEventName ?? "").toLowerCase();
      if (name.includes("pressure") || hasTag(ids, 501) || hasTag(ids, 502)) {
        row.passes_under_pressure += 1;
        if (accurate) row.passes_under_pressure_completed += 1;
      }
    }

    if (event.eventId === WYSCOUT_EVENT.DUEL) {
      const name = `${event.eventName ?? ""} ${event.subEventName ?? ""}`.toLowerCase();
      if (name.includes("air") || event.subEventId === WYSCOUT_SUB_EVENT.AIR_DUEL) {
        if (accurate) row.aerial_duels_won += 1;
      }
      if (name.includes("claim") || name.includes("catch")) {
        row.claims_attempted += 1;
        if (accurate) row.claims_successful += 1;
      }
      if (name.includes("punch")) {
        row.punches += 1;
      }
    }

    if (event.eventId === WYSCOUT_EVENT.OTHERS_ON_BALL) {
      const name = `${event.eventName ?? ""} ${event.subEventName ?? ""}`.toLowerCase();
      if (name.includes("clearance") || event.subEventId === WYSCOUT_SUB_EVENT.CLEARANCE) {
        if (x != null && x > BOX_X) {
          row.sweeper_clearances += 1;
          row.def_actions_outside_box += 1;
          row.def_action_x_sum += x;
          row.def_action_x_n += 1;
        }
      }
      if (name.includes("recovery") || name.includes("interception")) {
        if (x != null && x > BOX_X) {
          row.recoveries_outside_box += 1;
          row.def_actions_outside_box += 1;
          row.def_action_x_sum += x;
          row.def_action_x_n += 1;
        }
      }
    }

    if (event.eventId === WYSCOUT_EVENT.GOALKEEPER_LEAVING_LINE) {
      row.is_goalkeeper = true;
      row.def_actions_outside_box += 1;
      if (x != null) {
        row.def_action_x_sum += x;
        row.def_action_x_n += 1;
      }
    }

    // Through-ball interceptions: interception sub-event
    if (
      event.subEventId === WYSCOUT_SUB_EVENT.INTERCEPTION ||
      (event.subEventName ?? "").toLowerCase().includes("interception")
    ) {
      row.through_ball_interceptions += 1;
    }
  }

  // Attribute shots faced / PSxG / penalties to defending GK
  for (const event of events) {
    if (!isShotLikeEvent(event) || event.teamId == null) continue;
    const shootingTeamSm = teamSmIdByWyId.get(event.teamId);
    if (shootingTeamSm == null) continue;

    // Defending team = the other mapped team
    const defendingTeamSm = [...teamSmIdByWyId.values()].find((id) => id !== shootingTeamSm);
    if (defendingTeamSm == null) continue;
    const gkSm = gkByDefendingTeamSmId.get(defendingTeamSm);
    if (gkSm == null) continue;

    const row = ensure(gkSm, defendingTeamSm);
    row.is_goalkeeper = true;
    row.shots_faced += 1;

    const ids = tagIds(event.tags);
    const isGoal = hasTag(ids, WYSCOUT_TAG.GOAL);
    const psxg =
      asNumber(event.postShotXg) ?? asNumber(event.psxg) ?? asNumber(event.xCG) ?? 0;
    const zoneOnTarget =
      ids.some((id) => id >= 1201 && id <= 1209) || isGoal;
    if (zoneOnTarget || psxg > 0) {
      row.sot_faced += 1;
      row.psxg_faced += psxg;
    }
    if (isGoal) row.goals_conceded += 1;

    if (event.subEventId === WYSCOUT_SUB_EVENT.PENALTY) {
      row.penalties_faced += 1;
      row.penalty_psxg_faced += psxg > 0 ? psxg : 0.76;
      if (!isGoal) row.penalties_saved += 1;
    }
  }

  // Crosses faced: opponent crosses attributed to GK
  for (const event of events) {
    if (event.teamId == null) continue;
    if (event.eventId !== WYSCOUT_EVENT.PASS) continue;
    const name = `${event.subEventName ?? ""}`.toLowerCase();
    const isCross =
      name.includes("cross") || event.subEventId === WYSCOUT_SUB_EVENT.CROSS;
    if (!isCross) continue;
    const shootingTeamSm = teamSmIdByWyId.get(event.teamId);
    if (shootingTeamSm == null) continue;
    const defendingTeamSm = [...teamSmIdByWyId.values()].find((id) => id !== shootingTeamSm);
    if (defendingTeamSm == null) continue;
    const gkSm = gkByDefendingTeamSmId.get(defendingTeamSm);
    if (gkSm == null) continue;
    ensure(gkSm, defendingTeamSm).crosses_faced += 1;
  }

  const now = new Date().toISOString();
  const rows: PlayerStatsInsert[] = [];

  for (const [playerSmId, agg] of byPlayer) {
    if (!agg.is_goalkeeper && agg.gk_saves === 0 && agg.passes === 0) continue;
    // Prefer opponent goals from match score when available
    const goalsConceded =
      opponentGoalsByTeamSmId.get(agg.team_sm_id) ?? agg.goals_conceded;

    rows.push({
      match_sm_id: matchSmId,
      player_sm_id: playerSmId,
      team_sm_id: agg.team_sm_id,
      minutes_played: agg.minutes_played ?? 90,
      goals: null,
      assists: null,
      shots: null,
      xg: null,
      psxg_faced: agg.psxg_faced > 0 ? agg.psxg_faced : null,
      gk_saves: agg.gk_saves > 0 ? agg.gk_saves : null,
      is_goalkeeper: agg.is_goalkeeper,
      goals_conceded: typeof goalsConceded === "number" ? goalsConceded : agg.goals_conceded,
      shots_faced: agg.shots_faced || null,
      sot_faced: agg.sot_faced || null,
      crosses_faced: agg.crosses_faced || null,
      claims_attempted: agg.claims_attempted || null,
      claims_successful: agg.claims_successful || null,
      punches: agg.punches || null,
      aerial_duels_won: agg.aerial_duels_won || null,
      passes: agg.passes || null,
      passes_completed: agg.passes_completed || null,
      long_passes: agg.long_passes || null,
      long_passes_completed: agg.long_passes_completed || null,
      progressive_passes: agg.progressive_passes || null,
      progressive_pass_distance:
        agg.progressive_pass_distance > 0 ? agg.progressive_pass_distance : null,
      passes_under_pressure: agg.passes_under_pressure || null,
      passes_under_pressure_completed: agg.passes_under_pressure_completed || null,
      def_actions_outside_box: agg.def_actions_outside_box || null,
      sweeper_clearances: agg.sweeper_clearances || null,
      through_ball_interceptions: agg.through_ball_interceptions || null,
      recoveries_outside_box: agg.recoveries_outside_box || null,
      avg_defensive_action_x:
        agg.def_action_x_n > 0 ? agg.def_action_x_sum / agg.def_action_x_n : null,
      penalties_faced: agg.penalties_faced || null,
      penalties_saved: agg.penalties_saved || null,
      penalty_psxg_faced: agg.penalty_psxg_faced > 0 ? agg.penalty_psxg_faced : null,
      payload: { source: "wyscout_events" },
      synced_at: now,
    });
  }

  return rows;
}

/**
 * Infer starter GK per team: player with most SAVE_ATTEMPT events, else mapped role.
 */
export function inferGkByTeamFromEvents(
  events: WyscoutEventPayload[],
  teamSmIdByWyId: Map<number, number>,
  playerSmIdByWyId: Map<number, number>
): Map<number, number> {
  const savesByTeamPlayer = new Map<string, number>();
  for (const event of events) {
    if (event.eventId !== WYSCOUT_EVENT.SAVE_ATTEMPT) continue;
    if (event.teamId == null || event.playerId == null) continue;
    const teamSm = teamSmIdByWyId.get(event.teamId);
    const playerSm = playerSmIdByWyId.get(event.playerId);
    if (teamSm == null || playerSm == null) continue;
    const key = `${teamSm}:${playerSm}`;
    savesByTeamPlayer.set(key, (savesByTeamPlayer.get(key) ?? 0) + 1);
  }

  const best = new Map<number, { player: number; n: number }>();
  for (const [key, n] of savesByTeamPlayer) {
    const [teamStr, playerStr] = key.split(":");
    const team = Number(teamStr);
    const player = Number(playerStr);
    const cur = best.get(team);
    if (!cur || n > cur.n) best.set(team, { player, n });
  }

  const out = new Map<number, number>();
  for (const [team, v] of best) out.set(team, v.player);
  return out;
}

export async function loadPlayerSmIdByWyId(
  supabase: Client,
  wyPlayerIds: number[]
): Promise<Map<number, number>> {
  const unique = [...new Set(wyPlayerIds.filter((id) => Number.isFinite(id)))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from("glpm_provider_entity_map")
    .select("sm_id, provider_entity_id")
    .eq("entity_type", "player")
    .eq("provider", "wyscout")
    .in("provider_entity_id", unique);
  if (error) throw new Error(`loadPlayerSmIdByWyId failed: ${error.message}`);
  const map = new Map<number, number>();
  for (const row of data ?? []) {
    map.set(row.provider_entity_id, row.sm_id);
  }
  return map;
}

export async function upsertMatchPlayerGkStats(
  supabase: Client,
  args: {
    matchSmId: number;
    events: WyscoutEventPayload[];
    advancedStats: WyscoutMatchAdvancedStatsPayload;
    teamSmIdByWyId: Map<number, number>;
    homeGoals: number | null;
    awayGoals: number | null;
    homeTeamSmId: number;
    awayTeamSmId: number;
  }
): Promise<{ playerRows: number; teamGkSavesUpdated: boolean }> {
  const wyPlayerIds = (args.events ?? [])
    .map((e) => e.playerId)
    .filter((id): id is number => id != null);
  const playerSmIdByWyId = await loadPlayerSmIdByWyId(supabase, wyPlayerIds);

  let gkByTeam = inferGkByTeamFromEvents(
    args.events,
    args.teamSmIdByWyId,
    playerSmIdByWyId
  );

  // If no saves observed, leave map empty — still write team gk_saves from advanced stats
  const opponentGoalsByTeamSmId = new Map<number, number | null>([
    [args.homeTeamSmId, args.awayGoals],
    [args.awayTeamSmId, args.homeGoals],
  ]);

  const rows = aggregateGkPlayerStatsFromEvents({
    events: args.events,
    matchSmId: args.matchSmId,
    teamSmIdByWyId: args.teamSmIdByWyId,
    playerSmIdByWyId,
    gkByDefendingTeamSmId: gkByTeam,
    opponentGoalsByTeamSmId,
  });

  // Overlay team advanced gkSaves / psxg onto the (single) GK row per side when present
  const sides = listAdvancedStatsSides(args.advancedStats);
  for (const side of sides) {
    const teamSm = args.teamSmIdByWyId.get(side.teamId);
    if (teamSm == null) continue;
    const total = (side.total ?? {}) as Record<string, unknown>;
    const gkSaves = asNumber(total.gkSaves);
    const psxgFaced =
      asNumber(total.postShotXgAgainst) ??
      asNumber(total.xCG) ??
      asNumber(total.psxgFaced);

    let gkRow = rows.find((r) => r.team_sm_id === teamSm && r.is_goalkeeper);
    if (!gkRow && gkByTeam.has(teamSm)) {
      const playerSm = gkByTeam.get(teamSm)!;
      gkRow = {
        match_sm_id: args.matchSmId,
        player_sm_id: playerSm,
        team_sm_id: teamSm,
        is_goalkeeper: true,
        minutes_played: 90,
        synced_at: new Date().toISOString(),
      };
      rows.push(gkRow);
    }
    if (gkRow) {
      if (gkSaves != null) gkRow.gk_saves = gkSaves;
      if (psxgFaced != null && (gkRow.psxg_faced == null || gkRow.psxg_faced === 0)) {
        gkRow.psxg_faced = psxgFaced;
      }
      if (opponentGoalsByTeamSmId.get(teamSm) != null) {
        gkRow.goals_conceded = opponentGoalsByTeamSmId.get(teamSm) ?? null;
      }
    }

    // Team stats gk_saves patch
    if (gkSaves != null) {
      await supabase
        .from("glpm_match_team_stats")
        .update({ gk_saves: gkSaves })
        .eq("match_sm_id", args.matchSmId)
        .eq("team_sm_id", teamSm);
    }
  }

  if (rows.length) {
    // Ensure players exist for FK (glpm_players referenced by ratings; player_stats has no FK)
    const { error } = await supabase
      .from("glpm_match_player_stats")
      .upsert(rows, { onConflict: "match_sm_id,player_sm_id" });
    if (error) throw new Error(`upsertMatchPlayerGkStats failed: ${error.message}`);
  }

  return { playerRows: rows.length, teamGkSavesUpdated: true };
}

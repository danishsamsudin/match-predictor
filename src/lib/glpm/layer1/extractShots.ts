import type {
  WyscoutEventPayload,
  WyscoutTag,
} from "../../wyscout/types";
import {
  WYSCOUT_EVENT,
  WYSCOUT_SUB_EVENT,
  WYSCOUT_TAG,
  isGoalZoneTag,
  isOnTargetZoneTag,
} from "../../wyscout/types";
import type { Database } from "../../supabase";

type ShotInsert = Database["public"]["Tables"]["glpm_match_shots"]["Insert"];
type EventInsert = Database["public"]["Tables"]["glpm_match_events"]["Insert"];

function tagIds(tags: WyscoutTag[] | undefined): number[] {
  return (tags ?? []).map((t) => t.id).filter((id) => Number.isFinite(id));
}

function hasTag(ids: number[], tag: number): boolean {
  return ids.includes(tag);
}

function pickPreShotXg(event: WyscoutEventPayload): number | null {
  const v = event.xg;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pickPostShotXg(event: WyscoutEventPayload): number | null {
  const candidates = [event.postShotXg, event.psxg, event.xCG];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return null;
}

export type ShotExtractMaps = {
  teamSmIdByWyId: Map<number, number>;
  playerSmIdByWyId?: Map<number, number>;
  /** Defending team SM id → GK player SM id */
  gkByDefendingTeamSmId?: Map<number, number>;
};

/**
 * Map Wyscout event IDs into GLPM event rows keyed by SportMonks match/team IDs.
 * teamSmIdByWyId translates Wyscout team IDs → SportMonks team IDs.
 */
export function mapWyscoutEventRow(
  event: WyscoutEventPayload,
  matchSmId: number,
  teamSmIdByWyId: Map<number, number>,
  playerSmIdByWyId?: Map<number, number>
): EventInsert {
  const pos = event.positions?.[0];
  const teamSm =
    event.teamId != null ? teamSmIdByWyId.get(event.teamId) ?? null : null;
  const playerSm =
    event.playerId != null && playerSmIdByWyId
      ? playerSmIdByWyId.get(event.playerId) ?? null
      : null;
  return {
    // Offset Wyscout event ids to avoid colliding with SportMonks discrete event ids
    event_id: event.id + 10_000_000_000,
    match_sm_id: matchSmId,
    team_sm_id: teamSm,
    player_sm_id: playerSm,
    source: "wyscout",
    match_period: event.matchPeriod ?? null,
    event_sec: event.eventSec ?? null,
    event_id_type: event.eventId ?? null,
    event_name: event.eventName ?? null,
    sub_event_id: event.subEventId ?? null,
    sub_event_name: event.subEventName ?? null,
    pos_x: pos?.x ?? null,
    pos_y: pos?.y ?? null,
    tags: event.tags ?? [],
    xg: pickPreShotXg(event),
    psxg: pickPostShotXg(event),
    synced_at: new Date().toISOString(),
  };
}

export function isShotLikeEvent(event: WyscoutEventPayload): boolean {
  if (event.eventId === WYSCOUT_EVENT.SHOT) return true;
  if (
    event.eventId === WYSCOUT_EVENT.FREE_KICK &&
    (event.subEventId === WYSCOUT_SUB_EVENT.PENALTY ||
      event.subEventId === WYSCOUT_SUB_EVENT.FREE_KICK_SHOT)
  ) {
    return true;
  }
  return false;
}

export function extractShotsFromEvents(
  events: WyscoutEventPayload[],
  matchSmId: number,
  maps: Map<number, number> | ShotExtractMaps
): ShotInsert[] {
  const teamSmIdByWyId =
    maps instanceof Map ? maps : maps.teamSmIdByWyId;
  const playerSmIdByWyId =
    maps instanceof Map ? undefined : maps.playerSmIdByWyId;
  const gkByDefendingTeamSmId =
    maps instanceof Map ? undefined : maps.gkByDefendingTeamSmId;

  const defendingTeams = [...teamSmIdByWyId.values()];
  const shots: ShotInsert[] = [];

  for (const event of events) {
    if (!isShotLikeEvent(event)) continue;
    if (event.teamId == null) continue;
    const teamSm = teamSmIdByWyId.get(event.teamId);
    if (teamSm == null) continue;

    const ids = tagIds(event.tags);
    const zoneTag = ids.find(isGoalZoneTag) ?? null;
    const bodyPart =
      ids.find(
        (id) =>
          id === WYSCOUT_TAG.LEFT_FOOT ||
          id === WYSCOUT_TAG.RIGHT_FOOT ||
          id === WYSCOUT_TAG.HEAD_BODY
      ) ?? null;

    const isBlocked = hasTag(ids, WYSCOUT_TAG.BLOCKED);
    const isGoal = hasTag(ids, WYSCOUT_TAG.GOAL);
    const isOnTarget =
      zoneTag != null
        ? isOnTargetZoneTag(zoneTag)
        : isGoal
          ? true
          : isBlocked
            ? false
            : null;

    const playerSm =
      event.playerId != null && playerSmIdByWyId
        ? playerSmIdByWyId.get(event.playerId) ?? null
        : null;

    const defendingTeamSm = defendingTeams.find((id) => id !== teamSm);
    const gkPlayerSm =
      defendingTeamSm != null && gkByDefendingTeamSmId
        ? gkByDefendingTeamSmId.get(defendingTeamSm) ?? null
        : null;

    const pos = event.positions?.[0];
    shots.push({
      event_id: event.id + 10_000_000_000,
      match_sm_id: matchSmId,
      team_sm_id: teamSm,
      player_sm_id: playerSm,
      gk_player_sm_id: gkPlayerSm,
      source: "wyscout",
      match_period: event.matchPeriod ?? null,
      event_sec: event.eventSec ?? null,
      pos_x: pos?.x ?? null,
      pos_y: pos?.y ?? null,
      pre_shot_xg: pickPreShotXg(event),
      post_shot_xg: pickPostShotXg(event),
      is_on_target: isOnTarget,
      is_goal: isGoal,
      is_penalty: event.subEventId === WYSCOUT_SUB_EVENT.PENALTY,
      is_set_piece:
        event.eventId === WYSCOUT_EVENT.FREE_KICK ||
        event.subEventId === WYSCOUT_SUB_EVENT.FREE_KICK_SHOT ||
        event.subEventId === WYSCOUT_SUB_EVENT.PENALTY,
      is_blocked: isBlocked,
      is_opportunity: hasTag(ids, WYSCOUT_TAG.OPPORTUNITY),
      is_counter_attack: hasTag(ids, WYSCOUT_TAG.COUNTER_ATTACK),
      body_part_tag: bodyPart,
      goal_zone_tag: zoneTag,
      tags: event.tags ?? [],
      synced_at: new Date().toISOString(),
    });
  }

  return shots;
}

export function recomputePpdaFromEvents(
  events: WyscoutEventPayload[],
  defendingTeamWyId: number
): number | null {
  let opponentPassesInZone = 0;
  let defensiveActions = 0;

  for (const event of events) {
    const x = event.positions?.[0]?.x;
    if (event.teamId !== defendingTeamWyId) {
      if (event.eventId === WYSCOUT_EVENT.PASS && x != null && x >= 40) {
        opponentPassesInZone += 1;
      }
      continue;
    }
    if (event.eventId === 1 && event.subEventId === 12) defensiveActions += 1;
    if (event.eventName === "Others on the ball" && event.subEventId === 71) {
      defensiveActions += 1;
    }
    const ids = tagIds(event.tags);
    if (ids.includes(1401) || ids.includes(1501)) defensiveActions += 1;
  }

  if (defensiveActions <= 0) return null;
  return opponentPassesInZone / defensiveActions;
}

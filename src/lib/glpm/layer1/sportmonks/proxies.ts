/**
 * SportMonks proxy metrics when Wyscout / true PPDA is unavailable.
 */

import { parseStatValue, SM_STAT_TYPE } from "../../../sportmonks/statTypes";
import type { SmFixture, SmStatistic, SmXgFixtureRow } from "../../../sportmonks/types";

const EXPECTED_TYPE_IDS: Set<number> = new Set([
  SM_STAT_TYPE.EXPECTED_GOALS,
  SM_STAT_TYPE.EXPECTED_GOALS_ON_TARGET,
  SM_STAT_TYPE.EXPECTED_GOALS_PREVENTED,
  SM_STAT_TYPE.NPXG,
  SM_STAT_TYPE.EXPECTED_GOALS_AGAINST,
]);

export function statsForParticipant(
  stats: SmStatistic[] | undefined,
  participantId: number
): Map<number, number> {
  const map = new Map<number, number>();
  for (const s of stats ?? []) {
    if (s.participant_id !== participantId) continue;
    const v = parseStatValue(s.data?.value ?? s.value);
    if (v != null) map.set(s.type_id, v);
  }
  return map;
}

/** Merge xGFixture rows into team stat maps (prefer over empty statistics for Expected types). */
export function mergeXgFixtureIntoMaps(
  fixture: SmFixture,
  homeId: number,
  awayId: number,
  homeMap: Map<number, number>,
  awayMap: Map<number, number>
): void {
  for (const row of fixture.xGFixture ?? []) {
    const typeId = row.type_id;
    const participantId = row.participant_id;
    if (typeId == null || participantId == null || !EXPECTED_TYPE_IDS.has(typeId)) continue;
    const v = parseStatValue(row.data?.value ?? row.value);
    if (v == null) continue;
    const target =
      participantId === homeId ? homeMap : participantId === awayId ? awayMap : null;
    if (!target) continue;
    if (!target.has(typeId)) target.set(typeId, v);
  }
}

export function computeDefensiveActions(map: Map<number, number>): number | null {
  const tackles = map.get(SM_STAT_TYPE.TACKLES);
  const interceptions = map.get(SM_STAT_TYPE.INTERCEPTIONS);
  const clearances = map.get(SM_STAT_TYPE.CLEARANCES);
  if (tackles == null && interceptions == null && clearances == null) return null;
  return (tackles ?? 0) + (interceptions ?? 0) + (clearances ?? 0);
}

/** PPDA proxy: opponent passes / max(1, own defensive actions). Tagged sportmonks_proxy. */
export function computePpdaProxy(
  ownMap: Map<number, number>,
  oppMap: Map<number, number>
): number | null {
  const defensiveActions = computeDefensiveActions(ownMap);
  const oppPasses = oppMap.get(SM_STAT_TYPE.PASSES);
  if (defensiveActions == null || defensiveActions <= 0 || oppPasses == null) return null;
  return Math.round((oppPasses / Math.max(1, defensiveActions)) * 1000) / 1000;
}

/** Progressive passes proxy: key passes + successful long passes. */
export function computeProgressivePassesProxy(map: Map<number, number>): number | null {
  const keyPasses = map.get(SM_STAT_TYPE.KEY_PASSES);
  const longPasses = map.get(SM_STAT_TYPE.SUCCESSFUL_LONG_PASSES);
  if (keyPasses == null && longPasses == null) return null;
  return Math.round(((keyPasses ?? 0) + (longPasses ?? 0)) * 1000) / 1000;
}

/** Final-third entry proxy: dangerous attacks (SportMonks team stat). */
export function computeFinalThirdEntriesProxy(map: Map<number, number>): number | null {
  const dangerous = map.get(SM_STAT_TYPE.DANGEROUS_ATTACKS);
  if (dangerous != null) return Math.round(dangerous * 1000) / 1000;
  const attacks = map.get(SM_STAT_TYPE.ATTACKS);
  return attacks != null ? Math.round(attacks * 1000) / 1000 : null;
}

/** Ball recoveries proxy: tackles + interceptions. */
export function computeBallRecoveriesProxy(map: Map<number, number>): number | null {
  const tackles = map.get(SM_STAT_TYPE.TACKLES);
  const interceptions = map.get(SM_STAT_TYPE.INTERCEPTIONS);
  if (tackles == null && interceptions == null) return null;
  return Math.round(((tackles ?? 0) + (interceptions ?? 0)) * 1000) / 1000;
}

/** High-turnover proxy for pressing: interceptions won in advanced areas (SM has no true HT stat). */
export function computeHighTurnoversProxy(map: Map<number, number>): number | null {
  const interceptions = map.get(SM_STAT_TYPE.INTERCEPTIONS);
  return interceptions != null ? Math.round(interceptions * 1000) / 1000 : null;
}

export function sumLineupGkSavesByTeam(
  fixture: SmFixture
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const lineup of fixture.lineups ?? []) {
    const teamId = lineup.team_id;
    if (!teamId) continue;
    let saves = 0;
    let found = false;
    for (const d of lineup.details ?? []) {
      if (d.type_id !== SM_STAT_TYPE.SAVES) continue;
      const v = parseStatValue(d.data?.value ?? d.value);
      if (v != null) {
        saves += v;
        found = true;
      }
    }
    if (!found) continue;
    totals.set(teamId, (totals.get(teamId) ?? 0) + saves);
  }
  return totals;
}

export type XgFixtureRowLike = SmXgFixtureRow;

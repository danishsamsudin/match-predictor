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
  SM_STAT_TYPE.EXPECTED_GOALS_PENALTIES,
  SM_STAT_TYPE.EXPECTED_GOALS_FREE_KICKS,
  SM_STAT_TYPE.EXPECTED_GOALS_CORNERS,
  SM_STAT_TYPE.EXPECTED_GOALS_SET_PLAY,
  SM_STAT_TYPE.EXPECTED_GOALS_OPEN_PLAY,
  SM_STAT_TYPE.EXPECTED_GOALS_AGAINST,
]);

/** Research-weighted field-tilt approximation when final-third pass share is unavailable. */
export const FIELD_TILT_PROXY_WEIGHTS = {
  dangerousAttackShare: 0.55,
  shotsInsideBoxShare: 0.3,
  possession: 0.15,
} as const;

/** Typical set-piece xG per corner when SportMonks xGSP is missing. */
export const SET_PIECE_XG_PER_CORNER = 0.035;

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

function matchShare(own: number | null | undefined, opp: number | null | undefined): number | null {
  if (own == null || opp == null) return null;
  const total = own + opp;
  if (!(total > 0)) return null;
  return (100 * own) / total;
}

/**
 * Approximate field tilt (0–100) from SportMonks team stats.
 * Weights favour final-third / box activity over raw possession.
 */
export function computeFieldTiltProxy(args: {
  ownDangerousAttacks: number | null;
  oppDangerousAttacks: number | null;
  ownShotsInsideBox: number | null;
  oppShotsInsideBox: number | null;
  possessionPct: number | null;
}): number | null {
  const da = matchShare(args.ownDangerousAttacks, args.oppDangerousAttacks);
  const sib = matchShare(args.ownShotsInsideBox, args.oppShotsInsideBox);
  const poss =
    args.possessionPct != null && Number.isFinite(args.possessionPct)
      ? Number(args.possessionPct)
      : null;

  const parts: number[] = [];
  const weights: number[] = [];
  if (da != null) {
    parts.push(da);
    weights.push(FIELD_TILT_PROXY_WEIGHTS.dangerousAttackShare);
  }
  if (sib != null) {
    parts.push(sib);
    weights.push(FIELD_TILT_PROXY_WEIGHTS.shotsInsideBoxShare);
  }
  if (poss != null) {
    parts.push(poss);
    weights.push(FIELD_TILT_PROXY_WEIGHTS.possession);
  }
  if (!parts.length) return null;
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = parts.reduce((acc, p, i) => acc + p * weights[i]!, 0) / wsum;
  return Math.round(Math.max(0, Math.min(100, raw)) * 100) / 100;
}

export type SetPieceXgResolution = {
  setPieceXg: number | null;
  openPlayXg: number | null;
  source: "sportmonks" | "sportmonks_proxy" | null;
};

/**
 * Prefer SportMonks set-play / open-play xG; else corners × {@link SET_PIECE_XG_PER_CORNER}.
 */
export function resolveSetPieceXgSplit(args: {
  map: Map<number, number>;
  teamXg: number | null;
}): SetPieceXgResolution {
  const providerSp =
    args.map.get(SM_STAT_TYPE.EXPECTED_GOALS_SET_PLAY) ??
    (() => {
      const corners = args.map.get(SM_STAT_TYPE.EXPECTED_GOALS_CORNERS);
      const fk = args.map.get(SM_STAT_TYPE.EXPECTED_GOALS_FREE_KICKS);
      const pen = args.map.get(SM_STAT_TYPE.EXPECTED_GOALS_PENALTIES);
      if (corners == null && fk == null && pen == null) return null;
      return (corners ?? 0) + (fk ?? 0) + (pen ?? 0);
    })();
  const providerOp = args.map.get(SM_STAT_TYPE.EXPECTED_GOALS_OPEN_PLAY) ?? null;
  if (providerSp != null || providerOp != null) {
    let setPieceXg = providerSp;
    let openPlayXg = providerOp;
    if (setPieceXg == null && openPlayXg != null && args.teamXg != null) {
      setPieceXg = Math.max(0, args.teamXg - openPlayXg);
    }
    if (openPlayXg == null && setPieceXg != null && args.teamXg != null) {
      openPlayXg = Math.max(0, args.teamXg - setPieceXg);
    }
    return {
      setPieceXg:
        setPieceXg != null ? Math.round(setPieceXg * 1000) / 1000 : null,
      openPlayXg:
        openPlayXg != null ? Math.round(openPlayXg * 1000) / 1000 : null,
      source: "sportmonks",
    };
  }

  const corners = args.map.get(SM_STAT_TYPE.CORNERS) ?? null;
  if (corners == null) {
    return { setPieceXg: null, openPlayXg: null, source: null };
  }
  const setPieceXg =
    Math.round(Math.max(0, corners) * SET_PIECE_XG_PER_CORNER * 1000) / 1000;
  const openPlayXg =
    args.teamXg != null
      ? Math.round(Math.max(0, args.teamXg - setPieceXg) * 1000) / 1000
      : null;
  return { setPieceXg, openPlayXg, source: "sportmonks_proxy" };
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

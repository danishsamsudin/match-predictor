import { clampInternationalBaselineXg } from "@/lib/world-cup/international-strength";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface SetPieceSideInput {
  teamId: number;
  /** StatsBomb / process profile set-piece xG share (0–1). */
  processSetPieceShare?: number;
  /** Opta ingested set-piece goal share fallback. */
  optaSetPieceRate?: number | null;
  /** Opponent defensive solidity composite (0–2.5 typical). */
  opponentDefensiveSolidity?: number;
  /** Opponent historical set-piece xG share (proxy for aerial vulnerability). */
  opponentSetPieceShare?: number;
}

export function resolveTeamSetPieceShare(input: {
  processSetPieceShare?: number;
  optaSetPieceRate?: number | null;
}): number {
  if (
    input.processSetPieceShare != null &&
    Number.isFinite(input.processSetPieceShare) &&
    input.processSetPieceShare > 0
  ) {
    return clamp(input.processSetPieceShare, 0, 1);
  }
  if (
    input.optaSetPieceRate != null &&
    Number.isFinite(input.optaSetPieceRate) &&
    input.optaSetPieceRate > 0
  ) {
    return clamp(input.optaSetPieceRate, 0, 1);
  }
  return 0;
}

/** Opponent set-piece defensive leak (0–1): higher ⇒ more vulnerable on restarts. */
export function opponentSetPieceDefLeak(input: {
  opponentSetPieceShare?: number;
  opponentDefensiveSolidity?: number;
}): number {
  const fromShare = clamp(input.opponentSetPieceShare ?? 0, 0, 1);
  const fromDefense =
    input.opponentDefensiveSolidity != null
      ? clamp(1 - input.opponentDefensiveSolidity / 2.5, 0, 1)
      : 0;
  return clamp((fromShare + fromDefense) / 2, 0, 1);
}

export function computeSetPieceMultiplier(
  teamSetShare: number,
  opponentDefLeak: number,
  cal: Pick<
    WcCalibrationConstants,
    "setPieceRateThreshold" | "setPieceXgMultiplier" | "setPieceDefLeakWeight"
  >
): number {
  const excess = Math.max(0, teamSetShare - cal.setPieceRateThreshold);
  if (excess <= 0) return 1;
  return (
    1 +
    cal.setPieceXgMultiplier *
      excess *
      (1 + cal.setPieceDefLeakWeight * opponentDefLeak)
  );
}

export interface SetPieceAdjustmentResult {
  homeXg: number;
  awayXg: number;
  homeMult: number;
  awayMult: number;
  homeSetShare: number;
  awaySetShare: number;
  homeDefLeak: number;
  awayDefLeak: number;
}

export function applySetPieceXgAdjustment(input: {
  homeXg: number;
  awayXg: number;
  home: SetPieceSideInput;
  away: SetPieceSideInput;
  calibration: Pick<
    WcCalibrationConstants,
    | "setPieceRateThreshold"
    | "setPieceXgMultiplier"
    | "setPieceDefLeakWeight"
    | "teamSetPieceRates"
    | "xgCapSoftness"
  >;
}): SetPieceAdjustmentResult {
  const homeSetShare = resolveTeamSetPieceShare({
    processSetPieceShare: input.home.processSetPieceShare,
    optaSetPieceRate:
      input.home.optaSetPieceRate ??
      input.calibration.teamSetPieceRates?.[String(input.home.teamId)] ??
      null,
  });
  const awaySetShare = resolveTeamSetPieceShare({
    processSetPieceShare: input.away.processSetPieceShare,
    optaSetPieceRate:
      input.away.optaSetPieceRate ??
      input.calibration.teamSetPieceRates?.[String(input.away.teamId)] ??
      null,
  });

  const homeDefLeak = opponentSetPieceDefLeak({
    opponentSetPieceShare: input.away.opponentSetPieceShare ?? awaySetShare,
    opponentDefensiveSolidity: input.home.opponentDefensiveSolidity,
  });
  const awayDefLeak = opponentSetPieceDefLeak({
    opponentSetPieceShare: input.home.opponentSetPieceShare ?? homeSetShare,
    opponentDefensiveSolidity: input.away.opponentDefensiveSolidity,
  });

  const homeMult = computeSetPieceMultiplier(homeSetShare, homeDefLeak, input.calibration);
  const awayMult = computeSetPieceMultiplier(awaySetShare, awayDefLeak, input.calibration);
  const softness = input.calibration.xgCapSoftness ?? 0;

  return {
    homeXg: clampInternationalBaselineXg(input.homeXg * homeMult, softness),
    awayXg: clampInternationalBaselineXg(input.awayXg * awayMult, softness),
    homeMult,
    awayMult,
    homeSetShare,
    awaySetShare,
    homeDefLeak,
    awayDefLeak,
  };
}

/** Set-piece xG slice allocated to player props (not added to team λ again). */
export function setPieceXgAllocation(
  teamXg: number,
  teamSetShare: number,
  setPieceMult: number,
  threshold: number
): number {
  const excess = Math.max(0, teamSetShare - threshold);
  if (excess <= 0 || setPieceMult <= 1) return 0;
  const preMultXg = teamXg / setPieceMult;
  return Math.max(0, teamXg - preMultXg);
}

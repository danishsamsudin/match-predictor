import type { TeamStatAverages } from "@/lib/types/prediction";

/** Typical total match xG used to scale corner volume. */
export const CORNER_XG_BASELINE = 2.7;

/** Typical combined shots on target per match for pressing intensity scaling. */
const SOT_MATCH_BASELINE = 8.4;

export interface EstimatedMatchStatsInput {
  homeStats: TeamStatAverages;
  awayStats: TeamStatAverages;
  homeXg: number;
  awayXg: number;
  foulsMultiplier?: number;
  cardsMultiplier?: number;
  /** Optional FIFA ranking gap — tight or lopsided games change card/foul tempo. */
  fifaRatingDelta?: number;
}

export interface EstimatedMatchStats {
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Corners rise with chance volume (xG, shots on target) and wide-play tendency. */
function cornerVolumeScale(
  homeStats: TeamStatAverages,
  awayStats: TeamStatAverages,
  totalXg: number
): number {
  const cornerBase = homeStats.corners + awayStats.corners;
  const sotTotal = homeStats.shotsOnTarget + awayStats.shotsOnTarget;
  const xgPulse = Math.exp(0.028 * (totalXg - CORNER_XG_BASELINE));
  const pressingPulse = 1 + 0.09 * ((sotTotal / SOT_MATCH_BASELINE) - 1);
  const widePlayPulse =
    1 + 0.05 * (cornerBase / Math.max(8, CORNER_XG_BASELINE * 2) - 1);
  return xgPulse * clamp(pressingPulse, 0.88, 1.22) * clamp(widePlayPulse, 0.9, 1.18);
}

/** Physical sides and evenly-matched games tend to produce more stoppages. */
function physicalityIndex(stats: TeamStatAverages): number {
  return stats.fouls + stats.yellowCards * 1.75 + stats.redCards * 6;
}

function foulIntensityScale(
  homeStats: TeamStatAverages,
  awayStats: TeamStatAverages,
  homeXg: number,
  awayXg: number,
  fifaRatingDelta?: number
): number {
  const totalXg = homeXg + awayXg;
  const balance =
    totalXg > 0.4 ? 1 - Math.abs(homeXg - awayXg) / totalXg : 0.5;
  const homePhys = physicalityIndex(homeStats);
  const awayPhys = physicalityIndex(awayStats);
  const avgPhys = (homePhys + awayPhys) / 2;
  const styleClash =
    Math.abs(homePhys - awayPhys) / Math.max(8, avgPhys);
  const stakes =
    fifaRatingDelta != null
      ? 1 + 0.04 * clamp(Math.abs(fifaRatingDelta) / 120, 0, 1.2)
      : 1;

  const tempo =
    1 +
    0.1 * clamp(balance, 0, 1) +
    0.08 * clamp(styleClash, 0, 1) +
    0.05 * (stakes - 1);
  return clamp(tempo, 0.92, 1.28);
}

function cardIntensityScale(
  homeStats: TeamStatAverages,
  awayStats: TeamStatAverages,
  foulScale: number
): number {
  const yellowBase = homeStats.yellowCards + awayStats.yellowCards;
  const foulBase = homeStats.fouls + awayStats.fouls;
  const disciplineDrag =
    foulBase > 0 ? clamp(yellowBase / (foulBase * 0.11), 0.75, 1.35) : 1;
  return clamp(0.92 + 0.14 * (foulScale - 1) * disciplineDrag, 0.88, 1.32);
}

/**
 * Match-level estimates for secondary events. Uses per-team stylistic rates plus
 * final xG and matchup shape so different national-team profiles do not collapse
 * to the same totals.
 */
export function computeEstimatedMatchStats(
  input: EstimatedMatchStatsInput
): EstimatedMatchStats {
  const { homeStats, awayStats, homeXg, awayXg } = input;
  const totalXg = homeXg + awayXg;
  const cornerBase = homeStats.corners + awayStats.corners;
  const foulBase = homeStats.fouls + awayStats.fouls;
  const yellowBase = homeStats.yellowCards + awayStats.yellowCards;
  const redBase = homeStats.redCards + awayStats.redCards;

  const foulIntensity = foulIntensityScale(
    homeStats,
    awayStats,
    homeXg,
    awayXg,
    input.fifaRatingDelta
  );
  const foulMultiplier = (input.foulsMultiplier ?? 1) * foulIntensity;
  const cardIntensity = cardIntensityScale(homeStats, awayStats, foulIntensity);
  const cardMultiplier = (input.cardsMultiplier ?? 1) * cardIntensity;

  const corners =
    cornerBase *
    cornerVolumeScale(homeStats, awayStats, totalXg);
  const fouls = foulBase * foulMultiplier;
  const yellowCards = yellowBase * cardMultiplier;
  const redCards =
    redBase * cardMultiplier * (1 + 0.12 * clamp(foulIntensity - 1, 0, 0.35));

  return {
    corners: Math.round(corners * 10) / 10,
    fouls: Math.round(fouls * 10) / 10,
    yellowCards: Math.round(yellowCards * 10) / 10,
    redCards: Math.round(Math.max(0, redCards) * 10) / 10,
  };
}

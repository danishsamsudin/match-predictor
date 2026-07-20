/**
 * Multi-dimensional interaction matrix (Chapter 11.8) — TypeScript port.
 */

import { normalizedWeights, type XgEngineConfig } from "./config";
import {
  PRIMARY_ORDER,
  type PrimaryKey,
  type RatingVectorInput,
} from "./types";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function asRatingMap(source: RatingVectorInput): Record<PrimaryKey, number> {
  const out = {} as Record<PrimaryKey, number>;
  for (const key of PRIMARY_ORDER) {
    const raw = source[key];
    out[key] = isFiniteNumber(raw) ? raw : Number.NaN;
  }
  return out;
}

export function ratingToZ(
  rating: number,
  opts: { center: number; scale: number }
): number {
  if (!Number.isFinite(rating)) return 0;
  if (opts.scale <= 0) return 0;
  return (rating - opts.center) / opts.scale;
}

export function resolveRating(
  values: Record<PrimaryKey, number>,
  key: PrimaryKey,
  center: number
): number {
  const raw = values[key];
  if (!Number.isFinite(raw)) return center;
  return raw;
}

export type SideInteractions = {
  attack_defence: number;
  finishing_goalkeeper: number;
  build_up_pressing: number;
  possession_pressing: number;
  delta_s: number;
  delta_s_raw: number;
};

export type InteractionMatrixResult = {
  home: SideInteractions;
  away: SideInteractions;
  home_ratings: Record<string, number>;
  away_ratings: Record<string, number>;
};

function sideDeltaS(
  attackZ: number,
  finishingZ: number,
  buildUpZ: number,
  possessionZ: number,
  oppDefenceZ: number,
  oppGkZ: number,
  oppPressingZ: number,
  weights: Record<string, number>,
  cap: number
): SideInteractions {
  const dAd = attackZ - oppDefenceZ;
  const dFr = finishingZ - oppGkZ;
  const dBu = buildUpZ - oppPressingZ;
  const dPo = possessionZ - oppPressingZ;
  const raw =
    weights.attack_defence * dAd +
    weights.finishing_goalkeeper * dFr +
    weights.build_up_pressing * dBu +
    weights.possession_pressing * dPo;
  const capped = Math.max(-cap, Math.min(cap, raw));
  return {
    attack_defence: dAd,
    finishing_goalkeeper: dFr,
    build_up_pressing: dBu,
    possession_pressing: dPo,
    delta_s: capped,
    delta_s_raw: raw,
  };
}

export function computeInteractionMatrix(
  home: RatingVectorInput,
  away: RatingVectorInput,
  config: XgEngineConfig
): InteractionMatrixResult {
  const center = config.ratingCenter;
  const scale = config.ratingScale;
  const weights = normalizedWeights(config);
  const cap = config.deltaSCap;

  const homeMap = asRatingMap(home);
  const awayMap = asRatingMap(away);

  const homeResolved = Object.fromEntries(
    PRIMARY_ORDER.map((k) => [k, resolveRating(homeMap, k, center)])
  ) as Record<PrimaryKey, number>;
  const awayResolved = Object.fromEntries(
    PRIMARY_ORDER.map((k) => [k, resolveRating(awayMap, k, center)])
  ) as Record<PrimaryKey, number>;

  const zH = Object.fromEntries(
    PRIMARY_ORDER.map((k) => [k, ratingToZ(homeResolved[k], { center, scale })])
  ) as Record<PrimaryKey, number>;
  const zA = Object.fromEntries(
    PRIMARY_ORDER.map((k) => [k, ratingToZ(awayResolved[k], { center, scale })])
  ) as Record<PrimaryKey, number>;

  const homeSide = sideDeltaS(
    zH.attack,
    zH.finishing,
    zH.build_up,
    zH.possession,
    zA.defence,
    zA.goalkeeper,
    zA.pressing,
    weights,
    cap
  );
  const awaySide = sideDeltaS(
    zA.attack,
    zA.finishing,
    zA.build_up,
    zA.possession,
    zH.defence,
    zH.goalkeeper,
    zH.pressing,
    weights,
    cap
  );

  return {
    home: homeSide,
    away: awaySide,
    home_ratings: { ...homeResolved },
    away_ratings: { ...awayResolved },
  };
}

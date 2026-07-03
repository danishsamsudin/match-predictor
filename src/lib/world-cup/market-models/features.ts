import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { MarketStackFeatures } from "@/lib/world-cup/market-models/types";

function snapNum(snapshot: Record<string, unknown>, key: string, fallback = 0): number {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function optaNum(
  snapshot: Record<string, unknown>,
  key: string,
  fallback = 0
): number {
  const opta = snapshot.opta_features;
  if (!opta || typeof opta !== "object") return fallback;
  const v = (opta as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function buildMarketStackFeatures(input: {
  pred: HubPredictionRow;
  isKnockout?: boolean;
  homeScoringRate?: number;
  awayScoringRate?: number;
  homeCleanSheetRate?: number;
  awayCleanSheetRate?: number;
}): MarketStackFeatures {
  const snap = input.pred.snapshot;
  const homeXg = snapNum(snap, "home_xg", snapNum(snap, "lambda", 1.25));
  const awayXg = snapNum(snap, "away_xg", snapNum(snap, "mu", 1.25));

  return {
    totalXg: homeXg + awayXg,
    homeXg,
    awayXg,
    homeAttack: snapNum(snap, "home_attack", 1),
    awayAttack: snapNum(snap, "away_attack", 1),
    homeDefense: snapNum(snap, "home_defense", 1),
    awayDefense: snapNum(snap, "away_defense", 1),
    lowBlockIndex:
      (optaNum(snap, "low_block_index_home", 0) +
        optaNum(snap, "low_block_index_away", 0)) /
      2,
    rho: snapNum(snap, "rho", 0),
    isKnockout: input.isKnockout ?? false,
    homeScoringRate: input.homeScoringRate ?? snapNum(snap, "home_attack", 1) * 0.85,
    awayScoringRate: input.awayScoringRate ?? snapNum(snap, "away_attack", 1) * 0.85,
    homeCleanSheetRate: input.homeCleanSheetRate ?? 1 - snapNum(snap, "home_attack", 1) * 0.3,
    awayCleanSheetRate: input.awayCleanSheetRate ?? 1 - snapNum(snap, "away_attack", 1) * 0.3,
    finishingRegressionDiff: optaNum(snap, "finishing_regression_diff", 0),
    physicalityIndex: optaNum(snap, "physicality_index", 1),
  };
}

export function resolveRefereeStrictness(referee: string | null | undefined): number {
  if (!referee) return 1;
  const name = referee.toLowerCase();
  const strictKeywords = ["ortiz", "valverde", "schafer", "geiger", "montero"];
  const lenientKeywords = ["oliver", "turpin", "marciniak", "szymon"];
  if (strictKeywords.some((k) => name.includes(k))) return 1.35;
  if (lenientKeywords.some((k) => name.includes(k))) return 0.75;
  return 1;
}

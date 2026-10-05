import { describe, expect, it } from "vitest";
import {
  applyHoldoutGuard,
  assignBinTier,
  binForProb,
  blendFloor,
  buildConfidenceCurves,
  calibrateConfidenceLayer,
  lookupConfidence,
  splitTrainHoldout,
  valueRowIdToMarketKey,
  wilsonLower,
  type ConfidenceEvalRow,
  type ConfidenceLayerConfig,
} from "@/lib/value-opportunities/confidence-layer";

function rows(n: number, pred: number, hitRate: number, key = "btts:yes"): ConfidenceEvalRow[] {
  const hits = Math.round(n * hitRate);
  return Array.from({ length: n }, (_, i) => ({
    marketKey: key,
    predictedProb: pred,
    hit: i < hits,
    matchDate: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
}

describe("wilsonLower", () => {
  it("is below the raw hit rate for modest samples", () => {
    const low = wilsonLower(14, 20);
    expect(low).toBeLessThan(0.7);
    expect(low).toBeGreaterThan(0.45);
  });

  it("returns 0 for empty samples", () => {
    expect(wilsonLower(0, 0)).toBe(0);
  });
});

describe("binForProb", () => {
  it("puts 72% in 70-80", () => {
    expect(binForProb(0.72).label).toBe("70-80");
  });

  it("collapses low probs into 0-40", () => {
    expect(binForProb(0.12).label).toBe("0-40");
    expect(binForProb(0.39).label).toBe("0-40");
  });
});

describe("assignBinTier", () => {
  it("promotes Strong when Wilson, n, and gap all pass", () => {
    const n = 40;
    const hits = 32;
    const hitRate = hits / n;
    const wilsonLow = wilsonLower(hits, n);
    expect(
      assignBinTier({ n, hitRate, wilsonLow, gap: 0.78 - hitRate })
    ).toBe("strong");
  });

  it("still marks overconfident bins Weak when sample is large (Kelly uses empirical rate)", () => {
    expect(
      assignBinTier({ n: 40, hitRate: 0.4, wilsonLow: wilsonLower(16, 40), gap: 0.35 })
    ).toBe("weak");
  });

  it("promotes Weak when the bin has enough samples even if hit rate is only mid", () => {
    expect(
      assignBinTier({
        n: 20,
        hitRate: 0.45,
        wilsonLow: wilsonLower(9, 20),
        gap: 0.2,
      })
    ).toBe("weak");
  });
});

describe("buildConfidenceCurves / lookup", () => {
  it("looks up the historical hit rate for a Strong BTTS band", () => {
    const sample = rows(40, 0.74, 0.8);
    const markets = buildConfidenceCurves(sample);
    const layer: ConfidenceLayerConfig = {
      version: "test",
      computedAt: "",
      trainN: sample.length,
      holdoutN: 0,
      markets,
    };
    const found = lookupConfidence("btts:yes", 0.73, layer);
    expect(found.n).toBe(40);
    expect(found.tier).toBe("strong");
    expect(found.historicalHitRate).toBeCloseTo(0.8, 5);
  });

  it("returns None when the market has no history", () => {
    const found = lookupConfidence("btts:yes", 0.8, {
      version: "test",
      computedAt: "",
      trainN: 0,
      holdoutN: 0,
      markets: {},
    });
    expect(found.tier).toBe("none");
    expect(found.n).toBe(0);
  });
});

describe("applyHoldoutGuard", () => {
  it("demotes Strong when recent holdout Wilson is weak", () => {
    const trainRows = rows(40, 0.74, 0.85);
    const train = buildConfidenceCurves(trainRows)["btts:yes"]!;
    expect(train.strongFloor).not.toBeNull();
    const holdout = rows(12, 0.74, 0.25);
    const guarded = applyHoldoutGuard(train, holdout);
    expect(guarded.bins.find((b) => b.label === "70-80")?.tier).not.toBe("strong");
  });
});

describe("blendFloor / splitTrainHoldout", () => {
  it("moves floors 25% toward the new value", () => {
    expect(blendFloor(0.7, 0.8)).toBeCloseTo(0.725, 5);
    expect(blendFloor(null, 0.7)).toBe(0.7);
  });

  it("keeps older rows in train", () => {
    const sample = rows(10, 0.6, 0.6);
    const { train, holdout } = splitTrainHoldout(sample, 0.3);
    expect(train.length + holdout.length).toBe(10);
    expect(holdout.length).toBeGreaterThan(0);
  });
});

describe("calibrateConfidenceLayer", () => {
  it("stores train/holdout counts and blended Strong floors", () => {
    const sample = rows(50, 0.74, 0.82);
    const layer = calibrateConfidenceLayer({ rows: sample, now: new Date("2026-10-05T00:00:00Z") });
    expect(layer.trainN + layer.holdoutN).toBe(50);
    expect(layer.markets["btts:yes"]?.n).toBeGreaterThan(0);
  });
});

describe("valueRowIdToMarketKey", () => {
  it("maps Value Opportunities ids", () => {
    expect(valueRowIdToMarketKey("1x2-home")).toBe("win_probability:home");
    expect(valueRowIdToMarketKey("btts-no")).toBe("btts:no");
    expect(valueRowIdToMarketKey("ou-over-2.5")).toBe("goals_over_under:over_2.5");
    expect(valueRowIdToMarketKey("dc-1x")).toBe("double_chance:1x");
    expect(valueRowIdToMarketKey("range-match-2-3")).toBe("goal_range_match:2-3");
    expect(valueRowIdToMarketKey("eh--1-h")).toBe("european_handicap:-1_home");
    expect(valueRowIdToMarketKey("eh-1-a")).toBe("european_handicap:+1_away");
    expect(valueRowIdToMarketKey("tt-home-over-1.5")).toBe("team_total:home_over_1.5");
    expect(valueRowIdToMarketKey("ah-home--0.5")).toBe("asian_handicap:home_-0.5");
    expect(valueRowIdToMarketKey("ah-away-0.5")).toBe("asian_handicap:away_0.5");
    expect(valueRowIdToMarketKey("shots-over-22.5")).toBe("shots_ou:over_22.5");
    expect(valueRowIdToMarketKey("shots-under-20.5")).toBe("shots_ou:under_20.5");
    expect(valueRowIdToMarketKey("sot-over-8.5")).toBe("sot_over:8.5");
  });
});

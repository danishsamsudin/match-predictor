import { describe, expect, it } from "vitest";
import {
  COMPOSITE_MIN_APPEARANCES,
  COMPOSITE_MIN_MINUTES,
  computePlayerPerformanceScore,
  computeReliabilityFactor,
  scoutlystPpmToScore,
  sofascoreRatingToScore,
  statsLookPer90,
  toPer90,
} from "./compute-player-performance-score";

const ZABARNYI_STATS: Record<string, number> = {
  "Shooting — Sh": 0.18,
  "Summary — Performance — Gls": 0.03,
  "Summary — Playing time — Min": 2583,
  "Summary — Playing time — MP": 34,
  "Passing — Total — Cmp": 66.5,
  "Defense — Tackles — TklW": 0.03,
  "Defense — Miscellaneous — Int": 0.12,
};

const STAR_FORWARD_STATS: Record<string, number> = {
  PPM: 2.6,
  "Summary — Playing time — Min": 2800,
  "Summary — Playing time — MP": 32,
  "Summary — Performance — Gls": 0.55,
  xG: 0.48,
  SoT: 1.8,
};

const LOW_MINUTE_FORWARD: Record<string, number> = {
  PPM: 2.9,
  "Summary — Playing time — Min": 120,
  "Summary — Playing time — MP": 2,
  "Summary — Performance — Gls": 2,
  xG: 1.5,
};

describe("scoutlystPpmToScore", () => {
  it("maps Scoutlyst PPM 0–3 scale to 0–100", () => {
    expect(scoutlystPpmToScore(0)).toBe(0);
    expect(scoutlystPpmToScore(3)).toBe(100);
    expect(scoutlystPpmToScore(2.38)).toBe(79);
    expect(scoutlystPpmToScore(2.74)).toBe(91);
  });
});

describe("sofascoreRatingToScore", () => {
  it("maps typical match ratings into 0–100", () => {
    expect(sofascoreRatingToScore(6.5)).toBeGreaterThan(40);
    expect(sofascoreRatingToScore(7.5)).toBeGreaterThan(sofascoreRatingToScore(6.5));
    expect(sofascoreRatingToScore(8.5)).toBe(100);
  });
});

describe("statsLookPer90", () => {
  it("detects per-90 export from minutes and low goal totals", () => {
    expect(statsLookPer90(ZABARNYI_STATS)).toBe(true);
  });
});

describe("toPer90", () => {
  it("does not double-normalize when already per-90", () => {
    expect(toPer90(0.03, 2583, true)).toBe(0.03);
  });

  it("converts season totals to per-90", () => {
    expect(toPer90(10, 900, false)).toBeCloseTo(1, 5);
  });
});

describe("computeReliabilityFactor", () => {
  it("increases with more minutes", () => {
    const low = computeReliabilityFactor(400);
    const high = computeReliabilityFactor(2800);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });
});

describe("computePlayerPerformanceScore", () => {
  it("does not treat Scoutlyst PPM as SofaScore (×10 bug)", () => {
    const score = computePlayerPerformanceScore({
      scoutlystRating: 2.38,
      matchAvgRating: null,
      stats: {},
    });
    expect(score).toBe(79);
    expect(score).toBeGreaterThan(50);
  });

  it("uses the better of Scoutlyst and match ratings", () => {
    const score = computePlayerPerformanceScore({
      scoutlystRating: 2,
      matchAvgRating: 7.8,
      stats: {},
    });
    expect(score).toBeGreaterThanOrEqual(scoutlystPpmToScore(2));
    expect(score).toBeGreaterThanOrEqual(sofascoreRatingToScore(7.8));
  });

  it("returns legacy rating when composite is ineligible", () => {
    expect(
      computePlayerPerformanceScore({
        scoutlystRating: 2.5,
        matchAvgRating: null,
        stats: { "Summary — Playing time — Min": 100, "Summary — Playing time — MP": 1 },
      })
    ).toBe(scoutlystPpmToScore(2.5));
  });

  it("returns null when no rating signals exist", () => {
    expect(
      computePlayerPerformanceScore({
        scoutlystRating: null,
        matchAvgRating: null,
        stats: { "Attacking — xG": 0.42, "Summary — Min": 2100 },
        position: "CB",
      })
    ).toBeNull();
  });

  it("scores defender from tackles and interceptions without penalizing low goals", () => {
    const defender = computePlayerPerformanceScore({
      scoutlystRating: 2.2,
      matchAvgRating: null,
      stats: {
        ...ZABARNYI_STATS,
        "Summary — Performance — Gls": 0.01,
      },
      position: "CB",
    });
    const fauxStriker = computePlayerPerformanceScore({
      scoutlystRating: 2.2,
      matchAvgRating: null,
      stats: {
        ...ZABARNYI_STATS,
        "Summary — Performance — Gls": 0.5,
        "Defense — Miscellaneous — Int": 0.01,
        "Defense — Tackles — TklW": 0.01,
      },
      position: "CB",
    });
    expect(defender).not.toBeNull();
    expect(defender!).toBeGreaterThan(fauxStriker ?? 0);
  });

  it("keeps forward rank high on xG when goals are low", () => {
    const highXg = computePlayerPerformanceScore({
      scoutlystRating: 2.4,
      matchAvgRating: null,
      stats: {
        ...STAR_FORWARD_STATS,
        "Summary — Performance — Gls": 0.1,
        xG: 0.7,
      },
      position: "ST",
    });
    const lowXg = computePlayerPerformanceScore({
      scoutlystRating: 2.4,
      matchAvgRating: null,
      stats: {
        ...STAR_FORWARD_STATS,
        "Summary — Performance — Gls": 0.1,
        xG: 0.1,
      },
      position: "ST",
    });
    expect(highXg).not.toBeNull();
    expect(highXg!).toBeGreaterThan(lowXg ?? 0);
  });

  it("does not double-normalize Zabarnyi-style per-90 stats", () => {
    const score = computePlayerPerformanceScore({
      scoutlystRating: 2.3,
      matchAvgRating: null,
      stats: ZABARNYI_STATS,
      position: "CB",
    });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it("rewards more minutes via reliability for eligible composite", () => {
    const base = {
      PPM: 2.5,
      "Summary — Playing time — MP": 20,
      "Summary — Performance — Gls": 0.4,
      xG: 0.35,
      SoT: 1.2,
    };
    const fewerMins = computePlayerPerformanceScore({
      scoutlystRating: 2.5,
      matchAvgRating: null,
      stats: { ...base, "Summary — Playing time — Min": COMPOSITE_MIN_MINUTES },
      position: "ST",
    });
    const moreMins = computePlayerPerformanceScore({
      scoutlystRating: 2.5,
      matchAvgRating: null,
      stats: { ...base, "Summary — Playing time — Min": 3000 },
      position: "ST",
    });
    expect(moreMins).not.toBeNull();
    expect(fewerMins).not.toBeNull();
    expect(moreMins!).toBeGreaterThan(fewerMins!);
  });

  it("blocks composite for lucky low-minute outliers but keeps PPM", () => {
    const score = computePlayerPerformanceScore({
      scoutlystRating: 2.9,
      matchAvgRating: null,
      stats: LOW_MINUTE_FORWARD,
      position: "ST",
    });
    expect(score).toBe(scoutlystPpmToScore(2.9));
    expect(COMPOSITE_MIN_MINUTES).toBe(270);
    expect(COMPOSITE_MIN_APPEARANCES).toBe(3);
  });
});

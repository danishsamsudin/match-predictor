import { describe, expect, it } from "vitest";
import {
  buildReliabilityBaseline,
  passesReliabilityGuardrail,
  splitHoldoutByDate,
} from "./reliability-baseline";

describe("reliability-baseline", () => {
  it("aggregates calibration gap and brier", () => {
    const report = buildReliabilityBaseline([
      {
        league_sm_id: 8,
        market_id: "btts",
        market_key: "",
        predicted: { prob: 0.7 },
        actual: { hit: false },
        loss_value: 0.49,
        match_date: "2026-01-01",
      },
      {
        league_sm_id: 8,
        market_id: "btts",
        market_key: "",
        predicted: { prob: 0.7 },
        actual: { hit: true },
        loss_value: 0.09,
        match_date: "2026-01-08",
      },
    ]);
    expect(report.overall.n).toBe(2);
    expect(report.overall.hitRate).toBe(0.5);
    expect(report.overall.avgPred).toBeCloseTo(0.7);
    expect(report.overall.calibrationGap).toBeCloseTo(0.2);
    expect(report.leagues[0].byFamily.btts.n).toBe(2);
  });

  it("splits holdout by date", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      league_sm_id: 8,
      market_id: "btts",
      market_key: "",
      predicted: { prob: 0.5 },
      actual: { hit: i % 2 === 0 },
      loss_value: 0.25,
      match_date: `2026-0${(i % 9) + 1}-01`,
    }));
    const { train, holdout } = splitHoldoutByDate(rows, 0.25);
    expect(train.length + holdout.length).toBe(8);
    expect(holdout.length).toBeGreaterThan(0);
  });

  it("passes guardrail when candidate matches baseline", () => {
    const base = buildReliabilityBaseline([
      {
        league_sm_id: 8,
        market_id: "goals_over_under",
        market_key: "2.5",
        predicted: { prob: 0.5 },
        actual: { hit: true },
        loss_value: 0.25,
        match_date: "2026-01-01",
      },
    ]);
    expect(
      passesReliabilityGuardrail({ baseline: base, candidate: base })
    ).toBe(true);
  });
});

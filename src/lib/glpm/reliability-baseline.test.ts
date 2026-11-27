import { describe, expect, it } from "vitest";
import {
  buildReliabilityBaseline,
  passesReliabilityGuardrail,
  splitHoldoutByDate,
  TOP_PICK_MARKET_KEY,
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

  it("computes 1X2 and DC top-pick hit rates", () => {
    const report = buildReliabilityBaseline([
      {
        league_sm_id: 8,
        market_id: "win_probability",
        market_key: "",
        predicted: { home: 0.55, draw: 0.25, away: 0.2 },
        actual: { outcome: "home" },
        loss_value: 0.2,
        match_date: "2026-01-01",
        match_sm_id: 1,
      },
      {
        league_sm_id: 8,
        market_id: "win_probability",
        market_key: "",
        predicted: { home: 0.4, draw: 0.35, away: 0.25 },
        actual: { outcome: "away" },
        loss_value: 0.36,
        match_date: "2026-01-08",
        match_sm_id: 2,
      },
      {
        league_sm_id: 8,
        market_id: "double_chance",
        market_key: "1x",
        predicted: { prob: 0.72 },
        actual: { hit: true },
        loss_value: 0.08,
        match_date: "2026-01-01",
        match_sm_id: 1,
      },
      {
        league_sm_id: 8,
        market_id: "double_chance",
        market_key: "12",
        predicted: { prob: 0.65 },
        actual: { hit: false },
        loss_value: 0.42,
        match_date: "2026-01-01",
        match_sm_id: 1,
      },
      {
        league_sm_id: 8,
        market_id: "double_chance",
        market_key: "x2",
        predicted: { prob: 0.48 },
        actual: { hit: false },
        loss_value: 0.23,
        match_date: "2026-01-01",
        match_sm_id: 1,
      },
      {
        league_sm_id: 8,
        market_id: "double_chance",
        market_key: "1x",
        predicted: { prob: 0.5 },
        actual: { hit: false },
        loss_value: 0.25,
        match_date: "2026-01-08",
        match_sm_id: 2,
      },
      {
        league_sm_id: 8,
        market_id: "double_chance",
        market_key: "12",
        predicted: { prob: 0.7 },
        actual: { hit: true },
        loss_value: 0.09,
        match_date: "2026-01-08",
        match_sm_id: 2,
      },
      {
        league_sm_id: 8,
        market_id: "double_chance",
        market_key: "x2",
        predicted: { prob: 0.55 },
        actual: { hit: true },
        loss_value: 0.2,
        match_date: "2026-01-08",
        match_sm_id: 2,
      },
    ]);

    const x12 = report.leagues[0].markets.find(
      (m) => m.marketId === "win_probability" && m.marketKey === TOP_PICK_MARKET_KEY
    );
    expect(x12?.n).toBe(2);
    // Match 1 home pick hits; match 2 home pick misses → 50%
    expect(x12?.hitRate).toBe(0.5);

    const dc = report.leagues[0].markets.find(
      (m) => m.marketId === "double_chance" && m.marketKey === TOP_PICK_MARKET_KEY
    );
    expect(dc?.n).toBe(2);
    // Match 1 picks 1x (hit); match 2 picks 12 (hit) → 100%
    expect(dc?.hitRate).toBe(1);
    expect(report.leagues[0].byFamily["1x2"]?.n).toBeGreaterThan(0);
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

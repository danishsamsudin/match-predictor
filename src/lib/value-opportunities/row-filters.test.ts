import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALUE_FILTERS,
  rowMatchesFilters,
  type ValueOpportunityFiltersState,
} from "./row-filters";

const baseRow = {
  modelProb: 0.5,
  fairOdds: 2,
  bookOdds: 2.2,
  modelEdgePct: 10,
  histEdgePct: 6,
  confidence: { tier: "strong" as const, n: 40 },
  kelly: { fraction: 0.04 },
};

describe("rowMatchesFilters", () => {
  it("passes with default filters", () => {
    expect(rowMatchesFilters(baseRow, DEFAULT_VALUE_FILTERS)).toBe(true);
  });

  it("filters by confidence tier (OR)", () => {
    const filters: ValueOpportunityFiltersState = {
      ...DEFAULT_VALUE_FILTERS,
      tiers: ["moderate", "weak"],
    };
    expect(rowMatchesFilters(baseRow, filters)).toBe(false);
    expect(
      rowMatchesFilters(
        { ...baseRow, confidence: { tier: "moderate", n: 10 } },
        filters
      )
    ).toBe(true);
  });

  it("filters by hist edge preset", () => {
    const filters: ValueOpportunityFiltersState = {
      ...DEFAULT_VALUE_FILTERS,
      histEdge: "gte8",
    };
    expect(rowMatchesFilters(baseRow, filters)).toBe(false);
    expect(rowMatchesFilters({ ...baseRow, histEdgePct: 9 }, filters)).toBe(
      true
    );
  });

  it("filters by model odds range", () => {
    const filters: ValueOpportunityFiltersState = {
      ...DEFAULT_VALUE_FILTERS,
      modelOddsMin: "2.1",
      modelOddsMax: "3",
    };
    // modelProb 0.5 → odds 2.0
    expect(rowMatchesFilters(baseRow, filters)).toBe(false);
    expect(rowMatchesFilters({ ...baseRow, modelProb: 0.4 }, filters)).toBe(
      true
    );
  });

  it("requires book odds when toggled", () => {
    const filters: ValueOpportunityFiltersState = {
      ...DEFAULT_VALUE_FILTERS,
      requireBookOdds: true,
    };
    expect(rowMatchesFilters({ ...baseRow, bookOdds: null }, filters)).toBe(
      false
    );
  });

  it("requires at least one selected signal", () => {
    const filters: ValueOpportunityFiltersState = {
      ...DEFAULT_VALUE_FILTERS,
      signals: ["kelly_positive", "has_history"],
    };
    expect(rowMatchesFilters(baseRow, filters)).toBe(true);
    expect(
      rowMatchesFilters(
        {
          ...baseRow,
          confidence: { tier: "none", n: 0 },
          kelly: { fraction: 0 },
        },
        filters
      )
    ).toBe(false);
  });
});

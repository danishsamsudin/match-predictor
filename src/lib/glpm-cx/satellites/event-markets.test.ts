import { describe, expect, it } from "vitest";
import {
  avgOrHeuristic,
  eventMlEligible,
  heuristicCorners,
  heuristicReds,
  heuristicYellows,
  shrinkRate,
  type TeamStatSample,
} from "@/lib/glpm-cx/satellites/event-markets";

const empty: TeamStatSample = {
  corners: null,
  yellow_cards: null,
  red_cards: null,
  fouls: null,
  shots: null,
  possession_pct: null,
  pressures: null,
  pressing_duels: null,
  tackles: null,
  interceptions: null,
};

describe("event-markets priors", () => {
  it("empty sample is the 4.5 / 2.0 / 0.08 prior", () => {
    expect(heuristicCorners(empty)).toBe(4.5);
    expect(heuristicYellows(empty)).toBe(2.0);
    expect(heuristicReds(2.0)).toBeCloseTo(0.08, 8);
  });

  it("corners move with shots and possession", () => {
    expect(
      heuristicCorners({ ...empty, shots: 16, possession_pct: 60 })
    ).toBeGreaterThan(heuristicCorners(empty));
  });
});

describe("eventMlEligible", () => {
  it("stays off until the current season both is selected and has 20 labeled matches", () => {
    expect(
      eventMlEligible({ statsSeasonIsCurrent: false, labeledMatchCount: 380 })
    ).toBe(false);
    expect(
      eventMlEligible({ statsSeasonIsCurrent: true, labeledMatchCount: 12 })
    ).toBe(false);
    expect(
      eventMlEligible({ statsSeasonIsCurrent: true, labeledMatchCount: 20 })
    ).toBe(true);
  });
});

describe("shrinkRate", () => {
  it("is the league mean at n=0 and the team mean as n grows", () => {
    expect(shrinkRate(7, 5, 0, 20)).toBe(5);
    expect(shrinkRate(7, 5, 20, 20)).toBe(6);
    expect(shrinkRate(7, 5, 80, 20)).toBeCloseTo(6.6, 5);
  });
});

describe("avgOrHeuristic", () => {
  it("uses the empty heuristic when no rows are loaded", () => {
    expect(avgOrHeuristic([], "corners", heuristicCorners)).toBe(4.5);
  });

  it("uses observed corners when coverage is dense", () => {
    const rows: TeamStatSample[] = Array.from({ length: 10 }, () => ({
      ...empty,
      corners: 8,
      shots: 14,
    }));
    expect(avgOrHeuristic(rows, "corners", heuristicCorners)).toBe(8);
  });
});

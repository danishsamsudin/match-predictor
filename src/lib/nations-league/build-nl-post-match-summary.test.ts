import { describe, expect, it } from "vitest";
import { summarizeLocked1x2Window } from "@/lib/nations-league/build-nl-post-match-summary";

describe("summarizeLocked1x2Window", () => {
  it("reports hits, brier, and draw calibration", () => {
    const stats = summarizeLocked1x2Window([
      { home: 0.55, draw: 0.25, away: 0.2, actualHome: 2, actualAway: 1, brier1x2: 0.3 },
      { home: 0.6, draw: 0.22, away: 0.18, actualHome: 1, actualAway: 1, brier1x2: 0.9 },
      { home: 0.2, draw: 0.25, away: 0.55, actualHome: 0, actualAway: 2, brier1x2: 0.35 },
    ]);
    expect(stats.n).toBe(3);
    expect(stats.hits).toBe(2);
    expect(stats.avgBrier).toBeCloseTo((0.3 + 0.9 + 0.35) / 3, 5);
    expect(stats.actualDrawRate).toBeCloseTo(1 / 3, 5);
    expect(stats.avgPredDraw).toBeCloseTo((0.25 + 0.22 + 0.25) / 3, 5);
  });

  it("accepts percent-scale probabilities", () => {
    const stats = summarizeLocked1x2Window([
      { home: 55, draw: 25, away: 20, actualHome: 1, actualAway: 0, brier1x2: 0.4 },
    ]);
    expect(stats.hits).toBe(1);
    expect(stats.avgPredDraw).toBeCloseTo(0.25, 5);
  });

  it("returns zeros for an empty window", () => {
    expect(summarizeLocked1x2Window([])).toEqual({
      n: 0,
      hits: 0,
      avgBrier: 0,
      avgPredDraw: 0,
      actualDrawRate: 0,
    });
  });
});

import { describe, expect, it } from "vitest";
import { lineupRecencyWeight } from "@/lib/data/lineup-appearance-weights";

describe("lineup appearance decay integration", () => {
  it("weights newest match more than oldest in aggregation", () => {
    const newest = lineupRecencyWeight(0);
    const oldest = lineupRecencyWeight(11);
    expect(newest).toBeGreaterThan(oldest);
    expect(newest / oldest).toBeCloseTo(Math.pow(1 / 0.9, 11), 3);
  });
});

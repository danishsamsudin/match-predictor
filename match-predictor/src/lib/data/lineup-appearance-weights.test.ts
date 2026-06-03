import { describe, expect, it } from "vitest";
import {
  LINEUP_RECENCY_DECAY,
  lineupRecencyWeight,
} from "./lineup-appearance-weights";

describe("lineupRecencyWeight", () => {
  it("decays older matches", () => {
    expect(lineupRecencyWeight(0)).toBe(1);
    expect(lineupRecencyWeight(1)).toBeCloseTo(LINEUP_RECENCY_DECAY, 5);
    expect(lineupRecencyWeight(0)).toBeGreaterThan(lineupRecencyWeight(5));
  });
});

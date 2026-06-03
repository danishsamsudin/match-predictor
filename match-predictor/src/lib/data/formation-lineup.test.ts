import { describe, expect, it } from "vitest";
import {
  computeLineupRankScore,
  parseFormationToTargets,
  pickPreferredFormation,
  pickStartersByFormation,
  LINEUP_APPEARANCE_WEIGHT,
  LINEUP_QUALITY_WEIGHT,
} from "@/lib/data/formation-lineup";

describe("parseFormationToTargets", () => {
  it("parses three-part formations", () => {
    expect(parseFormationToTargets("4-3-3")).toEqual({ G: 1, D: 4, M: 3, F: 3 });
    expect(parseFormationToTargets("3-5-2")).toEqual({ G: 1, D: 3, M: 5, F: 2 });
  });

  it("parses four-part formations by merging midfield lines", () => {
    expect(parseFormationToTargets("4-2-3-1")).toEqual({ G: 1, D: 4, M: 5, F: 1 });
    expect(parseFormationToTargets("5-4-1")).toEqual({ G: 1, D: 5, M: 4, F: 1 });
  });
});

describe("pickPreferredFormation", () => {
  it("returns the mode", () => {
    expect(pickPreferredFormation(["4-3-3", "4-2-3-1", "4-3-3", "4-3-3"])).toBe("4-3-3");
  });
});

describe("computeLineupRankScore", () => {
  it("blends appearance and quality", () => {
    const score = computeLineupRankScore(5, 10, 90);
    expect(score).toBeCloseTo(
      LINEUP_APPEARANCE_WEIGHT * 0.5 + LINEUP_QUALITY_WEIGHT * 0.9,
      5
    );
  });
});

describe("pickStartersByFormation", () => {
  const squad = [
    { id: 1, starts: 10, subAppearances: 0, dominantPosition: () => "G" as const },
    { id: 2, starts: 9, subAppearances: 0, dominantPosition: () => "G" as const },
    { id: 3, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const },
    { id: 4, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const },
    { id: 5, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const },
    { id: 6, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const },
    { id: 7, starts: 10, subAppearances: 0, dominantPosition: () => "M" as const },
    { id: 8, starts: 10, subAppearances: 0, dominantPosition: () => "M" as const },
    { id: 9, starts: 10, subAppearances: 0, dominantPosition: () => "M" as const },
    { id: 10, starts: 10, subAppearances: 0, dominantPosition: () => "F" as const },
    { id: 11, starts: 10, subAppearances: 0, dominantPosition: () => "F" as const },
    { id: 12, starts: 10, subAppearances: 0, dominantPosition: () => "F" as const },
  ];

  it("picks only one goalkeeper", () => {
    const xi = pickStartersByFormation(squad, "4-3-3");
    expect(xi.filter((p) => p.dominantPosition() === "G")).toHaveLength(1);
    expect(xi).toHaveLength(11);
  });

  it("includes forwards for 4-3-3", () => {
    const xi = pickStartersByFormation(squad, "4-3-3");
    expect(xi.filter((p) => p.dominantPosition() === "F")).toHaveLength(3);
  });

  it("prefers higher quality forward over higher appearance count in same slot", () => {
    const forwards = [
      { id: 100, starts: 7, subAppearances: 0, dominantPosition: () => "F" as const },
      { id: 101, starts: 5, subAppearances: 0, dominantPosition: () => "F" as const },
      { id: 102, starts: 4, subAppearances: 0, dominantPosition: () => "F" as const },
      { id: 1, starts: 10, subAppearances: 0, dominantPosition: () => "G" as const },
      ...[3, 4, 5, 6].map((id) => ({
        id,
        starts: 10,
        subAppearances: 0,
        dominantPosition: () => "D" as const,
      })),
      ...[7, 8, 9].map((id) => ({
        id,
        starts: 10,
        subAppearances: 0,
        dominantPosition: () => "M" as const,
      })),
    ];
    const qualityById = new Map<number, number>([
      [100, 55],
      [101, 95],
      [102, 50],
    ]);
    const xi = pickStartersByFormation(forwards, "4-3-3", { qualityById });
    const fwdIds = xi.filter((p) => p.dominantPosition() === "F").map((p) => p.id);
    expect(fwdIds).toContain(101);
    expect(fwdIds).not.toContain(102);
  });
});

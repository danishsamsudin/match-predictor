import { describe, expect, it } from "vitest";
import {
  computeLineupRankScore,
  mapFieldPositionToSubRole,
  parseFormationToTargets,
  parseGranularFormation,
  pickPreferredFormation,
  pickStartersByFormation,
  LINEUP_APPEARANCE_WEIGHT,
  LINEUP_QUALITY_WEIGHT,
  LINEUP_UNAVAILABLE_QUALITY,
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

describe("parseGranularFormation", () => {
  it("maps common templates", () => {
    expect(parseGranularFormation("4-3-3")).toEqual({
      G: 1,
      CB: 2,
      FB: 2,
      DM: 1,
      AM: 2,
      W: 2,
      ST: 1,
    });
    expect(parseGranularFormation("4-2-3-1").DM).toBe(2);
    expect(parseGranularFormation("3-5-2").W).toBe(0);
  });
});

describe("mapFieldPositionToSubRole", () => {
  it("splits centre-backs and fullbacks", () => {
    expect(mapFieldPositionToSubRole("RCB")).toBe("CB");
    expect(mapFieldPositionToSubRole("LB")).toBe("FB");
    expect(mapFieldPositionToSubRole("CDM")).toBe("DM");
    expect(mapFieldPositionToSubRole("CM")).toBe("AM");
    expect(mapFieldPositionToSubRole("LW")).toBe("W");
  });
});

describe("pickPreferredFormation", () => {
  it("returns the mode", () => {
    expect(pickPreferredFormation(["4-3-3", "4-2-3-1", "4-3-3", "4-3-3"])).toBe("4-3-3");
  });
});

describe("computeLineupRankScore", () => {
  it("blends appearance and quality for clubs", () => {
    const score = computeLineupRankScore({ starts: 5, maxStarts: 10, qualityScore: 90 });
    expect(score).toBeCloseTo(
      LINEUP_APPEARANCE_WEIGHT * 0.5 + LINEUP_QUALITY_WEIGHT * 0.9,
      5
    );
  });

  it("blends international caps with club workload for national teams", () => {
    const sparseCaps = computeLineupRankScore({
      starts: 2,
      maxStarts: 10,
      qualityScore: 70,
      entityType: "national",
      clubMinutes: 200,
      clubRating: 60,
    });
    const clubStar = computeLineupRankScore({
      starts: 2,
      maxStarts: 10,
      qualityScore: 70,
      entityType: "national",
      clubMinutes: 2500,
      clubRating: 88,
    });
    expect(clubStar).toBeGreaterThan(sparseCaps);
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

  it("balances centre-backs and fullbacks in 4-3-3", () => {
    const defenders = [
      { id: 1, starts: 10, subAppearances: 0, dominantPosition: () => "G" as const, dominantSubRole: () => "G" as const, fieldPosition: "GK" },
      { id: 2, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const, dominantSubRole: () => "CB" as const, fieldPosition: "RCB" },
      { id: 3, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const, dominantSubRole: () => "CB" as const, fieldPosition: "LCB" },
      { id: 4, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const, dominantSubRole: () => "CB" as const, fieldPosition: "CB" },
      { id: 5, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const, dominantSubRole: () => "CB" as const, fieldPosition: "CB" },
      { id: 6, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const, dominantSubRole: () => "FB" as const, fieldPosition: "LB" },
      { id: 7, starts: 10, subAppearances: 0, dominantPosition: () => "D" as const, dominantSubRole: () => "FB" as const, fieldPosition: "RB" },
      ...[8, 9, 10, 11, 12].map((id) => ({
        id,
        starts: 8,
        subAppearances: 0,
        dominantPosition: () => "M" as const,
        dominantSubRole: () => "AM" as const,
        fieldPosition: "CM",
      })),
      { id: 13, starts: 10, subAppearances: 0, dominantPosition: () => "F" as const, dominantSubRole: () => "ST" as const, fieldPosition: "ST" },
      { id: 14, starts: 9, subAppearances: 0, dominantPosition: () => "F" as const, dominantSubRole: () => "W" as const, fieldPosition: "LW" },
      { id: 15, starts: 9, subAppearances: 0, dominantPosition: () => "F" as const, dominantSubRole: () => "W" as const, fieldPosition: "RW" },
    ];

    const xi = pickStartersByFormation(defenders, "4-3-3");
    const cbCount = xi.filter((p) => p.dominantSubRole?.() === "CB").length;
    const fbCount = xi.filter((p) => p.dominantSubRole?.() === "FB").length;
    expect(cbCount).toBe(2);
    expect(fbCount).toBe(2);
    expect(xi.map((p) => p.id)).not.toContain(4);
    expect(xi.map((p) => p.id)).not.toContain(5);
  });

  it("drops unavailable players via quality override", () => {
    const players = [
      { id: 1, starts: 10, subAppearances: 0, dominantPosition: () => "G" as const },
      ...[2, 3, 4, 5, 6].map((id) => ({
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
      { id: 10, starts: 10, subAppearances: 0, dominantPosition: () => "F" as const },
      { id: 11, starts: 1, subAppearances: 0, dominantPosition: () => "F" as const },
    ];
    const qualityById = new Map<number, number>([
      [10, 99],
      [11, 50],
    ]);
    qualityById.set(10, LINEUP_UNAVAILABLE_QUALITY);
    const xi = pickStartersByFormation(players, "4-3-3", { qualityById });
    expect(xi.map((p) => p.id)).toContain(11);
    expect(xi.map((p) => p.id)).not.toContain(10);
  });
});

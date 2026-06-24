import { describe, expect, it } from "vitest";
import { isSofifaSquadTableStarter, extractSofifaStartingXi } from "@/lib/data/parse-sofifa-squad-html";
import { computeRotationIndex } from "@/lib/world-cup/wc-rotation-intensity";

describe("resolveWcModelStartingXi helpers", () => {
  it("treats SUB as bench in SoFIFA squad role rule", () => {
    expect(isSofifaSquadTableStarter("GK")).toBe(true);
    expect(isSofifaSquadTableStarter("ST")).toBe(true);
    expect(isSofifaSquadTableStarter("SUB")).toBe(false);
    expect(isSofifaSquadTableStarter(null)).toBe(false);
  });

  it("extractSofifaStartingXi returns first 11 non-SUB in order", () => {
    const players = [
      { squadRole: "GK", fullName: "A", isStarter: true, squadOrder: 0 },
      { squadRole: "CB", fullName: "B", isStarter: true, squadOrder: 1 },
      { squadRole: "SUB", fullName: "Bench", isStarter: false, squadOrder: 2 },
    ].map((p) => ({
      sofifaPlayerId: 1,
      shortName: p.fullName,
      fullName: p.fullName,
      age: null,
      overall: null,
      potential: null,
      valueEur: null,
      wageEur: null,
      totalStats: null,
      positions: [],
      squadRole: p.squadRole,
      jerseyNumber: null,
      contractYears: null,
      nationality: null,
      isStarter: p.isStarter,
      squadOrder: p.squadOrder,
    }));

    const padded = [...players];
    for (let i = 3; i < 12; i++) {
      padded.push({
        ...players[1]!,
        fullName: `P${i}`,
        shortName: `P${i}`,
        squadRole: "CM",
        squadOrder: i,
      });
    }

    const xi = extractSofifaStartingXi(padded);
    expect(xi).toHaveLength(11);
    expect(xi[0]?.fullName).toBe("A");
    expect(xi.some((p) => p.squadRole === "SUB")).toBe(false);
  });

  it("computeRotationIndex is 0 for identical XIs", () => {
    const xi = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    expect(computeRotationIndex(xi, xi)).toBe(0);
  });

  it("computeRotationIndex increases when overlap drops", () => {
    const expected = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    const rotated = ["A", "B", "C", "D", "E", "X", "Y", "Z", "I", "J", "K"];
    expect(computeRotationIndex(rotated, expected)).toBeGreaterThan(0.2);
  });
});

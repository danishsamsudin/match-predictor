import { describe, expect, it } from "vitest";
import {
  computeStrengthMomentumEdge,
  formatStrengthExplanationLine,
  getDefenseScale,
  getTeamStrengthMultiplier,
  isNationalStrengthContext,
} from "./team-strength";

describe("isNationalStrengthContext", () => {
  it("detects national entity type and team ids", () => {
    expect(isNationalStrengthContext({ entityType: "national" })).toBe(true);
    expect(isNationalStrengthContext({ leagueId: 1 })).toBe(true);
    expect(isNationalStrengthContext({ homeTeamId: 4688 })).toBe(true);
    expect(isNationalStrengthContext({ leagueId: 39 })).toBe(false);
  });
});

describe("national momentum edge", () => {
  it("reflects FIFA gap when both teams share World Cup league id", () => {
    const edge = computeStrengthMomentumEdge(
      { entityType: "national", teamId: 4688, teamName: "Sweden", leagueId: 1 },
      { entityType: "national", teamId: 4705, teamName: "Netherlands", leagueId: 1 }
    );
    expect(edge).toBeGreaterThan(0);
  });
});

describe("formatStrengthExplanationLine", () => {
  it("uses FIFA wording for national matches", () => {
    const line = formatStrengthExplanationLine("Sweden", "Netherlands", 0.86, 0.94, {
      entityType: "national",
    });
    expect(line).toMatch(/FIFA/i);
    expect(line).not.toMatch(/Premier League/i);
  });

  it("uses PL wording for club matches", () => {
    const line = formatStrengthExplanationLine("Arsenal", "Chelsea", 1, 1, {
      leagueId: 39,
    });
    expect(line).toMatch(/Premier League/i);
  });
});

describe("getDefenseScale", () => {
  it("dampens reciprocal defense scale for weak omega", () => {
    expect(getDefenseScale(0.4)).toBeCloseTo(Math.pow(1 / 0.4, 0.65), 3);
    expect(getDefenseScale(0.4)).toBeLessThan(1 / 0.4);
  });
});

describe("getTeamStrengthMultiplier", () => {
  it("returns FIFA omega for national teams", () => {
    const omega = getTeamStrengthMultiplier({
      entityType: "national",
      teamId: 4705,
      teamName: "Netherlands",
      leagueId: 1,
    });
    expect(omega).toBeGreaterThan(0.9);
    expect(omega).toBeLessThanOrEqual(1);
  });
});

import { describe, expect, it } from "vitest";
import { resolveWcLineupApiIds } from "@/lib/world-cup/resolve-wc-lineup-orientation";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";

describe("resolveWcLineupApiIds", () => {
  const baseResolved = {
    matchId: "m1",
    teamsSwappedInInput: false,
    match: { id: "m1" },
  } as ResolvedWcMatch;

  it("keeps request ids when orientation matches fixture", () => {
    expect(
      resolveWcLineupApiIds(baseResolved, { homeTeamId: 4698, awayTeamId: 4834 })
    ).toEqual({ lineupHomeApiId: 4698, lineupAwayApiId: 4834 });
  });

  it("swaps request ids when input orientation is reversed", () => {
    expect(
      resolveWcLineupApiIds(
        { ...baseResolved, teamsSwappedInInput: true },
        { homeTeamId: 4834, awayTeamId: 4698 }
      )
    ).toEqual({ lineupHomeApiId: 4698, lineupAwayApiId: 4834 });
  });
});

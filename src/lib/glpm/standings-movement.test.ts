import { describe, expect, it } from "vitest";
import {
  attachPreviousRanks,
  deriveRankMovement,
  fingerprintFinishedResults,
  resolvePreviousRanksForRefresh,
} from "@/lib/glpm/standings-movement";
import type { GlpmStandingRow } from "@/lib/glpm/hub-types";

function row(partial: Partial<GlpmStandingRow> & Pick<GlpmStandingRow, "rank" | "teamSmId">): GlpmStandingRow {
  return {
    teamName: `Team ${partial.teamSmId}`,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
    ...partial,
  };
}

describe("fingerprintFinishedResults", () => {
  it("is order-independent and empty-safe", () => {
    expect(fingerprintFinishedResults([])).toBe("empty");
    expect(
      fingerprintFinishedResults([
        { matchSmId: 2, homeScore: 1, awayScore: 0 },
        { matchSmId: 1, homeScore: 2, awayScore: 2 },
      ])
    ).toBe(
      fingerprintFinishedResults([
        { matchSmId: 1, homeScore: 2, awayScore: 2 },
        { matchSmId: 2, homeScore: 1, awayScore: 0 },
      ])
    );
  });
});

describe("deriveRankMovement", () => {
  it("marks new / up / down / same", () => {
    expect(deriveRankMovement(3, null)).toEqual({ rankDelta: 0, rankMovement: "new" });
    expect(deriveRankMovement(2, 5)).toEqual({ rankDelta: 3, rankMovement: "up" });
    expect(deriveRankMovement(6, 4)).toEqual({ rankDelta: -2, rankMovement: "down" });
    expect(deriveRankMovement(1, 1)).toEqual({ rankDelta: 0, rankMovement: "same" });
  });
});

describe("resolvePreviousRanksForRefresh", () => {
  it("keeps previous_rank when fingerprint is unchanged", () => {
    const previous = resolvePreviousRanksForRefresh({
      currentRows: [{ teamSmId: 1, rank: 2 }],
      storedByTeam: new Map([[1, { rank: 2, previousRank: 5 }]]),
      fingerprintChanged: false,
    });
    expect(previous.get(1)).toBe(5);
  });

  it("sets previous_rank to prior rank when fingerprint changes", () => {
    const previous = resolvePreviousRanksForRefresh({
      currentRows: [
        { teamSmId: 1, rank: 1 },
        { teamSmId: 2, rank: 2 },
      ],
      storedByTeam: new Map([
        [1, { rank: 3, previousRank: 4 }],
        [2, { rank: 1, previousRank: 1 }],
      ]),
      fingerprintChanged: true,
    });
    expect(previous.get(1)).toBe(3);
    expect(previous.get(2)).toBe(1);
  });

  it("uses null previous_rank for brand-new teams", () => {
    const previous = resolvePreviousRanksForRefresh({
      currentRows: [{ teamSmId: 9, rank: 4 }],
      storedByTeam: new Map(),
      fingerprintChanged: true,
    });
    expect(previous.get(9)).toBeNull();
  });
});

describe("attachPreviousRanks", () => {
  it("attaches delta and movement labels", () => {
    const rows = attachPreviousRanks(
      [row({ rank: 2, teamSmId: 10 }), row({ rank: 5, teamSmId: 20 })],
      new Map([
        [10, 4],
        [20, 3],
      ])
    );
    expect(rows[0]).toMatchObject({
      previousRank: 4,
      rankDelta: 2,
      rankMovement: "up",
    });
    expect(rows[1]).toMatchObject({
      previousRank: 3,
      rankDelta: -2,
      rankMovement: "down",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  enrichGoldenBootWithLiveGoals,
  freezeGoldenBootPredictions,
  resolvePlayerGoals,
} from "@/lib/world-cup/golden-boot-live";
import type { GoldenBootPredictionPayload } from "@/lib/world-cup/golden-boot-prediction";

function makePrediction(
  overrides?: Partial<GoldenBootPredictionPayload>
): GoldenBootPredictionPayload {
  return {
    computedAt: "2026-06-10T00:00:00.000Z",
    candidates: [
      {
        rank: 1,
        playerName: "Harry Kane",
        teamName: "England",
        teamId: "t1",
        position: "FWD",
        fieldPosition: "ST",
        goalsSoFar: 0,
        projectedRemainingGoals: 5,
        projectedTotalGoals: 5,
        expectedMatches: 6,
        scoringSharePct: 45,
        factors: {
          playerQuality: 90,
          teamStrength: 1.1,
          pathDepth: 0.8,
          opponentEase: 1,
          minutesExpectation: 0.9,
          penaltyRole: true,
        },
      },
      {
        rank: 2,
        playerName: "Kylian Mbappé",
        teamName: "France",
        teamId: "t2",
        position: "FWD",
        fieldPosition: "ST",
        goalsSoFar: 0,
        projectedRemainingGoals: 4.5,
        projectedTotalGoals: 4.5,
        expectedMatches: 6,
        scoringSharePct: 40,
        factors: {
          playerQuality: 92,
          teamStrength: 1.2,
          pathDepth: 0.85,
          opponentEase: 1.05,
          minutesExpectation: 0.95,
          penaltyRole: true,
        },
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("resolvePlayerGoals", () => {
  it("matches squad names to ingested player names", () => {
    const teamGoals = new Map([
      [
        "lionel messi",
        { displayName: "Lionel Messi", goals: 3 },
      ],
    ]);
    expect(resolvePlayerGoals(teamGoals, "L. Messi")).toBe(3);
    expect(resolvePlayerGoals(teamGoals, "Unknown")).toBe(0);
  });
});

describe("enrichGoldenBootWithLiveGoals", () => {
  it("updates scored totals and live ranks without reordering candidates", () => {
    const enriched = enrichGoldenBootWithLiveGoals(makePrediction(), {
      byTeam: new Map([
        [
          "t2",
          new Map([
            ["kylian mbappe", { displayName: "Kylian Mbappé", goals: 2 }],
          ]),
        ],
        [
          "t1",
          new Map([["harry kane", { displayName: "Harry Kane", goals: 1 }]]),
        ],
      ]),
      leaderboard: [
        { teamId: "t2", playerName: "Kylian Mbappé", goals: 2 },
        { teamId: "t1", playerName: "Harry Kane", goals: 1 },
      ],
    });

    expect(enriched.candidates[0].playerName).toBe("Harry Kane");
    expect(enriched.candidates[0].rank).toBe(1);
    expect(enriched.candidates[0].goalsSoFar).toBe(1);
    expect(enriched.candidates[0].liveTournamentRank).toBe(2);

    expect(enriched.candidates[1].playerName).toBe("Kylian Mbappé");
    expect(enriched.candidates[1].goalsSoFar).toBe(2);
    expect(enriched.candidates[1].isLiveLeader).toBe(true);
    expect(enriched.liveLeader?.playerName).toBe("Kylian Mbappé");
  });
});

describe("freezeGoldenBootPredictions", () => {
  it("keeps the first frozen roster on later rebuilds", () => {
    const frozen = freezeGoldenBootPredictions(null, makePrediction());
    expect(frozen?.frozenAt).toBeTruthy();

    const refreshed = makePrediction({
      candidates: [
        {
          ...makePrediction().candidates[0],
          playerName: "Someone Else",
          rank: 1,
        },
      ],
    });

    const merged = freezeGoldenBootPredictions(frozen, refreshed);
    expect(merged?.candidates[0].playerName).toBe("Harry Kane");
    expect(merged?.frozenAt).toBe(frozen?.frozenAt);
  });

  it("locks an existing snapshot roster that predates frozenAt", () => {
    const existing = makePrediction();
    const merged = freezeGoldenBootPredictions(existing, makePrediction({
      candidates: [
        {
          ...makePrediction().candidates[0],
          playerName: "Someone Else",
        },
      ],
    }));
    expect(merged?.candidates[0].playerName).toBe("Harry Kane");
    expect(merged?.frozenAt).toBeTruthy();
  });
});

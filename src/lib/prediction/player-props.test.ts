import { describe, expect, it } from "vitest";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import {
  computePlayerPropsPayload,
  computeTacticalMultiplier,
  sumNormalizedGoalLambdas,
  zipProbAtLeastOne,
} from "@/lib/prediction/player-props";

function makePlayer(overrides: Partial<SquadPlayer> & { name: string }): SquadPlayer {
  return {
    sofascorePlayerId: Math.floor(Math.random() * 1_000_000),
    scoutlystPlayerKey: null,
    position: "FWD",
    fieldPosition: "ST",
    performanceScore: 80,
    startSharePct: 90,
    detailStats: [
      { label: "Goals", value: "20" },
      { label: "xG", value: "18" },
      { label: "Assists", value: "5" },
      { label: "xA", value: "4" },
      { label: "Minutes", value: "2700" },
      { label: "Appearances", value: "30" },
    ],
    age: 27,
    ...overrides,
  };
}

function makeSquad(starters: SquadPlayer[]): TeamSquadSnapshot {
  return {
    starters,
    substitutes: [],
    hasLineupData: true,
    hasScoutlystData: true,
    squadSource: "scoutlyst",
    preferredFormation: "4-3-3",
    snapshotDate: null,
  };
}

describe("zipProbAtLeastOne", () => {
  it("returns higher probability for larger lambda", () => {
    expect(zipProbAtLeastOne(0.5)).toBeGreaterThan(zipProbAtLeastOne(0.1));
  });

  it("handles zero lambda as no scoring chance", () => {
    const prob = zipProbAtLeastOne(0, 0.12);
    expect(prob).toBe(0);
  });

  it("approaches 1 for high lambda", () => {
    expect(zipProbAtLeastOne(3)).toBeGreaterThan(0.8);
  });
});

describe("computeTacticalMultiplier", () => {
  it("boosts poachers against high-SSI defenses", () => {
    const poacher = makePlayer({
      name: "Poacher",
      detailStats: [
        { label: "xG", value: "0.55" },
        { label: "Shots", value: "2.5" },
        { label: "Minutes", value: "900" },
      ],
    });
    const mult = computeTacticalMultiplier(
      poacher,
      { sci: 0.12, ssi: 0.16, sampleWeight: 10 },
      0.1
    );
    expect(mult).toBeGreaterThan(1);
  });

  it("returns 1 when opponent profile missing", () => {
    const player = makePlayer({ name: "Striker" });
    expect(computeTacticalMultiplier(player, null)).toBe(1);
  });
});

describe("computePlayerPropsPayload", () => {
  it("normalizes player goal lambdas near team xG budget", () => {
    const squad = makeSquad([
      makePlayer({ name: "A", sofascorePlayerId: 1 }),
      makePlayer({
        name: "B",
        sofascorePlayerId: 2,
        detailStats: [
          { label: "xG", value: "9" },
          { label: "Minutes", value: "2700" },
        ],
      }),
      makePlayer({
        name: "W",
        sofascorePlayerId: 3,
        position: "MID",
        fieldPosition: "LW",
        detailStats: [
          { label: "xG", value: "6" },
          { label: "xA", value: "8" },
          { label: "Minutes", value: "2700" },
        ],
      }),
    ]);

    const teamXg = 2.1;
    const sum = sumNormalizedGoalLambdas(squad, teamXg);
    expect(sum).toBeGreaterThan(teamXg * 0.75);
    expect(sum).toBeLessThan(teamXg * 0.95);
  });

  it("returns top 5 ranked by anytime scorer probability", () => {
    const starters = Array.from({ length: 7 }, (_, i) =>
      makePlayer({
        name: `F${i + 1}`,
        sofascorePlayerId: i + 1,
        detailStats: [
          { label: "xG", value: String(20 - i * 2) },
          { label: "Minutes", value: "2700" },
        ],
      })
    );

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeTeamId: 1,
      awayTeamId: 2,
      homeXg: 1.8,
      awayXg: 1.2,
      homeSquad: makeSquad(starters),
      awaySquad: makeSquad([makePlayer({ name: "Away Striker", sofascorePlayerId: 99 })]),
    });

    expect(payload.home.anytimeScorer).toHaveLength(5);
    expect(payload.home.anytimeScorer[0]?.playerName).toBe("F1");
    expect(payload.home.anytimeScorer[0]!.probabilityPct).toBeGreaterThan(
      payload.home.anytimeScorer[4]!.probabilityPct
    );
  });

  it("returns five players even when only two are traditional attackers", () => {
    const squad = makeSquad([
      makePlayer({ name: "Striker", sofascorePlayerId: 1, fieldPosition: "ST" }),
      makePlayer({
        name: "Winger",
        sofascorePlayerId: 2,
        position: "MID",
        fieldPosition: "LW",
      }),
      ...Array.from({ length: 6 }, (_, i) =>
        makePlayer({
          name: `Def${i + 1}`,
          sofascorePlayerId: 10 + i,
          position: "DEF",
          fieldPosition: "CB",
          startSharePct: 80 - i,
          detailStats: [{ label: "Minutes", value: "1800" }],
        })
      ),
    ]);

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeTeamId: 1,
      awayTeamId: 2,
      homeXg: 1.5,
      awayXg: 1.1,
      homeSquad: squad,
      awaySquad: makeSquad([makePlayer({ name: "Away Striker", sofascorePlayerId: 99 })]),
    });

    expect(payload.home.anytimeScorer).toHaveLength(5);
    expect(payload.home.goalOrAssist).toHaveLength(5);
  });

  it("goal-or-assist market ranks wingers with high xA", () => {
    const squad = makeSquad([
      makePlayer({
        name: "Creator",
        sofascorePlayerId: 10,
        position: "MID",
        fieldPosition: "RW",
        detailStats: [
          { label: "xG", value: "4" },
          { label: "xA", value: "14" },
          { label: "Minutes", value: "2700" },
        ],
      }),
      makePlayer({
        name: "Finisher",
        sofascorePlayerId: 11,
        detailStats: [
          { label: "xG", value: "16" },
          { label: "xA", value: "1" },
          { label: "Minutes", value: "2700" },
        ],
      }),
    ]);

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeTeamId: 1,
      awayTeamId: 2,
      homeXg: 2,
      awayXg: 1,
      homeSquad: squad,
      awaySquad: makeSquad([]),
    });

    const finisher = payload.home.anytimeScorer.find((p) => p.playerName === "Finisher");
    const creator = payload.home.goalOrAssist.find((p) => p.playerName === "Creator");
    expect(finisher?.rank).toBe(1);
    expect(creator).toBeDefined();
    expect(creator!.probabilityPct).toBeGreaterThan(15);
  });
});

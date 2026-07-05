import { describe, expect, it } from "vitest";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import type { WcPlayerPropOverlay } from "@/lib/prediction/player-props-wc-opta";
import {
  computePlayerPropsPayload,
  computeTacticalMultiplier,
  isGoalkeeperPlayer,
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

  it("excludes goalkeepers from goal markets", () => {
    const squad = makeSquad([
      makePlayer({
        name: "E. Martinez",
        sofascorePlayerId: 1,
        position: "GK",
        fieldPosition: "GK",
        startSharePct: 100,
        detailStats: [{ label: "Minutes", value: "2700" }],
      }),
      ...Array.from({ length: 6 }, (_, i) =>
        makePlayer({
          name: `F${i + 1}`,
          sofascorePlayerId: 10 + i,
          fieldPosition: "ST",
          startSharePct: 90 - i,
          detailStats: [
            { label: "xG", value: String(18 - i * 2) },
            { label: "Minutes", value: "2700" },
          ],
        })
      ),
    ]);

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Argentina",
      awayTeamName: "Austria",
      homeTeamId: 4819,
      awayTeamId: 4718,
      homeXg: 2.1,
      awayXg: 0.6,
      homeSquad: squad,
      awaySquad: makeSquad([makePlayer({ name: "Away Striker", sofascorePlayerId: 99 })]),
    });

    const anytimeNames = payload.home.anytimeScorer.map((p) => p.playerName);
    const goalOrAssistNames = payload.home.goalOrAssist.map((p) => p.playerName);
    expect(anytimeNames).not.toContain("E. Martinez");
    expect(goalOrAssistNames).not.toContain("E. Martinez");
    expect(anytimeNames.every((name) => name.startsWith("F"))).toBe(true);
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

  it("excludes goalkeepers from shots on target market", () => {
    const squad = makeSquad([
      makePlayer({
        name: "Ederson",
        sofascorePlayerId: 1,
        position: "GK",
        fieldPosition: "SUB",
        startSharePct: 100,
        detailStats: [{ label: "Minutes", value: "2700" }],
      }),
      makePlayer({
        name: "Vinicius",
        sofascorePlayerId: 2,
        fieldPosition: "LW",
        detailStats: [
          { label: "SoT", value: "45" },
          { label: "Minutes", value: "2700" },
        ],
      }),
      makePlayer({
        name: "Raphinha",
        sofascorePlayerId: 3,
        fieldPosition: "RW",
        detailStats: [
          { label: "SoT", value: "38" },
          { label: "Minutes", value: "2700" },
        ],
      }),
      ...Array.from({ length: 5 }, (_, i) =>
        makePlayer({
          name: `Mid${i + 1}`,
          sofascorePlayerId: 10 + i,
          position: "MID",
          fieldPosition: "CM",
          startSharePct: 70 - i,
          detailStats: [
            { label: "SoT", value: String(12 - i) },
            { label: "Minutes", value: "2700" },
          ],
        })
      ),
    ]);

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Brazil",
      awayTeamName: "Norway",
      homeTeamId: 1,
      awayTeamId: 2,
      homeXg: 1.8,
      awayXg: 1.1,
      homeSquad: squad,
      awaySquad: makeSquad([]),
    });

    const sotNames = payload.home.shotsOnTarget
      .filter((line) => line.line === 0.5)
      .map((line) => line.playerName);
    expect(sotNames).not.toContain("Ederson");
    expect(isGoalkeeperPlayer(squad.starters[0]!)).toBe(true);
  });

  it("ranks shots on target by Opta tournament totals and differentiates fair odds", () => {
    const wcOverlays = new Map<string, WcPlayerPropOverlay>();
    const overlayFor = (
      name: string,
      sotTotal: number,
      sotPer90: number
    ): WcPlayerPropOverlay => ({
      optaPlayerId: name,
      playerName: name,
      teamApiId: 1,
      goalRate90: 0.2,
      assistRate90: 0.1,
      chanceIndexPer90: 0.5,
      shotsOnTargetPer90: sotPer90,
      shotsOnTargetTotal: sotTotal,
      goalsTotal: 2,
      assistsTotal: 1,
      xgTotal: 2.4,
      goalsPer90: 0.15,
      xgPer90: 0.18,
      minutesTotal: (sotTotal / sotPer90) * 90,
      matchesPlayed: 3,
      wasLastStarter: true,
      availabilityFactor: 1,
      wcWeight: 0.8,
    });

    wcOverlays.set("vinicius jr", overlayFor("Vinicius Jr", 12, 1.4));
    wcOverlays.set("raphinha", overlayFor("Raphinha", 9, 1.1));
    wcOverlays.set("rodrygo", overlayFor("Rodrygo", 6, 0.9));
    wcOverlays.set("marquinhos", overlayFor("Marquinhos", 2, 0.2));
    wcOverlays.set("wesley", overlayFor("Wesley", 1, 0.15));

    const squad = makeSquad([
      makePlayer({ name: "Vinicius Jr", sofascorePlayerId: 1, fieldPosition: "LW" }),
      makePlayer({ name: "Raphinha", sofascorePlayerId: 2, fieldPosition: "RW" }),
      makePlayer({ name: "Rodrygo", sofascorePlayerId: 3, fieldPosition: "ST" }),
      makePlayer({
        name: "Marquinhos",
        sofascorePlayerId: 4,
        position: "DEF",
        fieldPosition: "RCB",
      }),
      makePlayer({
        name: "Wesley",
        sofascorePlayerId: 5,
        position: "DEF",
        fieldPosition: "RB",
      }),
      makePlayer({
        name: "Ederson",
        sofascorePlayerId: 6,
        position: "GK",
        fieldPosition: "GK",
      }),
    ]);

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Brazil",
      awayTeamName: "Norway",
      homeTeamId: 1,
      awayTeamId: 2,
      homeXg: 1.8,
      awayXg: 1.1,
      homeSquad: squad,
      awaySquad: makeSquad([]),
      wcOverlays,
      homeTeamExpectedSot: 5.5,
    });

    const sotLines = payload.home.shotsOnTarget.filter((line) => line.line === 0.5);
    expect(sotLines).toHaveLength(5);
    expect(sotLines[0]?.playerName).toBe("Vinicius Jr");
    expect(sotLines[1]?.playerName).toBe("Raphinha");
    expect(sotLines.map((line) => line.playerName)).not.toContain("Ederson");
    expect(sotLines[0]!.expectedSot).toBeGreaterThan(sotLines[4]!.expectedSot);
    expect(sotLines[0]!.probabilityPct).toBeGreaterThan(sotLines[4]!.probabilityPct);
    expect(sotLines[0]!.fairDecimalOdds).toBeLessThan(sotLines[4]!.fairDecimalOdds);
  });

  it("ranks anytime scorers by WC tournament goals before model probability", () => {
    const wcOverlays = new Map<string, WcPlayerPropOverlay>();
    const overlayFor = (
      name: string,
      goalsTotal: number,
      xgTotal: number,
      goalRate90: number
    ): WcPlayerPropOverlay => ({
      optaPlayerId: name,
      playerName: name,
      teamApiId: 1,
      goalRate90,
      assistRate90: 0.05,
      chanceIndexPer90: 0.4,
      shotsOnTargetPer90: 0.8,
      shotsOnTargetTotal: 4,
      goalsTotal,
      assistsTotal: 0,
      xgTotal,
      goalsPer90: goalRate90,
      xgPer90: xgTotal * 0.3,
      minutesTotal: 270,
      matchesPlayed: 3,
      wasLastStarter: true,
      availabilityFactor: 1,
      wcWeight: 0.85,
    });

    wcOverlays.set("richarlison", overlayFor("Richarlison", 3, 2.1, 0.55));
    wcOverlays.set("vinicius jr", overlayFor("Vinicius Jr", 2, 3.8, 0.42));
    wcOverlays.set("raphinha", overlayFor("Raphinha", 1, 1.2, 0.28));
    wcOverlays.set("rodrygo", overlayFor("Rodrygo", 0, 2.9, 0.35));
    wcOverlays.set("marquinhos", overlayFor("Marquinhos", 0, 0.3, 0.05));

    const squad = makeSquad([
      makePlayer({
        name: "Vinicius Jr",
        sofascorePlayerId: 1,
        fieldPosition: "LW",
        detailStats: [
          { label: "xG", value: "22" },
          { label: "Minutes", value: "2700" },
        ],
      }),
      makePlayer({
        name: "Richarlison",
        sofascorePlayerId: 2,
        fieldPosition: "ST",
        detailStats: [
          { label: "xG", value: "6" },
          { label: "Minutes", value: "1800" },
        ],
      }),
      makePlayer({
        name: "Raphinha",
        sofascorePlayerId: 3,
        fieldPosition: "RW",
        detailStats: [
          { label: "xG", value: "14" },
          { label: "Minutes", value: "2700" },
        ],
      }),
      makePlayer({
        name: "Rodrygo",
        sofascorePlayerId: 4,
        fieldPosition: "ST",
        detailStats: [
          { label: "xG", value: "4" },
          { label: "Minutes", value: "900" },
        ],
      }),
      makePlayer({
        name: "Marquinhos",
        sofascorePlayerId: 5,
        position: "DEF",
        fieldPosition: "RCB",
        detailStats: [{ label: "Minutes", value: "2700" }],
      }),
      makePlayer({
        name: "Casemiro",
        sofascorePlayerId: 6,
        position: "MID",
        fieldPosition: "CDM",
        detailStats: [
          { label: "xG", value: "3" },
          { label: "Minutes", value: "2700" },
        ],
      }),
    ]);

    const payload = computePlayerPropsPayload({
      modelVersion: "test",
      homeTeamName: "Brazil",
      awayTeamName: "Norway",
      homeTeamId: 1,
      awayTeamId: 2,
      homeXg: 1.8,
      awayXg: 1.1,
      homeSquad: squad,
      awaySquad: makeSquad([]),
      wcOverlays,
    });

    const names = payload.home.anytimeScorer.map((line) => line.playerName);
    expect(names[0]).toBe("Richarlison");
    expect(names[1]).toBe("Vinicius Jr");
    expect(names[2]).toBe("Raphinha");
    expect(names.slice(0, 3)).not.toContain("Marquinhos");
    expect(names).toContain("Rodrygo");
  });
});

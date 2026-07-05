import { describe, expect, it } from "vitest";
import {
  applyPlayerPropMlCalibration,
  buildPlayerPropMlFeatures,
  DEFAULT_PLAYER_PROP_ML_COEFFS,
  trainPlayerPropMlCoeffs,
} from "@/lib/prediction/player-props-ml";
import {
  wcAssistRate90FromTournament,
  wcGoalRate90FromTournament,
} from "@/lib/prediction/player-props-wc-opta";
import { computePlayerPropsPayload } from "@/lib/prediction/player-props";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import type { WcPlayerPropOverlay } from "@/lib/prediction/player-props-wc-opta";

function makePlayer(overrides: Partial<SquadPlayer> & { name: string }): SquadPlayer {
  return {
    sofascorePlayerId: Math.floor(Math.random() * 1_000_000),
    scoutlystPlayerKey: null,
    position: "MID",
    fieldPosition: "CM",
    performanceScore: 87,
    startSharePct: 100,
    detailStats: [
      { label: "Goals", value: "—" },
      { label: "xG", value: "—" },
      { label: "Minutes", value: "—" },
    ],
    age: 34,
    ...overrides,
  };
}

describe("wcGoalRate90FromTournament", () => {
  it("uses Opta xG and chance index for creators", () => {
    const rate = wcGoalRate90FromTournament({
      goalsTotal: 1,
      xgTotal: 1.1,
      minutesTotal: 245,
      chanceIndexPer90: 1.12,
      shotsOnTargetPer90: 1.1,
    });
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(1.2);
  });
});

describe("applyPlayerPropMlCalibration", () => {
  it("raises low base probabilities for high-lambda creators", () => {
    const features = buildPlayerPropMlFeatures({
      normalizedGoalLambda: 0.38,
      wcOverlay: {
        optaPlayerId: "1",
        playerName: "K. De Bruyne",
        teamApiId: 4717,
        goalRate90: 0.4,
        assistRate90: 0.15,
        chanceIndexPer90: 1.12,
        shotsOnTargetPer90: 1.1,
        shotsOnTargetTotal: 4,
        goalsTotal: 1,
        assistsTotal: 0,
        xgTotal: 1.1,
        goalsPer90: 0.37,
        xgPer90: 0.4,
        minutesTotal: 245,
        matchesPlayed: 3,
        wasLastStarter: true,
        availabilityFactor: 0.92,
        wcWeight: 0.9,
      },
      isPenaltyTaker: true,
      isStarter: true,
      role: "M",
      teamExpectedGoals: 1.65,
    });
    const calibrated = applyPlayerPropMlCalibration(
      0.12,
      features,
      DEFAULT_PLAYER_PROP_ML_COEFFS
    );
    expect(calibrated).toBeGreaterThan(0.17);
  });
});

describe("computePlayerPropsPayload with WC overlays", () => {
  it("prices de Bruyne closer to market when WC Opta form is used", () => {
    const overlay: WcPlayerPropOverlay = {
      optaPlayerId: "c2jqa9vozhqu7x79h5rr2n1ed",
      playerName: "K. De Bruyne",
      teamApiId: 4717,
      goalRate90: 0.4,
      assistRate90: 0.15,
      chanceIndexPer90: 1.12,
      shotsOnTargetPer90: 1.1,
      shotsOnTargetTotal: 4,
      goalsTotal: 1,
      assistsTotal: 0,
      xgTotal: 1.1,
      goalsPer90: 0.37,
      xgPer90: 0.4,
      minutesTotal: 245,
      matchesPlayed: 3,
      wasLastStarter: true,
      availabilityFactor: 0.92,
      wcWeight: 0.9,
    };
    const overlays = new Map([["k de bruyne", overlay]]);

    const squad: TeamSquadSnapshot = {
      starters: [
        makePlayer({ name: "Kevin de Bruyne", sofascorePlayerId: 1, fieldPosition: "CM" }),
        makePlayer({
          name: "Romelu Lukaku",
          sofascorePlayerId: 2,
          fieldPosition: "ST",
          position: "FWD",
        }),
        makePlayer({ name: "Jeremy Doku", sofascorePlayerId: 3, fieldPosition: "LW" }),
        ...Array.from({ length: 8 }, (_, i) =>
          makePlayer({
            name: `Mid${i}`,
            sofascorePlayerId: 10 + i,
            fieldPosition: "CM",
            startSharePct: 60 - i,
          })
        ),
      ],
      substitutes: [],
      hasLineupData: true,
      hasScoutlystData: false,
      squadSource: "official",
      preferredFormation: "4-2-3-1",
      snapshotDate: null,
    };

    const payload = computePlayerPropsPayload({
      modelVersion: "test-wc-opta",
      homeTeamName: "Belgium",
      awayTeamName: "Senegal",
      homeTeamId: 4717,
      awayTeamId: 4739,
      homeXg: 1.65,
      awayXg: 1.1,
      homeSquad: squad,
      awaySquad: {
        starters: [makePlayer({ name: "Away Striker", sofascorePlayerId: 99, fieldPosition: "ST" })],
        substitutes: [],
        hasLineupData: true,
        hasScoutlystData: false,
        squadSource: "official",
        preferredFormation: null,
        snapshotDate: null,
      },
      homePenaltyTaker: "Kevin de Bruyne",
      wcOverlays: overlays,
      mlCoeffs: DEFAULT_PLAYER_PROP_ML_COEFFS,
    });

    const kdb = payload.home.anytimeScorer.find((p) =>
      p.playerName.toLowerCase().includes("bruyne")
    );
    expect(kdb).toBeDefined();
    expect(kdb!.fairDecimalOdds).toBeLessThan(5.5);
    expect(kdb!.fairDecimalOdds).toBeGreaterThan(2);
    expect(kdb!.probabilityPct).toBeGreaterThan(18);
  });
});

describe("trainPlayerPropMlCoeffs", () => {
  it("fits without throwing on small samples", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      hit: i % 3 === 0,
      predictedProb: 0.08 + i * 0.01,
      predictedLambda: 0.1 + i * 0.02,
      chanceIndexPer90: 0.4 + i * 0.05,
      isPenaltyTaker: i === 0,
      isStarter: true,
      roleForward: i % 4 === 0,
      roleMid: i % 4 !== 0,
      teamExpectedGoals: 1.4,
    }));
    const result = trainPlayerPropMlCoeffs(rows);
    expect(result.sampleSize).toBe(12);
    expect(Number.isFinite(result.brier)).toBe(true);
  });
});

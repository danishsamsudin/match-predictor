import { describe, expect, it } from "vitest";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import {
  allocateTeamGoalsToPlayers,
  buildTeamFixtureGoals,
  computeGoldenBootPredictions,
  computePlayerScoringWeight,
  isGoldenBootCandidate,
  rankGoldenBootCandidates,
} from "@/lib/world-cup/golden-boot-prediction";
import type { TournamentForecastPayload } from "@/lib/world-cup/tournament-forecast-payload";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function makePlayer(overrides: Partial<SquadPlayer> & { name: string }): SquadPlayer {
  return {
    sofascorePlayerId: 1,
    scoutlystPlayerKey: null,
    position: "FWD",
    fieldPosition: "ST",
    performanceScore: 80,
    startSharePct: 90,
    detailStats: [
      { label: "Goals", value: "20" },
      { label: "xG", value: "0.55" },
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
    squadSource: "sofifa",
    preferredFormation: "4-3-3",
    snapshotDate: null,
    coach: null,
  };
}

describe("isGoldenBootCandidate", () => {
  it("includes forwards and attacking mids", () => {
    expect(
      isGoldenBootCandidate(makePlayer({ name: "Striker", position: "FWD", fieldPosition: "ST" }))
    ).toBe(true);
    expect(
      isGoldenBootCandidate(makePlayer({ name: "Winger", position: "MID", fieldPosition: "LW" }))
    ).toBe(true);
    expect(
      isGoldenBootCandidate(makePlayer({ name: "CB", position: "DEF", fieldPosition: "CB" }))
    ).toBe(false);
  });
});

describe("computePlayerScoringWeight", () => {
  it("gives penalty takers a higher raw weight", () => {
    const player = makePlayer({ name: "Kane" });
    const base = computePlayerScoringWeight(player);
    const pen = computePlayerScoringWeight(player, { isPenaltyTaker: true });
    expect(pen.rawWeight).toBeGreaterThan(base.rawWeight);
  });
});

describe("allocateTeamGoalsToPlayers", () => {
  it("normalizes shares and applies penalty boost", () => {
    const squad = makeSquad([
      makePlayer({ name: "Alpha", detailStats: [{ label: "Goals", value: "25" }, { label: "Minutes", value: "3000" }] }),
      makePlayer({
        name: "Beta",
        startSharePct: 70,
        detailStats: [{ label: "Goals", value: "8" }, { label: "Minutes", value: "2500" }],
      }),
    ]);

    const results = allocateTeamGoalsToPlayers({
      teamId: "t1",
      teamName: "England",
      squad,
      fixtures: [
        { matchId: "m1", isFinished: false, teamGoals: 2, oppEase: 1 },
        { matchId: "m2", isFinished: false, teamGoals: 1.5, oppEase: 1.05 },
      ],
      penaltyTakerName: "Alpha",
      teamAttackRate: 1.2,
    });

    expect(results).toHaveLength(2);
    const totalShare = results.reduce((sum, r) => sum + r.scoringSharePct, 0);
    expect(totalShare).toBeCloseTo(100, 0);

    const alpha = results.find((r) => r.playerName === "Alpha")!;
    const beta = results.find((r) => r.playerName === "Beta")!;
    expect(alpha.projectedTotalGoals).toBeGreaterThan(beta.projectedTotalGoals);
    expect(alpha.factors.penaltyRole).toBe(true);
    expect(alpha.projectedTotalGoals).toBeGreaterThan(3.5 * (alpha.scoringSharePct / 100));
  });
});

describe("buildTeamFixtureGoals", () => {
  it("uses actual goals for finished matches and xG for scheduled", () => {
    const matches: WcMatchRow[] = [
      {
        id: "g1",
        date: "2026-06-15",
        time: null,
        group_code: "A",
        status: "finished",
        home_team_id: "t1",
        away_team_id: "t2",
        home_goals: 2,
        away_goals: 0,
        home_team_name: "England",
        away_team_name: "France",
      },
      {
        id: "g2",
        date: "2026-06-20",
        time: null,
        group_code: "A",
        status: "scheduled",
        home_team_id: "t1",
        away_team_id: "t3",
        home_goals: null,
        away_goals: null,
        home_team_name: "England",
        away_team_name: "USA",
      },
    ];

    const predictions = new Map([
      ["g2", { predicted_score_home: 1, predicted_score_away: 1, homeXg: 1.8, awayXg: 0.9 }],
    ]);

    const fixtures = buildTeamFixtureGoals({
      teamId: "t1",
      teamName: "England",
      groupMatches: matches,
      knockoutMatches: [],
      predictionsByMatchId: predictions,
      finishedMatches: [matches[0]],
      medianDefense: 1,
    });

    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].teamGoals).toBe(2);
    expect(fixtures[0].isFinished).toBe(true);
    expect(fixtures[1].teamGoals).toBeGreaterThan(1.5);
  });
});

describe("rankGoldenBootCandidates", () => {
  it("orders by projected total goals", () => {
    const ranked = rankGoldenBootCandidates([
      {
        rank: 0,
        playerName: "B",
        teamName: "X",
        teamId: "1",
        position: "FWD",
        fieldPosition: "ST",
        goalsSoFar: 0,
        projectedRemainingGoals: 3,
        projectedTotalGoals: 3,
        expectedMatches: 5,
        scoringSharePct: 40,
        factors: {
          playerQuality: 80,
          teamStrength: 1.1,
          pathDepth: 0.7,
          opponentEase: 1,
          minutesExpectation: 0.9,
          penaltyRole: false,
        },
      },
      {
        rank: 0,
        playerName: "A",
        teamName: "Y",
        teamId: "2",
        position: "FWD",
        fieldPosition: "ST",
        goalsSoFar: 1,
        projectedRemainingGoals: 4,
        projectedTotalGoals: 5,
        expectedMatches: 6,
        scoringSharePct: 50,
        factors: {
          playerQuality: 85,
          teamStrength: 1.2,
          pathDepth: 0.85,
          opponentEase: 1.05,
          minutesExpectation: 0.95,
          penaltyRole: true,
        },
      },
    ]);

    expect(ranked[0].playerName).toBe("A");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });
});

describe("computeGoldenBootPredictions", () => {
  it("returns top candidates across teams", () => {
    const forecast: TournamentForecastPayload = {
      mode: "deterministic",
      computedAt: new Date().toISOString(),
      allocationKey: "test",
      champion: { teamId: "t1", teamName: "England" },
      runnerUp: { teamId: "t2", teamName: "France" },
      thirdPlace: { teamId: "t3", teamName: "Spain" },
      semiFinalists: [
        { teamId: "t1", teamName: "England" },
        { teamId: "t2", teamName: "France" },
      ],
      warnings: [],
      knockoutMatches: [
        {
          matchNumber: 73,
          round: "R32",
          date: null,
          kickoffTime: null,
          city: null,
          homeTeam: { teamId: "t1", teamName: "England" },
          awayTeam: { teamId: "t4", teamName: "USA" },
          homeGoals: 2,
          awayGoals: 1,
          winner: { teamId: "t1", teamName: "England" },
        },
      ],
    };

    const groupMatches: WcMatchRow[] = [
      {
        id: "g1",
        date: "2026-06-15",
        time: null,
        group_code: "A",
        status: "scheduled",
        home_team_id: "t1",
        away_team_id: "t2",
        home_goals: null,
        away_goals: null,
        home_team_name: "England",
        away_team_name: "France",
      },
    ];

    const payload = computeGoldenBootPredictions({
      forecast,
      groupMatches,
      predictionsByMatchId: new Map([
        ["g1", { predicted_score_home: 2, predicted_score_away: 1, homeXg: 2.1, awayXg: 0.8 }],
      ]),
      teamNames: new Map([
        ["t1", "England"],
        ["t2", "France"],
        ["t3", "Spain"],
        ["t4", "USA"],
      ]),
      squads: new Map([
        [
          "t1",
          {
            teamName: "England",
            sofaTeamId: 4713,
            squad: makeSquad([makePlayer({ name: "Harry Kane" })]),
          },
        ],
        [
          "t2",
          {
            teamName: "France",
            sofaTeamId: 4481,
            squad: makeSquad([
              makePlayer({
                name: "Kylian Mbappé",
                detailStats: [{ label: "Goals", value: "30" }, { label: "Minutes", value: "2800" }],
              }),
            ]),
          },
        ],
      ]),
      penaltyTakersByTeamName: new Map([
        ["England", "Harry Kane"],
        ["France", "Kylian Mbappé"],
      ]),
    });

    expect(payload.candidates.length).toBeGreaterThan(0);
    expect(payload.candidates.length).toBeLessThanOrEqual(10);
    expect(payload.candidates[0].rank).toBe(1);
  });
});

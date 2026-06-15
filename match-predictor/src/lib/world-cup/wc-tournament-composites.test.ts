import { describe, expect, it } from "vitest";
import {
  buildCompositesForFixture,
  computePlayerTournamentForm,
  disciplineCardCount,
  opponentAdjustedCompositeMean,
  type TeamMatchComposite,
} from "@/lib/world-cup/wc-tournament-composites";
import type { ParsedOptaFixture } from "@/lib/world-cup/opta-player-stats-parser";

function sampleParsed(): ParsedOptaFixture {
  return {
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeTeamApiId: 4781,
    awayTeamApiId: 4736,
    homeGoals: 2,
    awayGoals: 0,
    matchDate: "2026-06-11",
    homeTeamOptaId: "h1",
    awayTeamOptaId: "a1",
    warnings: [],
    sourcePaths: {},
    players: [
      {
        optaPlayerId: "p1",
        playerName: "Striker",
        side: "home",
        teamOptaId: "h1",
        isStarter: true,
        position: "FW",
        minutes: 90,
        optaPoints: 8,
        matchRank: 1,
        stats: { expectedGoals: 1.2, shotCreated: 2, tackles: 1 },
      },
      {
        optaPlayerId: "p2",
        playerName: "Defender",
        side: "home",
        teamOptaId: "h1",
        isStarter: true,
        position: "DF",
        minutes: 90,
        optaPoints: 7,
        matchRank: 2,
        stats: { interceptions: 3, tackles: 4 },
      },
      {
        optaPlayerId: "p3",
        playerName: "Away FW",
        side: "away",
        teamOptaId: "a1",
        isStarter: true,
        position: "FW",
        minutes: 70,
        optaPoints: 5,
        matchRank: 3,
        stats: { expectedGoals: 0.05, shots_on_target: 1 },
      },
    ],
  };
}

describe("wc-tournament-composites", () => {
  it("ignores fractional Opta Points contributions for card counts", () => {
    expect(disciplineCardCount({ cards_yellow: -0.2 }, "yellow")).toBe(0);
    expect(disciplineCardCount({ cards_yellow: 1 }, "yellow")).toBe(1);
    expect(disciplineCardCount({ opta_pts_cards_yellow: -0.2, cards_yellow: 1 }, "yellow")).toBe(1);
  });

  it("builds home/away composites with winsorized finishing delta", () => {
    const composites = buildCompositesForFixture({
      matchId: "m1",
      parsed: sampleParsed(),
      homeTerritory: { possessionPct: 62, finalThirdEntries: 40, penaltyAreaEntries: 18 },
      awayTerritory: { possessionPct: 38, finalThirdEntries: 12, penaltyAreaEntries: 4 },
      homeXg: 1.4,
      awayXg: 0.1,
      homeOpponentStrength: 0.9,
      awayOpponentStrength: 1.1,
    });

    expect(composites).toHaveLength(2);
    expect(composites[0].chanceIndex).toBeGreaterThan(0);
    expect(composites[0].finishingDelta).toBeCloseTo(0.6, 1);
    expect(composites[0].territoryIndex).toBeGreaterThan(composites[1].territoryIndex);
  });

  it("opponent-adjusts composite means", () => {
    const composites: TeamMatchComposite[] = [
      {
        matchId: "m1",
        teamApiId: 1,
        side: "home",
        chanceIndex: 2,
        finishingDelta: 0,
        defensiveSolidity: 1.5,
        territoryIndex: 0.6,
        gkSaveIndex: 0,
        disciplineLoad: 0.2,
        opponentStrength: 1.2,
        payload: {},
      },
      {
        matchId: "m2",
        teamApiId: 1,
        side: "away",
        chanceIndex: 1,
        finishingDelta: 0,
        defensiveSolidity: 1,
        territoryIndex: 0.5,
        gkSaveIndex: 0,
        disciplineLoad: 0.1,
        opponentStrength: 0.8,
        payload: {},
      },
    ];

    const mean = opponentAdjustedCompositeMean(composites, "chanceIndex");
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(2.5);
  });

  it("rolls up player tournament form with availability", () => {
    const parsed = sampleParsed();
    const rows = parsed.players.map((player) => ({
      matchId: "m1",
      matchDate: "2026-06-11",
      teamApiId: player.side === "home" ? 4781 : 4736,
      player,
    }));

    const form = computePlayerTournamentForm(rows);
    expect(form.length).toBe(3);
    const striker = form.find((f) => f.optaPlayerId === "p1");
    expect(striker?.chanceIndexPer90).toBeGreaterThan(0);
    expect(striker?.availabilityFactor).toBeLessThanOrEqual(1);
    expect(striker?.wasLastStarter).toBe(true);
  });
});

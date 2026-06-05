import { describe, expect, it } from "vitest";
import { hasAllocationMatrix, assignKnockoutOpponents } from "@/lib/world-cup/knockout-allocation";
import {
  loadKnockoutBracket,
  resolveR32Participants,
} from "@/lib/world-cup/knockout-bracket";
import { simulateGroupStage } from "@/lib/world-cup/simulate-group-stage";
import type { GroupStandingRow, WcMatchRow } from "@/lib/world-cup/standings";
import { loadGroupDraw } from "@/lib/world-cup/group-draw";

function syntheticGroupMatrix(): Record<string, GroupStandingRow[]> {
  const draw = loadGroupDraw();
  const result: Record<string, GroupStandingRow[]> = {};
  for (const [code, names] of Object.entries(draw)) {
    result[code] = names.map((name, i) => ({
      teamId: `${code}-${i}`,
      teamName: name,
      played: 3,
      won: 3 - i,
      drawn: 0,
      lost: i,
      goalsFor: 6 - i,
      goalsAgainst: i,
      goalDifference: 6 - 2 * i,
      points: (3 - i) * 3,
      rank: i + 1,
    }));
  }
  return result;
}

describe("knockout bracket", () => {
  it("loads 32 knockout matches (73–104)", () => {
    expect(loadKnockoutBracket()).toHaveLength(32);
  });

  it("resolves all 16 R32 ties when standings and allocation are complete", () => {
    if (!hasAllocationMatrix()) return;
    const groupMatrix = syntheticGroupMatrix();
    const advancing = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const r32 = resolveR32Participants(advancing, groupMatrix);
    expect(r32).toHaveLength(16);
    expect(r32[0].homeTeam.teamName).toBeTruthy();
    expect(r32[0].awayTeam.teamName).toBeTruthy();
  });
});

describe("simulateGroupStage", () => {
  it("applies predicted scores to scheduled fixtures", () => {
    const teamNames = new Map([
      ["mx", "Mexico"],
      ["za", "South Africa"],
    ]);
    const matches: WcMatchRow[] = [
      {
        id: "g1",
        date: "2026-06-11",
        time: "12:00",
        group_code: "A",
        status: "scheduled",
        home_team_id: "mx",
        away_team_id: "za",
        home_team_name: "Mexico",
        away_team_name: "South Africa",
        home_goals: null,
        away_goals: null,
      },
    ];
    const predictions = new Map([["g1", { predicted_score_home: 2, predicted_score_away: 0 }]]);
    const result = simulateGroupStage({ matches, teamNames, predictionsByMatchId: predictions });
    expect(result.matches[0].home_goals).toBe(2);
    expect(result.matches[0].away_goals).toBe(0);
    expect(result.matches[0].status).toBe("finished");
    expect(result.knockoutProjection.advancingThirdGroups).toHaveLength(8);
  });

  it("pins finished results over predictions", () => {
    const teamNames = new Map([["mx", "Mexico"], ["za", "South Africa"]]);
    const matches: WcMatchRow[] = [
      {
        id: "g1",
        date: "2026-06-11",
        time: "12:00",
        group_code: "A",
        status: "finished",
        home_team_id: "mx",
        away_team_id: "za",
        home_team_name: "Mexico",
        away_team_name: "South Africa",
        home_goals: 1,
        away_goals: 1,
      },
    ];
    const predictions = new Map([["g1", { predicted_score_home: 3, predicted_score_away: 0 }]]);
    const result = simulateGroupStage({ matches, teamNames, predictionsByMatchId: predictions });
    expect(result.matches[0].home_goals).toBe(1);
    expect(result.matches[0].away_goals).toBe(1);
  });
});

describe("allocation integration", () => {
  it("matrix slots align with R32 third_for definitions", () => {
    if (!hasAllocationMatrix()) return;
    const advancing = ["E", "F", "G", "H", "I", "J", "K", "L"];
    const slots = assignKnockoutOpponents(advancing);
    const groupMatrix = syntheticGroupMatrix();
    const r32 = resolveR32Participants(advancing, groupMatrix);
    const m74 = r32.find((m) => m.match_number === 74);
    expect(m74?.homeTeam.slotLabel).toBe("1st Group E");
    const thirdSlot = slots["VS_1E"];
    expect(m74?.awayTeam.slotLabel).toBe(
      `3rd Group ${thirdSlot.replace(/^3/i, "").toUpperCase()}`
    );
  });
});

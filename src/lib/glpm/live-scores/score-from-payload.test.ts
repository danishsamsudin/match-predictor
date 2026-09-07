import { describe, expect, it } from "vitest";
import type { SmScore } from "@/lib/sportmonks/types";
import { currentGoalsFromScores } from "./score-from-payload";

function score(
  participantId: number,
  description: string,
  goals: number
): SmScore {
  return {
    id: participantId,
    fixture_id: 1,
    type_id: 1,
    participant_id: participantId,
    score: { goals, participant: "home" },
    description,
  };
}

describe("currentGoalsFromScores", () => {
  it("prefers CURRENT over earlier 1ST_HALF rows (Udinese FT bug)", () => {
    // SportMonks often lists 1ST_HALF before CURRENT; find() would freeze FT at 0-0.
    const scores = [
      score(346, "1ST_HALF", 0),
      score(43, "1ST_HALF", 0),
      score(346, "2ND_HALF", 1),
      score(43, "2ND_HALF", 2),
      score(346, "CURRENT", 1),
      score(43, "CURRENT", 2),
    ];
    expect(currentGoalsFromScores(scores, 346)).toBe(1); // Udinese home
    expect(currentGoalsFromScores(scores, 43)).toBe(2); // Lazio away
  });

  it("falls back to FULLTIME then 2ND_HALF when CURRENT is missing", () => {
    const scores = [
      score(1, "1ST_HALF", 0),
      score(1, "2ND_HALF", 3),
      score(1, "FULLTIME", 3),
    ];
    expect(currentGoalsFromScores(scores, 1)).toBe(3);
  });
});

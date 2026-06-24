import { describe, expect, it } from "vitest";
import {
  computeWcSuspendedPlayerNames,
  isPlayerNameSuspended,
  wcPlayerNamesMatch,
  type WcPlayerMatchDiscipline,
} from "@/lib/world-cup/wc-tournament-discipline";
import { DEFAULT_TOURNAMENT_DISCIPLINE_RULES } from "@/lib/config/tournament-rules";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function matchRow(id: string, date: string, round: string | null = "GS"): WcMatchRow {
  return {
    id,
    date,
    time: null,
    group_code: round === "GS" ? "A" : null,
    round,
    status: "finished",
    home_team_id: "4792",
    away_team_id: "other",
    home_goals: 1,
    away_goals: 0,
    home_team_name: "Qatar",
    away_team_name: "Opponent",
  };
}

function cardRow(
  matchId: string,
  date: string,
  playerName: string,
  yellows: number,
  reds = 0
): WcPlayerMatchDiscipline {
  return {
    matchId,
    matchDate: date,
    round: "GS",
    playerName,
    optaPlayerId: `opta-${playerName}`,
    yellows,
    reds,
  };
}

describe("wc-tournament-discipline", () => {
  it("matches player names with last-name fallback", () => {
    expect(wcPlayerNamesMatch("Almoez Ali", "Ali")).toBe(true);
    expect(isPlayerNameSuspended("Almoez Ali", new Set(["Ali"]))).toBe(true);
  });

  it("suspends after straight red in prior match", () => {
    const prior = [matchRow("m1", "2026-06-15")];
    const history = [cardRow("m1", "2026-06-15", "Hassan Al Haydos", 0, 1)];
    const suspended = computeWcSuspendedPlayerNames({
      priorMatches: prior,
      disciplineHistory: history,
      rules: DEFAULT_TOURNAMENT_DISCIPLINE_RULES,
    });
    expect(suspended.has("Hassan Al Haydos")).toBe(true);
  });

  it("suspends after two yellows across matches", () => {
    const prior = [matchRow("m1", "2026-06-15"), matchRow("m2", "2026-06-20")];
    const history = [
      cardRow("m1", "2026-06-15", "Akram Afif", 1),
      cardRow("m2", "2026-06-20", "Akram Afif", 1),
    ];
    const suspended = computeWcSuspendedPlayerNames({
      priorMatches: prior,
      disciplineHistory: history,
      rules: DEFAULT_TOURNAMENT_DISCIPLINE_RULES,
    });
    expect(suspended.has("Akram Afif")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { computeXgEloFromMatches } from "@/lib/world-cup/graham-xg-elo";
import {
  computeWctrFromMatches,
  WCTR_DEFAULT_RATING,
} from "@/lib/world-cup/graham-tournament-rating";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

const teamIds = [4711, 55827];
const teamNames = new Map([
  [4711, "Germany"],
  [55827, "Curaçao"],
]);

describe("computeWctrFromMatches", () => {
  it("ignores friendlies that move xG-Elo", () => {
    const friendly: InternationalFormMatch = {
      date: "2026-01-10",
      home_team_id: "4711",
      away_team_id: "55827",
      home_goals: 0,
      home_xg: 2.5,
      away_goals: 1,
      away_xg: 0.4,
      competition: "Int. Friendly Games",
    };

    const xgElo = computeXgEloFromMatches([friendly], teamIds, teamNames);
    const wctr = computeWctrFromMatches([friendly], teamIds, teamNames);

    expect(xgElo.get(4711)!).toBeGreaterThan(xgElo.get(55827)!);
    expect(wctr.get(4711)).toBe(WCTR_DEFAULT_RATING);
    expect(wctr.get(55827)).toBe(WCTR_DEFAULT_RATING);
    expect(Math.round(xgElo.get(4711)!)).not.toBe(Math.round(wctr.get(4711)!));
  });

  it("diverges from xG-Elo when friendlies and WCQ are combined", () => {
    const matches: InternationalFormMatch[] = [
      {
        date: "2026-01-10",
        home_team_id: "4711",
        away_team_id: "55827",
        home_goals: 0,
        home_xg: 2.5,
        away_goals: 1,
        away_xg: 0.4,
        competition: "Int. Friendly Games",
      },
      {
        date: "2026-02-01",
        home_team_id: "4711",
        away_team_id: "55827",
        home_goals: 3,
        home_xg: 2.8,
        away_goals: 0,
        away_xg: 0.5,
        competition: "WCQ",
      },
    ];

    const xgElo = computeXgEloFromMatches(matches, teamIds, teamNames);
    const wctr = computeWctrFromMatches(matches, teamIds, teamNames);

    expect(Math.abs(xgElo.get(4711)! - wctr.get(4711)!)).toBeGreaterThan(20);
    expect(wctr.get(4711)!).toBeGreaterThan(wctr.get(55827)!);
  });
});

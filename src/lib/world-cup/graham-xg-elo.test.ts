import { describe, expect, it } from "vitest";
import {
  applyXgEloMatchUpdates,
  resolveEloParticipantId,
  XG_ELO_DEFAULT_RATING,
} from "@/lib/world-cup/graham-xg-elo";
import {
  computeWctrFromMatches,
  WCTR_DEFAULT_RATING,
} from "@/lib/world-cup/graham-tournament-rating";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

describe("resolveEloParticipantId", () => {
  it("resolves WC teams from UUID rows via name", () => {
    expect(resolveEloParticipantId("1862c019", "England")).toBe(4713);
    expect(resolveEloParticipantId("9349828d", "Ghana")).toBe(4764);
  });

  it("assigns stable pseudo ids for non-WC opponents", () => {
    const a = resolveEloParticipantId("b44b9eb7", "Albania");
    const b = resolveEloParticipantId("b44b9eb7", "Albania");
    expect(a).toBeLessThan(0);
    expect(a).toBe(b);
  });
});

describe("applyXgEloMatchUpdates with UUID team ids", () => {
  const englandId = 4713;
  const teamIds = [englandId];
  const teamNames = new Map([[englandId, "England"]]);

  const wcqMatch: InternationalFormMatch = {
    date: "2025-11-13",
    home_team_id: "1862c019",
    away_team_id: "1d6f5c9b",
    home_team_name: "England",
    away_team_name: "Serbia",
    home_goals: 2,
    away_goals: 0,
    home_xg: 1.9,
    away_xg: 0.5,
    competition: "WCQ",
  };

  it("updates ratings when match rows use UUID ids", () => {
    const ratings = applyXgEloMatchUpdates([wcqMatch], teamIds, teamNames, {
      initialRating: () => XG_ELO_DEFAULT_RATING,
      matchK: () => 0.5,
    });
    expect(ratings.get(englandId)).not.toBe(XG_ELO_DEFAULT_RATING);
  });
});

describe("computeWctrFromMatches with UUID team ids", () => {
  it("diverges England from Ghana on tournament matches", () => {
    const matches: InternationalFormMatch[] = [
      {
        date: "2025-11-13",
        home_team_id: "1862c019",
        away_team_id: "1d6f5c9b",
        home_team_name: "England",
        away_team_name: "Serbia",
        home_goals: 2,
        away_goals: 0,
        home_xg: 1.9,
        away_xg: 0.5,
        competition: "WCQ",
      },
      {
        date: "2025-10-10",
        home_team_id: "9349828d",
        away_team_id: "abc12345",
        home_team_name: "Ghana",
        away_team_name: "Comoros",
        home_goals: 0,
        away_goals: 1,
        home_xg: 0.6,
        away_xg: 1.4,
        competition: "WCQ",
      },
    ];
    const teamIds = [4713, 4764];
    const teamNames = new Map([
      [4713, "England"],
      [4764, "Ghana"],
    ]);
    const wctr = computeWctrFromMatches(matches, teamIds, teamNames);
    expect(wctr.get(4713)).not.toBe(wctr.get(4764));
    expect(wctr.get(4713)!).toBeGreaterThan(WCTR_DEFAULT_RATING);
    expect(wctr.get(4764)!).toBeLessThan(WCTR_DEFAULT_RATING);
  });
});

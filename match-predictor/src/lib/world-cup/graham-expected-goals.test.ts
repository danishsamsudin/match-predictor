import { describe, expect, it } from "vitest";
import { computeXgEloFromMatches } from "@/lib/world-cup/graham-xg-elo";
import { resolveGrahamExpectedGoals } from "@/lib/world-cup/graham-expected-goals";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

describe("computeXgEloFromMatches", () => {
  it("raises rating for team that lost 1-0 but dominated xG", () => {
    const matches: InternationalFormMatch[] = [
      {
        date: "2026-01-10",
        home_team_id: "4711",
        away_team_id: "55827",
        home_goals: 0,
        home_xg: 2.5,
        away_goals: 1,
        away_xg: 0.4,
        competition: "Friendly",
      },
    ];
    const before = computeXgEloFromMatches(
      [],
      [4711, 55827],
      new Map([
        [4711, "Germany"],
        [55827, "Curaçao"],
      ])
    );
    const after = computeXgEloFromMatches(
      matches,
      [4711, 55827],
      new Map([
        [4711, "Germany"],
        [55827, "Curaçao"],
      ])
    );
    expect(after.get(4711)!).toBeGreaterThan(before.get(4711)!);
  });
});

describe("resolveGrahamExpectedGoals", () => {
  it("produces spread xG for talent and xG-Elo gaps", () => {
    const form: InternationalFormMatch[] = [
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

    const result = resolveGrahamExpectedGoals({
      homeTeamId: 4711,
      awayTeamId: 55827,
      homeName: "Germany",
      awayName: "Curaçao",
      homeFormMatches: form,
      awayFormMatches: [],
      allFormMatches: form,
      homeTalent: {
        squadValueEur: 900_000_000,
        talentRating: 0.8,
        scoutlystValueEur: null,
        transfermarktValueEur: null,
        source: "test",
      },
      awayTalent: {
        squadValueEur: 80_000_000,
        talentRating: -0.5,
        scoutlystValueEur: null,
        transfermarktValueEur: null,
        source: "test",
      },
      medianSquadValueEur: 200_000_000,
    });

    expect(result.homeXg).toBeGreaterThan(result.awayXg + 0.4);
    expect(result.deltaS).toBeGreaterThan(0);
    expect(result.snapshot.delta_xg_elo).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildTeamIdToGroupMap,
  inferGroupCodeFromDraw,
  isWorldCup2026TournamentFixture,
  resolveGroupCode,
} from "@/lib/world-cup/group-draw";
import { assignKnockoutOpponents, hasAllocationMatrix } from "@/lib/world-cup/knockout-allocation";
import { computeThirdPlaceWildcards } from "@/lib/world-cup/standings";
import { isActionableEdge, computeRawBetEdge } from "@/lib/world-cup/value-matrix";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";
import { buildRoundOf32Matchups } from "@/lib/world-cup/knockout-display";
import {
  buildBracketMatchPredictorUrl,
  buildNationalPredictorUrl,
  resolveNationalTeamApiId,
} from "@/lib/world-cup/predictor-prefill";
import type { ForecastMatchResult } from "@/lib/world-cup/tournament-simulation";
import fixtureVenueSchedule from "../../../data/world-cup-2026/fixture-venues.json";
import {
  listWorldCup2026Stadiums,
  resolveFixtureVenue,
} from "@/lib/world-cup/fixture-venues";
import {
  normalizePredictorVenueCity,
  resolveStadiumVenue,
} from "@/lib/world-cup/stadium-metadata";
import {
  dedupeWorldCupMatches,
  filterWorldCup2026GroupStageMatches,
} from "@/lib/world-cup/tournament-fixtures";
import type { WcMatchRow } from "@/lib/world-cup/standings";

describe("group draw inference", () => {
  it("assigns group when both teams share a group in the official draw", () => {
    const teamNames = new Map([
      ["mx", "Mexico"],
      ["za", "South Africa"],
      ["br", "Brazil"],
      ["ma", "Morocco"],
    ]);
    const teamToGroup = buildTeamIdToGroupMap(teamNames);
    expect(inferGroupCodeFromDraw("mx", "za", teamToGroup)).toBe("A");
    expect(inferGroupCodeFromDraw("br", "ma", teamToGroup)).toBe("C");
    expect(inferGroupCodeFromDraw("mx", "br", teamToGroup)).toBeNull();
  });

  it("resolves group for FIFA World Cup 2026 schedule rows", () => {
    const teamNames = new Map([
      ["usa", "USA"],
      ["py", "Paraguay"],
    ]);
    const teamToGroup = buildTeamIdToGroupMap(teamNames);
    expect(
      resolveGroupCode({
        existing: null,
        competition: "FIFA World Cup 2026",
        round: null,
        date: "2026-06-15",
        homeTeamId: "usa",
        awayTeamId: "py",
        teamToGroup,
      })
    ).toBe("D");
  });

  it("skips WCQ rows without explicit group text", () => {
    const teamNames = new Map([
      ["mx", "Mexico"],
      ["za", "South Africa"],
    ]);
    const teamToGroup = buildTeamIdToGroupMap(teamNames);
    expect(
      resolveGroupCode({
        existing: null,
        competition: "WCQ — CONCACAF (M)",
        round: null,
        date: "2025-03-01",
        homeTeamId: "mx",
        awayTeamId: "za",
        teamToGroup,
      })
    ).toBeNull();
  });

  it("accepts FBref schedule competition labels in tournament window", () => {
    expect(isWorldCup2026TournamentFixture("FIFA World Cup 2026", "2026-06-20")).toBe(true);
    expect(isWorldCup2026TournamentFixture("World Cup", "2026-06-20")).toBe(true);
    expect(isWorldCup2026TournamentFixture(null, "2026-06-20")).toBe(false);
    expect(isWorldCup2026TournamentFixture("Friendlies (M)", "2026-06-20")).toBe(false);
    expect(isWorldCup2026TournamentFixture("World Cup", "2025-01-01")).toBe(false);
    expect(
      isWorldCup2026TournamentFixture("FIFA World Cup Qualification", "2026-06-20")
    ).toBe(false);
  });
});

describe("tournament fixture filter", () => {
  it("dedupes home/away reversed duplicates on the same date", () => {
    const rows = dedupeWorldCupMatches([
      {
        id: "abc123",
        date: "2026-06-15",
        time: "18:00",
        competition: "FIFA World Cup 2026",
        home_team_id: "usa",
        away_team_id: "py",
        status: "scheduled",
      },
      {
        id: "synthetic-uuid",
        date: "2026-06-15",
        time: null,
        competition: "Friendlies (M)",
        home_team_id: "py",
        away_team_id: "usa",
        status: "scheduled",
      },
    ] as WcMatchRow[]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("abc123");
  });

  it("prefers finished results when home/away duplicates share a date", () => {
    const rows = dedupeWorldCupMatches([
      {
        id: "scheduled-reversed",
        date: "2026-06-11",
        competition: "World Cup",
        home_team_id: "sa",
        away_team_id: "mx",
        home_goals: null,
        away_goals: null,
        status: "scheduled",
      },
      {
        id: "finished-official",
        date: "2026-06-11",
        competition: "World Cup",
        home_team_id: "mx",
        away_team_id: "sa",
        home_goals: 2,
        away_goals: 0,
        status: "finished",
      },
    ] as WcMatchRow[]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("finished-official");
  });

  it("drops cross-group pairings", () => {
    const teamNames = new Map([
      ["mx", "Mexico"],
      ["br", "Brazil"],
    ]);
    const teamToGroup = buildTeamIdToGroupMap(teamNames);
    const rows = filterWorldCup2026GroupStageMatches(
      [
        {
          id: "1",
          date: "2026-06-15",
          competition: "FIFA World Cup 2026",
          home_team_id: "mx",
          away_team_id: "br",
          status: "scheduled",
        },
        {
          id: "2",
          date: "2026-06-16",
          competition: "FIFA World Cup 2026",
          home_team_id: "mx",
          away_team_id: "za",
          status: "scheduled",
        },
      ] as WcMatchRow[],
      teamToGroup
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].home_team_id).toBe("mx");
    expect(rows[0].away_team_id).toBe("za");
  });
});

describe("computeThirdPlaceWildcards", () => {
  it("marks top 8 as will_advance", () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      teamId: `t${i}`,
      groupCode: String.fromCharCode(65 + i),
      points: 12 - i,
      goalDifference: 5 - i,
      goalsFor: 10 - i,
      fairPlayPoints: -i,
      fbrefTeamName: `Team ${i}`,
    }));
    const result = computeThirdPlaceWildcards(candidates);
    expect(result.filter((r) => r.will_advance)).toHaveLength(8);
    expect(result[0].will_advance).toBe(true);
    expect(result[11].will_advance).toBe(false);
  });
});

describe("assignKnockoutOpponents", () => {
  it("returns mapping for known combination", () => {
    if (!hasAllocationMatrix()) return;
    const map = assignKnockoutOpponents(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(Object.keys(map).length).toBeGreaterThan(0);
  });

  it("returns empty for invalid group count", () => {
    expect(assignKnockoutOpponents(["A", "B"])).toEqual({});
  });
});

describe("value matrix edges", () => {
  it("actionable only when raw positive and discrepancy > 2pp", () => {
    expect(isActionableEdge(0.05, 3)).toBe(true);
    expect(isActionableEdge(0.05, 1)).toBe(false);
    expect(isActionableEdge(-0.01, 5)).toBe(false);
  });

  it("raw bet edge formula", () => {
    expect(computeRawBetEdge(0.5, 2.2)).toBeCloseTo(0.1, 5);
  });
});

describe("buildRoundOf32Matchups", () => {
  it("resolves team names from group standings", () => {
    if (!hasAllocationMatrix()) return;
    const groupMatrix = {
      A: [
        { teamId: "1", teamName: "Mexico", rank: 1, points: 6, goalDifference: 2, played: 2, won: 2, drawn: 0, lost: 0, goalsFor: 4, goalsAgainst: 2 },
        { teamId: "2", teamName: "Korea", rank: 2, points: 3, goalDifference: 0, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 2 },
        { teamId: "3", teamName: "Czechia", rank: 3, points: 1, goalDifference: -1, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 1, goalsAgainst: 2 },
        { teamId: "4", teamName: "South Africa", rank: 4, points: 0, goalDifference: -1, played: 2, won: 0, drawn: 0, lost: 2, goalsFor: 1, goalsAgainst: 2 },
      ],
      E: [
        { teamId: "5", teamName: "Germany", rank: 1, points: 6, goalDifference: 3, played: 2, won: 2, drawn: 0, lost: 0, goalsFor: 5, goalsAgainst: 2 },
        { teamId: "6", teamName: "Ecuador", rank: 3, points: 3, goalDifference: 0, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 2 },
      ],
    } as Record<string, import("@/lib/world-cup/standings").GroupStandingRow[]>;
    const slots = assignKnockoutOpponents(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const matchups = buildRoundOf32Matchups(slots, groupMatrix, ["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(matchups.length).toBeGreaterThan(0);
    const m1a = matchups.find((m) => m.homeTeam === "Mexico");
    expect(m1a?.homeLabel).toMatch(/1st Group A/i);
  });
});

describe("World Cup 2026 stadiums", () => {
  it("lists 16 host stadiums", () => {
    expect(listWorldCup2026Stadiums()).toHaveLength(16);
  });

  it("resolves every FBref venue label to a host city", () => {
    const labels = [
      "Estadio Banorte (Neutral Site)",
      "Levi's Stadium (Neutral Site)",
      "Reliant Stadium (Neutral Site)",
      "AT&T Stadium (Neutral Site)",
      "GEHA Field at Arrowhead Stadium (Neutral Site)",
      "Estadio BBVA Bancomer (Neutral Site)",
    ];
    for (const label of labels) {
      expect(resolveStadiumVenue(label)?.city).toBeTruthy();
      expect(normalizePredictorVenueCity(label)).not.toBe("Neutral");
    }
  });

  it("assigns stadium by fixture teams and date", () => {
    const v = resolveFixtureVenue({
      date: "2026-06-11",
      homeName: "Mexico",
      awayName: "South Africa",
    });
    expect(v?.stadium).toBe("Estadio Azteca");
    expect(v?.city).toBe("Mexico City");
  });

  it("assigns all 72 group fixtures from the schedule file", () => {
    for (const f of fixtureVenueSchedule.fixtures) {
      const v = resolveFixtureVenue({
        date: f.date,
        homeName: f.home_team,
        awayName: f.away_team,
      });
      expect(v?.city, `${f.home_team} vs ${f.away_team}`).toBeTruthy();
      expect(v?.stadium).toBeTruthy();
    }
  });
});

describe("predictor prefill", () => {
  it("resolves WC national API ids", () => {
    expect(resolveNationalTeamApiId("Korea Republic")).toBe(4735);
    expect(resolveNationalTeamApiId("Czechia")).toBe(4714);
  });

  it("builds predictor URL with query params", () => {
    const url = buildNationalPredictorUrl({
      homeName: "Czechia",
      awayName: "South Korea",
      city: "Estadio Akron (Neutral Site)",
      date: "2026-06-20",
      time: "15:00",
      worldCupFixture: true,
    });
    expect(url).toContain("entity=national");
    expect(url).toContain("home=4714");
    expect(url).toContain("away=4735");
    expect(url).toContain("city=Guadalajara");

    const fallback = buildNationalPredictorUrl({
      homeName: "Czechia",
      awayName: "South Korea",
      worldCupFixture: true,
    });
    expect(fallback).toContain("city=Mexico+City");
    expect(url).toContain("homeName=Czechia");
  });

  it("builds bracket match predictor URL with venue and kickoff", () => {
    const match: ForecastMatchResult = {
      matchNumber: 104,
      round: "F",
      date: "2026-07-19",
      kickoffTime: "15:00",
      city: "New York",
      homeTeam: { teamId: "fr", teamName: "France" },
      awayTeam: { teamId: "ar", teamName: "Argentina" },
      homeGoals: 2,
      awayGoals: 1,
      winner: { teamId: "fr", teamName: "France" },
    };
    const url = buildBracketMatchPredictorUrl(match);
    expect(url).toContain("entity=national");
    expect(url).toContain("mode=compare");
    expect(url).toContain("homeName=France");
    expect(url).toContain("awayName=Argentina");
    expect(url).toContain("date=2026-07-19");
    expect(url).toContain("time=15%3A00");
    expect(url).toContain("city=New+York");
  });

  it("skips placeholder bracket matches", () => {
    const match: ForecastMatchResult = {
      matchNumber: 89,
      round: "R16",
      date: null,
      kickoffTime: null,
      city: null,
      homeTeam: { teamId: "h", teamName: "TBD" },
      awayTeam: { teamId: "a", teamName: "TBD" },
      homeGoals: 0,
      awayGoals: 0,
      winner: { teamId: "h", teamName: "TBD" },
    };
    expect(buildBracketMatchPredictorUrl(match)).toBeNull();
  });
});

describe("Dixon-Coles guarded grid", () => {
  it("keeps non-negative probabilities summing to 1", () => {
    const { cells, renormalized } = buildGuardedScoreMatrix(0.9, 0.85, -0.2, true);
    for (const c of cells) {
      expect(c.probability).toBeGreaterThanOrEqual(0);
    }
    const sum = cells.reduce((s, c) => s + c.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(typeof renormalized).toBe("boolean");
  });
});

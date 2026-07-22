import { describe, expect, it } from "vitest";
import { computeStandings } from "@/lib/glpm/compute-standings";

describe("computeStandings", () => {
  it("tallies W/D/L, goals, points, and ranks by Pts then GD then GF", () => {
    const rows = computeStandings(
      [
        {
          homeTeamSmId: 1,
          awayTeamSmId: 2,
          homeScore: 2,
          awayScore: 0,
          sortKey: "2026-08-01T15:00:00Z",
        },
        {
          homeTeamSmId: 2,
          awayTeamSmId: 3,
          homeScore: 1,
          awayScore: 1,
          sortKey: "2026-08-08T15:00:00Z",
        },
        {
          homeTeamSmId: 3,
          awayTeamSmId: 1,
          homeScore: 0,
          awayScore: 3,
          sortKey: "2026-08-15T15:00:00Z",
        },
      ],
      [
        { teamSmId: 1, teamName: "Alpha" },
        { teamSmId: 2, teamName: "Bravo" },
        { teamSmId: 3, teamName: "Charlie" },
      ]
    );

    expect(rows.map((r) => r.teamName)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(rows[0]).toMatchObject({
      rank: 1,
      played: 2,
      won: 2,
      drawn: 0,
      lost: 0,
      goalsFor: 5,
      goalsAgainst: 0,
      goalDifference: 5,
      points: 6,
    });
    expect(rows[1]).toMatchObject({
      rank: 2,
      played: 2,
      won: 0,
      drawn: 1,
      lost: 1,
      goalsFor: 1,
      goalsAgainst: 3,
      goalDifference: -2,
      points: 1,
    });
    expect(rows[2]).toMatchObject({
      rank: 3,
      points: 1,
      goalDifference: -3,
      goalsFor: 1,
    });
  });

  it("keeps seeded teams with zero matches and builds recent-first form", () => {
    const rows = computeStandings(
      [
        {
          homeTeamSmId: 10,
          awayTeamSmId: 20,
          homeScore: 1,
          awayScore: 0,
          sortKey: "2026-01-01",
        },
        {
          homeTeamSmId: 10,
          awayTeamSmId: 20,
          homeScore: 0,
          awayScore: 0,
          sortKey: "2026-01-08",
        },
        {
          homeTeamSmId: 20,
          awayTeamSmId: 10,
          homeScore: 2,
          awayScore: 1,
          sortKey: "2026-01-15",
        },
      ],
      [
        { teamSmId: 10, teamName: "Home FC" },
        { teamSmId: 20, teamName: "Away FC" },
        { teamSmId: 30, teamName: "Idle FC" },
      ]
    );

    const idle = rows.find((r) => r.teamSmId === 30);
    expect(idle).toMatchObject({
      played: 0,
      points: 0,
      form: [],
    });

    const home = rows.find((r) => r.teamSmId === 10)!;
    // Chronological: W, D, L → recent-first L, D, W
    expect(home.form).toEqual(["L", "D", "W"]);
  });
});

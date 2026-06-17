import { describe, expect, it } from "vitest";
import { applyCustomLineupsToTeamComparison } from "./apply-custom-lineups-to-comparison";
import type { FixtureLineup } from "@/lib/types/football";
import type { SquadPlayer, TeamComparisonSnapshot } from "@/lib/types/team-comparison";

function player(id: number, name: string): SquadPlayer {
  return {
    sofascorePlayerId: id,
    scoutlystPlayerKey: null,
    name,
    position: id === 1 ? "GK" : "MID",
    fieldPosition: null,
    performanceScore: 65,
    startSharePct: 80,
    detailStats: [],
    age: 26,
  };
}

function snapshot(): TeamComparisonSnapshot {
  const homeStarters = Array.from({ length: 11 }, (_, i) => player(i + 1, `Home ${i}`));
  const homeSubs = [player(20, "Home Sub")];
  const awayStarters = Array.from({ length: 11 }, (_, i) => player(100 + i, `Away ${i}`));
  const awaySubs = [player(120, "Away Sub")];

  return {
    home: {
      teamId: 1,
      teamName: "Home",
      leagueName: "Test",
      seasonStats: {
        formScorePct: null,
        form: null,
        goalsForPerGame: null,
        goalsAgainstPerGame: null,
        cornersPerGame: null,
        foulsPerGame: null,
        yellowCardsPerGame: null,
        redCardsPerGame: null,
        shotsOnTargetPerGame: null,
        preferredFormation: null,
        venueName: null,
        venueCapacity: null,
      },
      recentForm: [],
      players: [],
      squad: {
        starters: homeStarters,
        substitutes: homeSubs,
        hasLineupData: true,
        hasScoutlystData: false,
        squadSource: "lineups",
        preferredFormation: "4-3-3",
        snapshotDate: null,
      },
      insights: null,
    },
    away: {
      teamId: 2,
      teamName: "Away",
      leagueName: "Test",
      seasonStats: {
        formScorePct: null,
        form: null,
        goalsForPerGame: null,
        goalsAgainstPerGame: null,
        cornersPerGame: null,
        foulsPerGame: null,
        yellowCardsPerGame: null,
        redCardsPerGame: null,
        shotsOnTargetPerGame: null,
        preferredFormation: null,
        venueName: null,
        venueCapacity: null,
      },
      recentForm: [],
      players: [],
      squad: {
        starters: awayStarters,
        substitutes: awaySubs,
        hasLineupData: true,
        hasScoutlystData: false,
        squadSource: "lineups",
        preferredFormation: "4-4-2",
        snapshotDate: null,
      },
      insights: null,
    },
    fixtureContext: null,
  };
}

function lineup(
  teamId: number,
  teamName: string,
  ids: number[]
): FixtureLineup {
  return {
    team: { id: teamId, name: teamName },
    formation: "3-5-2",
    startXI: ids.map((id, i) => ({
      player: {
        id,
        name: `Player ${id}`,
        number: i + 1,
        pos: id === 1 || id === 100 ? "G" : "M",
        grid: null,
      },
    })),
    substitutes: [],
  };
}

describe("applyCustomLineupsToTeamComparison", () => {
  it("overrides starters with manual selection and moves others to bench", () => {
    const base = snapshot();
    const customLineups = [
      lineup(1, "Home", [20, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      lineup(2, "Away", [120, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]),
    ];

    const next = applyCustomLineupsToTeamComparison(base, customLineups);

    expect(next.home.squad.squadSource).toBe("manual");
    expect(next.home.squad.starters.map((p) => p.sofascorePlayerId)).toEqual(
      customLineups[0].startXI.map((s) => s.player.id)
    );
    expect(next.home.squad.starters[0].name).toBe("Home Sub");
    expect(next.home.squad.substitutes.some((p) => p.sofascorePlayerId === 1)).toBe(
      true
    );
    expect(next.away.squad.squadSource).toBe("manual");
    expect(next.away.squad.preferredFormation).toBe("3-5-2");
  });
});

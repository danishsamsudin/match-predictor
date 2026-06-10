import { describe, expect, it } from "vitest";
import {
  buildCustomLineupsFromSelections,
  isXiComplete,
  squadPlayersToFixtureLineup,
  squadPositionToLineupPos,
  xiHasGoalkeeper,
} from "./build-custom-lineup";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function player(
  id: number,
  name: string,
  position: SquadPlayer["position"]
): SquadPlayer {
  return {
    sofascorePlayerId: id,
    scoutlystPlayerKey: null,
    name,
    position,
    fieldPosition: null,
    performanceScore: 70,
    startSharePct: null,
    detailStats: [],
    age: 25,
  };
}

describe("build-custom-lineup", () => {
  it("maps squad positions to lineup pos codes", () => {
    expect(squadPositionToLineupPos("GK")).toBe("G");
    expect(squadPositionToLineupPos("DEF")).toBe("D");
    expect(squadPositionToLineupPos("MID")).toBe("M");
    expect(squadPositionToLineupPos("FWD")).toBe("F");
  });

  it("builds a fixture lineup with 11 starters and bench from roster", () => {
    const roster = [
      player(1, "Keeper", "GK"),
      ...Array.from({ length: 10 }, (_, i) =>
        player(i + 2, `Outfield ${i}`, "MID")
      ),
      player(12, "Sub", "FWD"),
    ];
    const lineup = squadPlayersToFixtureLineup(99, "England", "4-3-3", roster.slice(0, 11), roster);
    expect(lineup.startXI).toHaveLength(11);
    expect(lineup.startXI[0].player.pos).toBe("G");
    expect(lineup.substitutes).toHaveLength(1);
    expect(lineup.substitutes[0].player.id).toBe(12);
  });

  it("validates complete unique XI slots", () => {
    expect(isXiComplete(Array(11).fill(1))).toBe(false);
    expect(isXiComplete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe(true);
    expect(isXiComplete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null])).toBe(false);
  });

  it("detects goalkeeper in selected XI", () => {
    const roster = [player(1, "Keeper", "GK"), player(2, "Striker", "FWD")];
    expect(xiHasGoalkeeper([1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], roster)).toBe(true);
    expect(xiHasGoalkeeper([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], roster)).toBe(false);
  });

  it("builds home and away custom lineups from selections", () => {
    const homeRoster = Array.from({ length: 12 }, (_, i) =>
      player(100 + i, `H${i}`, i === 0 ? "GK" : "MID")
    );
    const awayRoster = Array.from({ length: 12 }, (_, i) =>
      player(200 + i, `A${i}`, i === 0 ? "GK" : "MID")
    );
    const lineups = buildCustomLineupsFromSelections(
      {
        teamId: 1,
        teamName: "Home",
        preferredFormation: "4-4-2",
        roster: homeRoster,
      },
      {
        teamId: 2,
        teamName: "Away",
        preferredFormation: "3-5-2",
        roster: awayRoster,
      },
      homeRoster.slice(0, 11).map((p) => p.sofascorePlayerId),
      awayRoster.slice(0, 11).map((p) => p.sofascorePlayerId)
    );
    expect(lineups).toHaveLength(2);
    expect(lineups[0].team.id).toBe(1);
    expect(lineups[0].formation).toBe("4-4-2");
    expect(lineups[0].startXI).toHaveLength(11);
    expect(lineups[1].team.id).toBe(2);
  });
});

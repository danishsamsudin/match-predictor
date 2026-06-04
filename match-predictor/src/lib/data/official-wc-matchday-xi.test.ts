import { describe, expect, it } from "vitest";
import type { LineupAppearanceAgg } from "@/lib/data/infer-usual-squad-from-lineups";
import {
  filterLineupToOfficialSquad,
  isPlayerOnOfficialSquad,
  pickOfficialWcMatchdayXi,
} from "./official-wc-matchday-xi";
import type { OfficialWcPlayer } from "./world-cup-2026-official-squads";

function agg(
  id: number,
  name: string,
  starts: number,
  position: string,
  subAppearances = 0
): LineupAppearanceAgg {
  const role = position === "GK" ? "G" : position === "DEF" ? "D" : position === "FWD" ? "F" : "M";
  return {
    sofascorePlayerId: id,
    name,
    position,
    fieldPosition: position,
    starts,
    subAppearances,
    startPositionCounts: starts > 0 ? { [role]: starts } : {},
  };
}

const officialSquad: OfficialWcPlayer[] = [
  { name: "Keeper One", position: "GK", dob: "01/01/1990", club: "A", heightCm: 190 },
  { name: "Defender A", position: "DEF", dob: "01/01/1992", club: "A", heightCm: 185 },
  { name: "Defender B", position: "DEF", dob: "01/01/1993", club: "A", heightCm: 185 },
  { name: "Defender C", position: "DEF", dob: "01/01/1994", club: "A", heightCm: 185 },
  { name: "Defender D", position: "DEF", dob: "01/01/1995", club: "A", heightCm: 185 },
  { name: "Midfielder A", position: "MID", dob: "01/01/1996", club: "A", heightCm: 180 },
  { name: "Midfielder B", position: "MID", dob: "01/01/1997", club: "A", heightCm: 180 },
  { name: "Midfielder C", position: "MID", dob: "01/01/1998", club: "A", heightCm: 180 },
  { name: "Forward A", position: "FWD", dob: "01/01/1999", club: "A", heightCm: 175 },
  { name: "Forward B", position: "FWD", dob: "01/01/2000", club: "A", heightCm: 175 },
  { name: "Forward C", position: "FWD", dob: "01/01/2001", club: "A", heightCm: 175 },
  { name: "Bench Star", position: "FWD", dob: "01/01/2002", club: "A", heightCm: 175 },
  { name: "Outside Squad", position: "MID", dob: "01/01/2003", club: "B", heightCm: 180 },
];

describe("official-wc-matchday-xi", () => {
  it("filters lineup players to the official 26", () => {
    const keys = new Set(["keeper one", "defender a"]);
    expect(isPlayerOnOfficialSquad("Keeper One", keys)).toBe(true);
    expect(
      filterLineupToOfficialSquad(
        [agg(1, "Keeper One", 5, "GK"), agg(2, "Not Listed", 5, "MID")],
        keys
      )
    ).toHaveLength(1);
  });

  it("picks frequent starters over high-quality bench forwards", () => {
    const lineup = [
      agg(1, "Keeper One", 10, "GK"),
      agg(2, "Defender A", 10, "DEF"),
      agg(3, "Defender B", 10, "DEF"),
      agg(4, "Defender C", 10, "DEF"),
      agg(5, "Defender D", 10, "DEF"),
      agg(6, "Midfielder A", 10, "MID"),
      agg(7, "Midfielder B", 10, "MID"),
      agg(8, "Midfielder C", 10, "MID"),
      agg(9, "Forward A", 10, "FWD"),
      agg(10, "Forward B", 9, "FWD"),
      agg(11, "Forward C", 8, "FWD"),
      agg(12, "Bench Star", 1, "FWD", 6),
    ];

    const qualityById = new Map<number, number>([
      [10, 60],
      [11, 55],
      [12, 99],
    ]);

    const { starters, squadSource } = pickOfficialWcMatchdayXi({
      officialPlayers: officialSquad,
      lineupPlayers: lineup,
      lineupPreferredFormation: "4-3-3",
      storedFormation: null,
      formationDefault: "4-3-3",
      qualityById,
      teamLabel: "Testland",
      scoutlystByName: new Map(),
    });

    expect(squadSource).toBe("lineups");
    const names = starters.map((p) => p.name);
    expect(names).toContain("Forward B");
    expect(names).toContain("Forward C");
    expect(names).not.toContain("Bench Star");
  });

  it("does not promote sub-only players when requireStarts is used", () => {
    const lineup = [
      agg(1, "Keeper One", 10, "GK"),
      agg(2, "Defender A", 10, "DEF"),
      agg(3, "Defender B", 10, "DEF"),
      agg(4, "Defender C", 10, "DEF"),
      agg(5, "Defender D", 10, "DEF"),
      agg(6, "Midfielder A", 10, "MID"),
      agg(7, "Midfielder B", 10, "MID"),
      agg(8, "Midfielder C", 10, "MID"),
      agg(9, "Forward A", 10, "FWD"),
      agg(10, "Forward B", 9, "FWD"),
      agg(11, "Forward C", 8, "FWD"),
      agg(12, "Bench Star", 0, "FWD", 12),
    ];

    const { starters } = pickOfficialWcMatchdayXi({
      officialPlayers: officialSquad,
      lineupPlayers: lineup,
      lineupPreferredFormation: "4-3-3",
      storedFormation: null,
      formationDefault: "4-3-3",
      qualityById: new Map([[12, 99]]),
      teamLabel: "Testland",
      scoutlystByName: new Map(),
    });

    expect(starters.map((p) => p.name)).not.toContain("Bench Star");
  });
});

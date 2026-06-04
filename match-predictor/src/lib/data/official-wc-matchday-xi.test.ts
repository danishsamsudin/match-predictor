import { describe, expect, it } from "vitest";
import type { LineupAppearanceAgg } from "@/lib/data/infer-usual-squad-from-lineups";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";
import {
  filterLineupToOfficialSquad,
  isPlayerOnOfficialSquad,
  pickOfficialWcMatchdayXi,
} from "./official-wc-matchday-xi";
import {
  OFFICIAL_WC_2026_SQUADS,
  getOfficialWcTeamSquad,
  type OfficialWcPlayer,
} from "./world-cup-2026-official-squads";

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
    startSubRoleCounts: {},
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

  it("picks frequent starters over high-quality bench forwards", async () => {
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

    const { starters, squadSource } = await pickOfficialWcMatchdayXi({
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

  it("does not promote sub-only players when requireStarts is used", async () => {
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

    const { starters } = await pickOfficialWcMatchdayXi({
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

  it("keeps exactly one goalkeeper when three are ranked into the XI", async () => {
    const lineup = [
      agg(1, "Keeper One", 10, "GK"),
      agg(2, "Keeper Two", 9, "GK"),
      agg(3, "Keeper Three", 8, "GK"),
      agg(4, "Defender A", 10, "DEF"),
      agg(5, "Defender B", 10, "DEF"),
      agg(6, "Defender C", 10, "DEF"),
      agg(7, "Defender D", 10, "DEF"),
      agg(8, "Midfielder A", 10, "MID"),
      agg(9, "Midfielder B", 10, "MID"),
      agg(10, "Midfielder C", 10, "MID"),
      agg(11, "Forward A", 10, "FWD"),
      agg(12, "Forward B", 9, "FWD"),
      agg(13, "Forward C", 8, "FWD"),
    ];
    const threeKeepers: OfficialWcPlayer[] = [
      { name: "Keeper One", position: "GK", dob: "01/01/1990", club: "A", heightCm: 190 },
      { name: "Keeper Two", position: "GK", dob: "01/01/1991", club: "A", heightCm: 190 },
      { name: "Keeper Three", position: "GK", dob: "01/01/1992", club: "A", heightCm: 190 },
      ...officialSquad.slice(1),
    ];

    const { starters } = await pickOfficialWcMatchdayXi({
      officialPlayers: threeKeepers,
      lineupPlayers: lineup,
      lineupPreferredFormation: "4-3-3",
      storedFormation: null,
      formationDefault: "4-3-3",
      qualityById: new Map(),
      teamLabel: "Testland",
      scoutlystByName: new Map(),
    });

    const gkCount = starters.filter((p) => p.position === "GK").length;
    expect(gkCount).toBe(1);
    expect(starters.map((p) => p.name)).toContain("Keeper One");
  });

  it("adds a goalkeeper when the predicted XI has none", async () => {
    const lineup = [
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
      agg(99, "Keeper One", 2, "MID"),
    ];

    const { starters } = await pickOfficialWcMatchdayXi({
      officialPlayers: officialSquad,
      lineupPlayers: lineup,
      lineupPreferredFormation: "4-3-3",
      storedFormation: null,
      formationDefault: "4-3-3",
      qualityById: new Map([[99, 40], [1, 95]]),
      teamLabel: "Testland",
      scoutlystByName: new Map(),
    });

    expect(starters.map((p) => p.name)).toContain("Keeper One");
    expect(starters.filter((p) => p.position === "GK")).toHaveLength(1);
  });

  it("predicts exactly one goalkeeper for every official World Cup 2026 squad", async () => {
    for (const teamLabel of Object.keys(OFFICIAL_WC_2026_SQUADS.teams)) {
      const official = getOfficialWcTeamSquad(teamLabel);
      expect(official, teamLabel).toBeTruthy();

      const { starters } = await pickOfficialWcMatchdayXi({
        officialPlayers: official!.players,
        lineupPlayers: [],
        lineupPreferredFormation: "4-3-3",
        storedFormation: null,
        formationDefault: "4-3-3",
        qualityById: new Map(),
        teamLabel,
        scoutlystByName: new Map(),
      });

      expect(starters, teamLabel).toHaveLength(11);
      const gkCount = starters.filter(
        (p) => normalizePlayerPosition(p.position) === "G"
      ).length;
      expect(gkCount, teamLabel).toBe(1);
    }
  });

  it("caps multiple lineup goalkeepers to one for every official World Cup 2026 squad", async () => {
    for (const teamLabel of Object.keys(OFFICIAL_WC_2026_SQUADS.teams)) {
      const official = getOfficialWcTeamSquad(teamLabel)!;
      const keepers = official.players.filter((p) => p.position === "GK");
      expect(keepers.length, teamLabel).toBeGreaterThanOrEqual(1);

      const lineup: LineupAppearanceAgg[] = official.players.map((player, index) =>
        agg(index + 1, player.name, player.position === "GK" ? 9 : 6, player.position)
      );

      const { starters } = await pickOfficialWcMatchdayXi({
        officialPlayers: official.players,
        lineupPlayers: lineup,
        lineupPreferredFormation: "4-2-3-1",
        storedFormation: null,
        formationDefault: "4-2-3-1",
        qualityById: new Map(
          keepers.map((k, i) => [lineup.find((p) => p.name === k.name)!.sofascorePlayerId, 90 - i])
        ),
        teamLabel,
        scoutlystByName: new Map(),
      });

      const gkCount = starters.filter(
        (p) => normalizePlayerPosition(p.position) === "G"
      ).length;
      expect(gkCount, teamLabel).toBe(1);
    }
  });
});

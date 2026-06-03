import { describe, expect, it } from "vitest";
import { pickSquadFromRecords, squadPickRecordFromStats } from "./pick-squad-from-records";

describe("pickSquadFromRecords", () => {
  it("picks high-minute defenders ahead of misclassified midfielders", () => {
    const squad = [
      squadPickRecordFromStats({
        id: "gk",
        name: "Keeper",
        position: "GK",
        stats: { minutes: 720, games_starts: 8 },
      }),
      squadPickRecordFromStats({
        id: "vvd",
        name: "Virgil van Dijk",
        position: "DF",
        stats: { minutes: 720, games_starts: 8, interceptions: 9 },
      }),
      squadPickRecordFromStats({
        id: "d2",
        name: "Defender Two",
        position: "DF",
        stats: { minutes: 600, games_starts: 7 },
      }),
      squadPickRecordFromStats({
        id: "d3",
        name: "Defender Three",
        position: "DF",
        stats: { minutes: 500, games_starts: 6 },
      }),
      squadPickRecordFromStats({
        id: "d4",
        name: "Defender Four",
        position: "DF",
        stats: { minutes: 400, games_starts: 5 },
      }),
      squadPickRecordFromStats({
        id: "m1",
        name: "Mid One",
        position: "MF",
        stats: { minutes: 650, games_starts: 8 },
      }),
      squadPickRecordFromStats({
        id: "m2",
        name: "Mid Two",
        position: "MF",
        stats: { minutes: 600, games_starts: 7 },
      }),
      squadPickRecordFromStats({
        id: "m3",
        name: "Mid Three",
        position: "MF",
        stats: { minutes: 550, games_starts: 6 },
      }),
      squadPickRecordFromStats({
        id: "f1",
        name: "Fwd One",
        position: "FW",
        stats: { minutes: 600, games_starts: 7, goals: 5 },
      }),
      squadPickRecordFromStats({
        id: "f2",
        name: "Fwd Two",
        position: "FW",
        stats: { minutes: 500, games_starts: 6, goals: 3 },
      }),
      squadPickRecordFromStats({
        id: "f3",
        name: "Fwd Three",
        position: "FW",
        stats: { minutes: 400, games_starts: 5, goals: 2 },
      }),
    ];

    const { starters } = pickSquadFromRecords(squad, "4-3-3");
    const names = starters.map((p) => p.name);
    expect(names).toContain("Virgil van Dijk");
    expect(names.filter((n) => n.startsWith("Defender")).length).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import {
  dedupeSquadRosterByPlayerIdentity,
  mergeSquadPlayerRows,
} from "@/lib/data/dedupe-squad-roster";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function player(
  partial: Partial<SquadPlayer> & Pick<SquadPlayer, "sofascorePlayerId" | "name">
): SquadPlayer {
  return {
    scoutlystPlayerKey: null,
    position: "DEF",
    fieldPosition: null,
    performanceScore: null,
    startSharePct: null,
    detailStats: [],
    age: null,
    ...partial,
  };
}

describe("mergeSquadPlayerRows", () => {
  it("keeps ratings from the short SofaScore row and the fuller official name", () => {
    const short = player({
      sofascorePlayerId: 101,
      name: "F. Bjorkan",
      position: "SUB",
      performanceScore: 75,
      detailStats: [{ label: "Apps", value: "12" }],
    });
    const full = player({
      sofascorePlayerId: -42,
      scoutlystPlayerKey: "wc2026:Norway:fredrik andre bjorkan",
      name: "Fredrik Andre Fredrik André Bjorkan",
      position: "DEF",
      performanceScore: null,
    });

    const merged = mergeSquadPlayerRows(short, full);
    expect(merged.sofascorePlayerId).toBe(101);
    expect(merged.name).toBe("Fredrik André Bjorkan");
    expect(merged.position).toBe("DEF");
    expect(merged.performanceScore).toBe(75);
    expect(merged.detailStats).toEqual([{ label: "Apps", value: "12" }]);
  });
});

describe("dedupeSquadRosterByPlayerIdentity", () => {
  it("merges short and full names for the same player", () => {
    const out = dedupeSquadRosterByPlayerIdentity([
      player({
        sofascorePlayerId: 1,
        name: "L. Østigård",
        position: "SUB",
        performanceScore: 75,
      }),
      player({
        sofascorePlayerId: -9,
        scoutlystPlayerKey: "wc2026:Norway:leo ostigard",
        name: "Leo Skiri Østigård",
        position: "DEF",
      }),
      player({
        sofascorePlayerId: 2,
        name: "Erling Haaland",
        position: "FWD",
        performanceScore: 91,
      }),
    ]);

    expect(out).toHaveLength(2);
    const ostigard = out.find((p) => /stig/i.test(p.name))!;
    expect(ostigard.performanceScore).toBe(75);
    expect(ostigard.name.toLowerCase()).toContain("leo");
    expect(ostigard.position).toBe("DEF");
  });
});

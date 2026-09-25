import { describe, expect, it } from "vitest";
import { enrichSquadPlayersWithClubScoutlyst } from "@/lib/data/enrich-squad-with-club-scoutlyst";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function synthetic(name: string, id: number): SquadPlayer {
  return {
    sofascorePlayerId: id,
    scoutlystPlayerKey: `bulinews:Georgia:${id}:${name}`,
    name,
    position: "FWD",
    fieldPosition: "LW",
    performanceScore: null,
    startSharePct: 100,
    detailStats: [],
    age: null,
  };
}

describe("enrichSquadPlayersWithClubScoutlyst", () => {
  it("returns players unchanged when supabase is null", async () => {
    const players = [synthetic("Kvaratskhelia", 1)];
    const next = await enrichSquadPlayersWithClubScoutlyst(null, players);
    expect(next).toEqual(players);
  });
});

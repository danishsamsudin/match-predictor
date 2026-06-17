import { describe, expect, it } from "vitest";
import {
  dedupeSquadPlayersById,
  pickUniqueStarters,
} from "@/lib/data/dedupe-squad-players";
import { resolveSofifaSquadPlayerId } from "@/lib/data/load-sofifa-wc-squad-for-comparison";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function player(id: number, name: string): SquadPlayer {
  return {
    sofascorePlayerId: id,
    scoutlystPlayerKey: null,
    name,
    position: "MID",
    fieldPosition: "CM",
    performanceScore: 70,
    startSharePct: null,
    detailStats: [],
    age: 25,
  };
}

describe("dedupeSquadPlayersById", () => {
  it("removes duplicate ids and normalized names", () => {
    const out = dedupeSquadPlayersById([
      player(1, "Harry Kane"),
      player(1, "Harry Kane"),
      player(2, "Harry Kane"),
      player(3, "Marcus Rashford"),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.name)).toEqual(["Harry Kane", "Marcus Rashford"]);
  });
});

describe("pickUniqueStarters", () => {
  it("returns 11 unique starters and backfills from pool", () => {
    const starters = [player(1, "A"), player(1, "A"), player(2, "B")];
    const pool = [
      player(3, "C"),
      player(4, "D"),
      player(5, "E"),
      player(6, "F"),
      player(7, "G"),
      player(8, "H"),
      player(9, "I"),
      player(10, "J"),
      player(11, "K"),
      player(12, "L"),
    ];
    const xi = pickUniqueStarters(starters, pool, 11);
    expect(xi).toHaveLength(11);
    expect(new Set(xi.map((p) => p.sofascorePlayerId)).size).toBe(11);
  });
});

describe("resolveSofifaSquadPlayerId", () => {
  it("never assigns the same scout id to two players", () => {
    const claimed = new Set<number>();
    const scout = {
      scoutlyst_player_key: "s1",
      player_name: "Shared Scout Row",
      sofascore_player_id: 999,
      position: "MID",
      age: 24,
      rating: 7,
      stats: {},
      snapshot_date: "2026-01-01",
      reference_league_id: 1,
    };

    const first = resolveSofifaSquadPlayerId({
      sofifaPlayerId: 101,
      displayName: "Player One",
      teamLabel: "England",
      scout,
      claimedScoutIds: claimed,
    });
    const second = resolveSofifaSquadPlayerId({
      sofifaPlayerId: 102,
      displayName: "Player Two",
      teamLabel: "England",
      scout,
      claimedScoutIds: claimed,
    });

    expect(first).toBe(999);
    expect(second).not.toBe(999);
    expect(first).not.toBe(second);
  });
});

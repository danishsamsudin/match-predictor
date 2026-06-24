import { describe, expect, it } from "vitest";
import { extractCardFeatures } from "./ml-feature-extractor";
import type { FixtureLineup } from "@/lib/types/football";
import type { SportApiEvent, SportApiIncidentsResponse } from "@/lib/types/sportapi";

function lineup(teamId: number, starterIds: number[], subIds: number[] = []): FixtureLineup {
  return {
    team: { id: teamId, name: `Team ${teamId}` },
    formation: "4-3-3",
    startXI: starterIds.map((id, i) => ({
      player: {
        id,
        name: `Starter ${id}`,
        number: i + 1,
        pos: i === 0 ? "G" : i < 5 ? "D" : i < 8 ? "M" : "F",
        grid: null,
        performanceScore: id === 10 ? 85 : 65,
      },
    })),
    substitutes: subIds.map((id, i) => ({
      player: {
        id,
        name: `Sub ${id}`,
        number: 12 + i,
        pos: "M",
        grid: null,
        performanceScore: 60,
      },
    })),
  };
}

describe("extractCardFeatures", () => {
  const homeId = 1;
  const awayId = 2;
  const tournamentId = 16;

  function event(id: number, home: number, away: number, ts: number): SportApiEvent {
    return {
      id,
      startTimestamp: ts,
      homeTeam: { id: home, name: "H" },
      awayTeam: { id: away, name: "A" },
      tournament: {
        id: tournamentId,
        name: "World Cup",
        uniqueTournament: { id: tournamentId, name: "FIFA World Cup" },
      },
      season: { id: 1 },
      status: { type: "finished" },
    };
  }

  it("outputs flattened ML features from suspensions and card history", () => {
    const e1 = event(1, homeId, 99, 1000);
    const e2 = event(2, homeId, awayId, 2000);
    const incidents = new Map<number, SportApiIncidentsResponse>([
      [
        1,
        {
          incidents: [
            {
              incidentType: "yellowCard",
              time: 10,
              isHome: true,
              player: { id: 10, name: "Star" },
            },
          ],
        },
      ],
      [
        2,
        {
          incidents: [
            {
              incidentType: "yellowCard",
              time: 20,
              isHome: true,
              player: { id: 10, name: "Star" },
            },
            {
              incidentType: "redCard",
              time: 80,
              isHome: false,
              player: { id: 50, name: "Away Red" },
            },
          ],
        },
      ],
    ]);

    const lineups = [
      lineup(homeId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [20, 21]),
      lineup(awayId, [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]),
    ];

    const features = extractCardFeatures(homeId, awayId, [e1, e2], lineups, {
      incidentsByEventId: incidents,
      homeSuspendedPlayerIds: new Set([10]),
    });

    expect(features.home_key_players_suspended_count).toBe(1);
    expect(features.home_attack_lav_delta).toBeGreaterThan(0);
    expect(features.home_tournament_yellows_avg).toBeCloseTo(1, 1);
    expect(features.away_tournament_reds_total).toBe(1);
  });
});

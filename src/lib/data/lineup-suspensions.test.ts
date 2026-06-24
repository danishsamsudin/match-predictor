import { describe, expect, it } from "vitest";
import {
  computeTournamentSuspendedPlayerIds,
  redCardedPlayerIdsFromIncidents,
  yellowCardedPlayerIdsFromIncidents,
} from "@/lib/data/lineup-suspensions";
import { DEFAULT_TOURNAMENT_DISCIPLINE_RULES } from "@/lib/config/tournament-rules";
import type { SportApiEvent, SportApiIncidentsResponse } from "@/lib/types/sportapi";
import type { TournamentRound } from "@/lib/config/tournament-rules";

const TEAM_ID = 100;
const OPP_ID = 200;
const TOURNAMENT_ID = 16;

function finishedEvent(
  id: number,
  timestamp: number,
  homeId = TEAM_ID,
  awayId = OPP_ID
): SportApiEvent {
  return {
    id,
    startTimestamp: timestamp,
    homeTeam: { id: homeId, name: "Home" },
    awayTeam: { id: awayId, name: "Away" },
    tournament: {
      id: TOURNAMENT_ID,
      name: "World Cup",
      uniqueTournament: { id: TOURNAMENT_ID, name: "FIFA World Cup" },
    },
    season: { id: 1 },
    status: { type: "finished" },
  };
}

function yellowIncident(playerId: number, isHome = true) {
  return {
    incidentType: "yellowCard",
    time: 30,
    isHome,
    player: { id: playerId, name: `P${playerId}` },
  };
}

function redIncident(playerId: number, isHome = true) {
  return {
    incidentType: "redCard",
    time: 80,
    isHome,
    player: { id: playerId, name: `P${playerId}` },
  };
}

function secondYellowIncident(playerId: number, isHome = true) {
  return {
    incidentType: "yellowRedCard",
    time: 85,
    isHome,
    player: { id: playerId, name: `P${playerId}` },
  };
}

describe("redCardedPlayerIdsFromIncidents", () => {
  it("collects home red cards", () => {
    const ids = redCardedPlayerIdsFromIncidents(
      { incidents: [redIncident(42)] },
      "home"
    );
    expect(ids.has(42)).toBe(true);
  });

  it("ignores away reds when resolving home suspensions", () => {
    const ids = redCardedPlayerIdsFromIncidents(
      { incidents: [redIncident(99, false)] },
      "home"
    );
    expect(ids.size).toBe(0);
  });
});

describe("yellowCardedPlayerIdsFromIncidents", () => {
  it("collects home yellow cards", () => {
    const ids = yellowCardedPlayerIdsFromIncidents(
      { incidents: [yellowIncident(7)] },
      "home"
    );
    expect(ids.has(7)).toBe(true);
  });
});

describe("computeTournamentSuspendedPlayerIds", () => {
  const rules = DEFAULT_TOURNAMENT_DISCIPLINE_RULES;

  it("returns empty when no events", () => {
    const suspended = computeTournamentSuspendedPlayerIds({
      teamId: TEAM_ID,
      allTournamentEvents: [],
      incidentsByEventId: new Map(),
      rules,
    });
    expect(suspended.size).toBe(0);
  });

  it("suspends after two yellows across two matches", () => {
    const e1 = finishedEvent(1, 1000);
    const e2 = finishedEvent(2, 2000);
    const incidents = new Map<number, SportApiIncidentsResponse>([
      [1, { incidents: [yellowIncident(10)] }],
      [2, { incidents: [yellowIncident(10)] }],
    ]);

    const suspended = computeTournamentSuspendedPlayerIds({
      teamId: TEAM_ID,
      allTournamentEvents: [e1, e2],
      incidentsByEventId: incidents,
      rules,
    });
    expect(suspended.has(10)).toBe(true);
  });

  it("suspends after straight red in last match", () => {
    const e1 = finishedEvent(1, 1000);
    const incidents = new Map<number, SportApiIncidentsResponse>([
      [1, { incidents: [redIncident(55)] }],
    ]);

    const suspended = computeTournamentSuspendedPlayerIds({
      teamId: TEAM_ID,
      allTournamentEvents: [e1],
      incidentsByEventId: incidents,
      rules,
    });
    expect(suspended.has(55)).toBe(true);
  });

  it("treats second yellow as red without double-counting yellows", () => {
    const e1 = finishedEvent(1, 1000);
    const incidents = new Map<number, SportApiIncidentsResponse>([
      [
        1,
        {
          incidents: [yellowIncident(20), secondYellowIncident(20)],
        },
      ],
    ]);

    const suspended = computeTournamentSuspendedPlayerIds({
      teamId: TEAM_ID,
      allTournamentEvents: [e1],
      incidentsByEventId: incidents,
      rules,
    });
    expect(suspended.has(20)).toBe(true);
  });

  it("clears yellow accumulation after amnesty round completes", () => {
    const e1 = finishedEvent(1, 1000);
    const e2 = finishedEvent(2, 2000);
    const roundByEventId = new Map<number, TournamentRound>([
      [1, "QF"],
      [2, "SF"],
    ]);
    const incidents = new Map<number, SportApiIncidentsResponse>([
      [1, { incidents: [yellowIncident(30)] }],
      [2, { incidents: [yellowIncident(30)] }],
    ]);

    const suspended = computeTournamentSuspendedPlayerIds({
      teamId: TEAM_ID,
      allTournamentEvents: [e1, e2],
      incidentsByEventId: incidents,
      rules: { ...rules, amnestyAfterRound: "QF" },
      roundByEventId,
    });
    expect(suspended.has(30)).toBe(false);
  });

  it("does not suspend when only one yellow", () => {
    const e1 = finishedEvent(1, 1000);
    const incidents = new Map<number, SportApiIncidentsResponse>([
      [1, { incidents: [yellowIncident(11)] }],
    ]);

    const suspended = computeTournamentSuspendedPlayerIds({
      teamId: TEAM_ID,
      allTournamentEvents: [e1],
      incidentsByEventId: incidents,
      rules,
    });
    expect(suspended.size).toBe(0);
  });
});

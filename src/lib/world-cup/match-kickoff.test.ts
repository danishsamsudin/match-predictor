import { describe, expect, it } from "vitest";
import {
  resolveMatchPhase,
  resolveWcKickoffForFixture,
  shouldRefreshHubPrediction,
  wcVenueKickoffToUtcIso,
} from "@/lib/world-cup/match-kickoff";

describe("match kickoff phase", () => {
  it("treats finished matches as finished", () => {
    expect(
      resolveMatchPhase({
        status: "scheduled",
        homeGoals: 2,
        awayGoals: 1,
        date: "2026-06-13",
        time: "14:00",
        venueCity: "San Francisco",
      })
    ).toBe("finished");
  });

  it("keeps live in-progress scores out of finished", () => {
    expect(
      resolveMatchPhase({
        status: "live",
        homeGoals: 0,
        awayGoals: 0,
        date: "2026-07-04",
        time: "12:00",
        venueCity: "Philadelphia",
      })
    ).toBe("live");
  });

  it("does not treat scheduled 0-0 placeholders as finished", () => {
    const beforeKickoff = new Date("2026-07-04T10:00:00Z");
    expect(
      resolveMatchPhase(
        {
          status: "scheduled",
          homeGoals: 0,
          awayGoals: 0,
          date: "2026-07-04",
          time: "12:00",
          venueCity: "Philadelphia",
        },
        beforeKickoff
      )
    ).toBe("pre");
  });

  it("locks predictions after kickoff", () => {
    const pastKickoff = new Date("2026-07-01T12:00:00Z");
    expect(
      resolveMatchPhase(
        {
          status: "scheduled",
          homeGoals: null,
          awayGoals: null,
          date: "2026-06-11",
          time: "14:00",
          venueCity: "Mexico City",
        },
        pastKickoff
      )
    ).toBe("live");
    expect(shouldRefreshHubPrediction("live")).toBe(false);
    expect(shouldRefreshHubPrediction("pre")).toBe(true);
  });
});

describe("wcVenueKickoffToUtcIso", () => {
  it("maps venue wall clock to UTC using stadium timezone", () => {
    expect(
      wcVenueKickoffToUtcIso({
        date: "2026-06-20",
        time: "15:00",
        venueCity: "Guadalajara",
      })
    ).toBe("2026-06-20T21:00:00.000Z");
    expect(
      wcVenueKickoffToUtcIso({
        date: "2026-07-19",
        time: "15:00",
        venueCity: "New York",
      })
    ).toBe("2026-07-19T19:00:00.000Z");
  });
});

describe("resolveWcKickoffForFixture", () => {
  it("converts Spain vs Saudi Arabia Atlanta noon to 18:00 CEST", () => {
    const resolved = resolveWcKickoffForFixture({
      date: "2026-06-21",
      time: null,
      homeName: "Spain",
      awayName: "Saudi Arabia",
      venueCity: "Atlanta",
    });
    expect(resolved?.venueLocalTime).toBe("12:00");
    expect(resolved?.cestTime).toBe("18:00");
    expect(resolved?.kickoffUtc).toBe("2026-06-21T16:00:00.000Z");
  });
});

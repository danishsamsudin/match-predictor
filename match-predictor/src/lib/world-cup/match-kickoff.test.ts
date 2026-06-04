import { describe, expect, it } from "vitest";
import {
  resolveMatchPhase,
  shouldRefreshHubPrediction,
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

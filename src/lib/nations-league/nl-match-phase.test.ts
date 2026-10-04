import { describe, expect, it } from "vitest";
import {
  resolveNlMatchPhase,
  shouldRefreshNlPrediction,
} from "@/lib/nations-league/nl-match-phase";

describe("Nations League kickoff phase", () => {
  it("treats finished matches as finished", () => {
    expect(
      resolveNlMatchPhase({
        status: "scheduled",
        homeGoals: 2,
        awayGoals: 1,
        date: "2026-09-05",
        time: "20:45",
      })
    ).toBe("finished");
  });

  it("keeps live matches live even at 0-0", () => {
    expect(
      resolveNlMatchPhase({
        status: "live",
        homeGoals: 0,
        awayGoals: 0,
        date: "2026-09-05",
        time: "20:45",
      })
    ).toBe("live");
  });

  it("does not treat scheduled 0-0 placeholders as finished", () => {
    const beforeKickoff = new Date("2026-09-05T16:00:00Z");
    expect(
      resolveNlMatchPhase(
        {
          status: "scheduled",
          homeGoals: 0,
          awayGoals: 0,
          date: "2026-09-05",
          time: "20:45",
        },
        beforeKickoff
      )
    ).toBe("pre");
  });

  it("uses Central European kickoff time, not a World Cup stadium timezone", () => {
    const justAfterCetKickoff = new Date("2026-09-05T18:46:00Z");
    expect(
      resolveNlMatchPhase(
        {
          status: "scheduled",
          homeGoals: 0,
          awayGoals: 0,
          date: "2026-09-05",
          time: "20:45",
        },
        justAfterCetKickoff
      )
    ).toBe("live");
  });

  it("only refreshes locked odds before kickoff", () => {
    expect(shouldRefreshNlPrediction("pre")).toBe(true);
    expect(shouldRefreshNlPrediction("live")).toBe(false);
    expect(shouldRefreshNlPrediction("finished")).toBe(false);
  });
});

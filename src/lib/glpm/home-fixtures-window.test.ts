import { describe, expect, it } from "vitest";
import type { GlpmHubUpcomingMatch } from "@/lib/glpm/hub-types";
import { localYmd, upcomingWeekWindow } from "@/lib/glpm/home-fixtures-window";

function match(
  partial: Pick<GlpmHubUpcomingMatch, "matchSmId" | "kickoffAt" | "date">
): GlpmHubUpcomingMatch {
  return {
    homeName: "Home",
    awayName: "Away",
    homeTeamSmId: 1,
    awayTeamSmId: 2,
    venue: null,
    gameweek: 5,
    prediction: null,
    predictionPriorSeason: null,
    predictionSeasonLabel: null,
    predictionPriorSeasonLabel: null,
    predictionSource: null,
    homePromotedWarning: false,
    awayPromotedWarning: false,
    weather: null,
    ...partial,
  };
}

describe("upcomingWeekWindow", () => {
  it("keeps every match day in the next week, not only the first two", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const today = localYmd(now);
    const days = upcomingWeekWindow(
      [
        match({ matchSmId: 1, kickoffAt: "2026-09-14T19:00:00.000Z", date: "2026-09-14" }),
        match({ matchSmId: 2, kickoffAt: "2026-09-18T19:00:00.000Z", date: "2026-09-18" }),
        match({ matchSmId: 3, kickoffAt: "2026-09-19T14:00:00.000Z", date: "2026-09-19" }),
        match({ matchSmId: 4, kickoffAt: "2026-09-20T13:00:00.000Z", date: "2026-09-20" }),
        match({ matchSmId: 5, kickoffAt: "2026-10-10T14:00:00.000Z", date: "2026-10-10" }),
      ],
      now
    );
    expect(days[0]).not.toBeUndefined();
    expect(days.length).toBeGreaterThanOrEqual(3);
    expect(days).toContain(localYmd(new Date("2026-09-18T19:00:00.000Z")));
    expect(days).toContain(localYmd(new Date("2026-09-19T14:00:00.000Z")));
    expect(days).not.toContain(localYmd(new Date("2026-10-10T14:00:00.000Z")));
    expect(days.every((d) => d >= today)).toBe(true);
  });

  it("groups by local calendar day from kickoffAt even if match.date is stale", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const kickoffAt = "2026-09-14T16:30:00.000Z";
    const days = upcomingWeekWindow(
      [match({ matchSmId: 1, kickoffAt, date: "2026-09-13" })],
      now
    );
    expect(days).toEqual([localYmd(new Date(kickoffAt))]);
  });
});

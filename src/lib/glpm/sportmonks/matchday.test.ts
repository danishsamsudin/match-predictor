import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  buildMatchdayWindowPlan,
  formatDateInTimeZone,
  hasConfirmedLineups,
  parseKickoffMs,
  resolveAutoPhase,
  resolveMatchdayTimeZone,
  zonedWallTimeToUtc,
} from "./matchday";

describe("matchday timezone helpers", () => {
  it("resolves valid IANA zones and falls back for junk", () => {
    expect(resolveMatchdayTimeZone("Africa/Lagos")).toBe("Africa/Lagos");
    expect(resolveMatchdayTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(resolveMatchdayTimeZone("Not/AZone")).toBe("UTC");
  });

  it("formats calendar dates in Lagos vs Berlin around a UTC instant", () => {
    // Both WAT (UTC+1) and CEST (UTC+2) roll to the next calendar day at 23:30 UTC.
    const instant = new Date("2026-07-22T23:30:00.000Z");
    expect(formatDateInTimeZone(instant, "Africa/Lagos")).toBe("2026-07-23");
    expect(formatDateInTimeZone(instant, "Europe/Berlin")).toBe("2026-07-23");

    // Earlier the same UTC evening is still the 22nd in Lagos, already the 23rd in Berlin.
    const earlier = new Date("2026-07-22T22:30:00.000Z");
    expect(formatDateInTimeZone(earlier, "Africa/Lagos")).toBe("2026-07-22");
    expect(formatDateInTimeZone(earlier, "Europe/Berlin")).toBe("2026-07-23");
  });

  it("converts zoned wall times to UTC", () => {
    const lagosKickoff = zonedWallTimeToUtc("2026-07-22", 16, 0, 0, "Africa/Lagos");
    expect(lagosKickoff.toISOString()).toBe("2026-07-22T15:00:00.000Z");

    const berlinKickoff = zonedWallTimeToUtc("2026-07-22", 20, 30, 0, "Europe/Berlin");
    expect(berlinKickoff.toISOString()).toBe("2026-07-22T18:30:00.000Z");
  });

  it("parses SportMonks kickoff strings", () => {
    expect(parseKickoffMs("2026-07-22 15:00:00")).toBe(
      Date.parse("2026-07-22T15:00:00.000Z")
    );
  });

  it("builds lineup/results/refresh due times from first/last kickoff", () => {
    const plan = buildMatchdayWindowPlan({
      timeZone: "Africa/Lagos",
      matchDate: "2026-07-22",
      fixtures: [
        { id: 1, startingAt: "2026-07-22 15:00:00" }, // 16:00 Lagos
        { id: 2, startingAt: "2026-07-22 19:00:00" }, // 20:00 Lagos
        { id: 99, startingAt: "2026-07-23 12:00:00" }, // next day — excluded
      ],
    });
    expect(plan.emptyMatchday).toBe(false);
    expect(plan.fixtureIds).toEqual([1, 2]);
    expect(plan.firstKickoffAt).toBe("2026-07-22T15:00:00.000Z");
    expect(plan.lastKickoffAt).toBe("2026-07-22T19:00:00.000Z");
    // lineup = first - 70m
    expect(plan.lineupDueAt).toBe("2026-07-22T13:50:00.000Z");
    // results = last + 110m + 2h = +230m → 22:50 UTC
    expect(plan.resultsDueAt).toBe("2026-07-22T22:50:00.000Z");
    // refresh = results + 60m
    expect(plan.refreshDueAt).toBe("2026-07-22T23:50:00.000Z");
  });

  it("marks empty matchdays", () => {
    const plan = buildMatchdayWindowPlan({
      timeZone: "UTC",
      matchDate: "2026-07-22",
      fixtures: [],
    });
    expect(plan.emptyMatchday).toBe(true);
    expect(plan.lineupDueAt).toBeNull();
  });

  it("detects confirmed lineups from starter type_id=11", () => {
    const starters = Array.from({ length: 22 }, (_, i) => ({ type_id: 11, id: i }));
    expect(hasConfirmedLineups(starters)).toBe(true);
    expect(hasConfirmedLineups(starters.slice(0, 10))).toBe(false);
  });

  it("resolves auto phase order", () => {
    const base = {
      emptyMatchday: false,
      lineupDone: false,
      resultsDone: false,
      refreshDone: false,
      lineupDueAt: "2026-07-22T12:00:00.000Z",
      resultsDueAt: "2026-07-22T20:00:00.000Z",
      refreshDueAt: "2026-07-22T21:00:00.000Z",
    };
    expect(resolveAutoPhase(null)).toBe("morning");
    expect(resolveAutoPhase(base, Date.parse("2026-07-22T11:00:00.000Z"))).toBe("idle");
    expect(resolveAutoPhase(base, Date.parse("2026-07-22T12:30:00.000Z"))).toBe("lineup");
    expect(
      resolveAutoPhase(
        { ...base, lineupDone: true },
        Date.parse("2026-07-22T20:30:00.000Z")
      )
    ).toBe("results");
    expect(
      resolveAutoPhase(
        { ...base, lineupDone: true, resultsDone: true },
        Date.parse("2026-07-22T21:30:00.000Z")
      )
    ).toBe("refresh");
    expect(
      resolveAutoPhase(
        { ...base, emptyMatchday: true },
        Date.parse("2026-07-22T21:30:00.000Z")
      )
    ).toBe("idle");
  });

  it("adds calendar days on YYYY-MM-DD", () => {
    expect(addCalendarDays("2026-07-22", -1)).toBe("2026-07-21");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

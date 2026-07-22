import { describe, expect, it } from "vitest";
import {
  formatCalendarDateLongLocal,
  formatKickoffCardLocal,
  formatKickoffLocal,
  getDefaultMatchDateTimeLocal,
  localDateTimeToUtcIso,
  timezoneDateTimeToUtcIso,
  utcIsoToLocalDateTime,
  utcIsoToWcDateTime,
  wcDateTimeToUtcIso,
} from "./kickoff-display";

describe("kickoff-display", () => {
  it("round-trips local date/time to UTC ISO", () => {
    const iso = localDateTimeToUtcIso("2026-06-15", "15:30");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const back = utcIsoToLocalDateTime(iso);
    expect(back.date).toBe("2026-06-15");
    expect(back.time).toBe("15:30");
  });

  it("formats kickoff with timezone name", () => {
    const label = formatKickoffLocal("2026-06-15T12:00:00.000Z");
    expect(label.length).toBeGreaterThan(5);
    expect(label).toMatch(/2026|Jun|15/i);
  });

  it("formats card kickoff with long weekday and local time", () => {
    const { dateLabel, timeLabel, fullLabel } = formatKickoffCardLocal(
      "2026-06-15T18:00:00.000Z"
    );
    expect(dateLabel).toMatch(/June/);
    expect(dateLabel).toMatch(/15/);
    expect(timeLabel).toBeTruthy();
    expect(fullLabel).toContain("·");
  });

  it("falls back to long date-only when kickoffAt missing", () => {
    const { timeLabel, fullLabel } = formatKickoffCardLocal(null, "2026-06-15");
    expect(timeLabel).toBeNull();
    expect(fullLabel).toBe("Monday 15 June");
  });

  it("formats long calendar dates in a stable en-GB order", () => {
    expect(formatCalendarDateLongLocal("2026-07-23")).toBe("Thursday 23 July");
  });

  it("default local datetime is on the hour", () => {
    const fixed = new Date("2026-01-10T14:45:00");
    const { time } = getDefaultMatchDateTimeLocal(fixed);
    expect(time.endsWith(":00")).toBe(true);
  });

  it("round-trips WC CEST wall clock to UTC", () => {
    const iso = wcDateTimeToUtcIso("2026-06-15", "18:00");
    const back = utcIsoToWcDateTime(iso);
    expect(back.date).toBe("2026-06-15");
    expect(back.time).toBe("18:00");
  });

  it("Houston venue kickoff UTC maps to CEST prefill time", () => {
    const iso = timezoneDateTimeToUtcIso("2026-06-15", "18:00", "America/Chicago");
    expect(iso).toBe("2026-06-15T23:00:00.000Z");
    const cest = utcIsoToWcDateTime(iso);
    expect(cest.date).toBe("2026-06-16");
    expect(cest.time).toBe("01:00");
  });
});

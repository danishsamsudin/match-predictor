/** Browser-local kickoff formatting and conversion to UTC ISO for API storage. */

export function getLocalTimezoneLabel(now = new Date()): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(now);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "local";
}

/** Format UTC ISO kickoff for display in the user's local timezone. */
export function formatKickoffLocal(isoUtc: string, now = new Date()): string {
  const kickoff = new Date(isoUtc);
  if (Number.isNaN(kickoff.getTime())) return isoUtc;
  return kickoff.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Short date+time for fixture picker labels. */
export function formatFixtureKickoffLocal(isoUtc: string): string {
  const kickoff = new Date(isoUtc);
  if (Number.isNaN(kickoff.getTime())) return isoUtc;
  const dateLabel = kickoff.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = kickoff.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${dateLabel} ${timeLabel}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local wall-clock date (YYYY-MM-DD) and time (HH:MM) from UTC ISO. */
export function utcIsoToLocalDateTime(isoUtc: string): { date: string; time: string } {
  const kickoff = new Date(isoUtc);
  if (Number.isNaN(kickoff.getTime())) {
    return { date: isoUtc.slice(0, 10), time: "12:00" };
  }
  return {
    date: `${kickoff.getFullYear()}-${pad2(kickoff.getMonth() + 1)}-${pad2(kickoff.getDate())}`,
    time: `${pad2(kickoff.getHours())}:${pad2(kickoff.getMinutes())}`,
  };
}

/** Convert local date/time inputs to UTC ISO string for API. */
export function localDateTimeToUtcIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = new Date(y, m - 1, d, hh, mm ?? 0, 0, 0);
  return local.toISOString();
}

/** Default kickoff: next full hour in local time. */
export function getDefaultMatchDateTimeLocal(now = new Date()): { date: string; time: string } {
  const rounded = new Date(now);
  if (rounded.getMinutes() >= 30) {
    rounded.setHours(rounded.getHours() + 1);
  }
  rounded.setMinutes(0, 0, 0);
  return utcIsoToLocalDateTime(rounded.toISOString());
}

/** Parse calendar date-only strings without timezone shift (noon UTC anchor). */
export function formatCalendarDateLocal(isoDate: string): string {
  const kickoff = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(kickoff.getTime())) return isoDate;
  return kickoff.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

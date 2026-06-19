import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";

export type MatchPhase = "pre" | "live" | "finished";

function parseClock(time: string | null | undefined): { hour: number; minute: number } | null {
  if (!time?.trim()) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** UTC epoch ms for kickoff in the host city's timezone (null if date missing). */
export function resolveWcKickoffUtcMs(input: {
  date?: string | null | undefined;
  time?: string | null | undefined;
  venueCity?: string | null;
}): number | null {
  const date = input.date?.trim().slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const clock = parseClock(input.time) ?? { hour: 12, minute: 0 };
  const venue = resolveStadiumVenue(input.venueCity ?? null);
  const timeZone = venue?.timezone ?? "America/New_York";

  const [y, mo, d] = date.split("-").map(Number);
  const desiredLocal = {
    year: y,
    month: mo,
    day: d,
    hour: clock.hour,
    minute: clock.minute,
  };

  let guess = Date.UTC(y, mo - 1, d, clock.hour, clock.minute, 0, 0);
  for (let i = 0; i < 6; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));

    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");

    const actual = {
      year: read("year"),
      month: read("month"),
      day: read("day"),
      hour: read("hour") % 24,
      minute: read("minute"),
    };

    const desiredTotal =
      desiredLocal.year * 1e6 +
      desiredLocal.month * 1e4 +
      desiredLocal.day * 1e2 +
      desiredLocal.hour * 60 +
      desiredLocal.minute;
    const actualTotal =
      actual.year * 1e6 +
      actual.month * 1e4 +
      actual.day * 1e2 +
      actual.hour * 60 +
      actual.minute;

    const diffMin = desiredTotal - actualTotal;
    if (diffMin === 0) return guess;
    guess += diffMin * 60 * 1000;
  }

  return guess;
}

/** UTC ISO for a World Cup kickoff in the host city's local wall clock. */
export function wcVenueKickoffToUtcIso(input: {
  date?: string | null | undefined;
  time?: string | null | undefined;
  venueCity?: string | null;
}): string | null {
  const ms = resolveWcKickoffUtcMs(input);
  return ms != null ? new Date(ms).toISOString() : null;
}

/** Venue-local kickoff label with stadium timezone (e.g. `15:00 GMT-6`). */
export function formatWcVenueKickoff(input: {
  date?: string | null | undefined;
  time?: string | null | undefined;
  venueCity?: string | null;
}): string | null {
  const ms = resolveWcKickoffUtcMs(input);
  if (ms == null) {
    const clock = parseClock(input.time);
    return clock ? `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}` : null;
  }

  const venue = resolveStadiumVenue(input.venueCity ?? null);
  const timeZone = venue?.timezone ?? "America/New_York";

  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}

export function isMatchFinished(input: {
  status?: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
}): boolean {
  if (input.homeGoals != null && input.awayGoals != null) return true;
  return input.status === "finished";
}

export function resolveMatchPhase(
  input: {
    status?: string | null;
    homeGoals?: number | null;
    awayGoals?: number | null;
    date?: string | null;
    time?: string | null;
    venueCity?: string | null;
  },
  now: Date = new Date()
): MatchPhase {
  if (isMatchFinished(input)) return "finished";

  const liveStatus = input.status === "live" || input.status === "in_progress";
  if (liveStatus) return "live";
  if (input.homeGoals != null || input.awayGoals != null) return "live";

  const kickoffMs = resolveWcKickoffUtcMs(input);
  if (kickoffMs != null && now.getTime() >= kickoffMs) return "live";

  return "pre";
}

/** Sync must not overwrite hub predictions after kickoff. */
export function shouldRefreshHubPrediction(phase: MatchPhase): boolean {
  return phase === "pre";
}

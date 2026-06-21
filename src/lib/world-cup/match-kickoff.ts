import {
  getWcTimezoneLabel,
  WC_DISPLAY_TIMEZONE,
  utcIsoToWcDateTime,
} from "@/lib/utils/kickoff-display";
import {
  resolveFixtureScheduleMeta,
  resolveFixtureVenue,
} from "@/lib/world-cup/fixture-venues";
import { normalizePredictorVenueCity, resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";

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

function readDateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number {
  return Number(parts.find((p) => p.type === type)?.value ?? "0");
}

/** UTC epoch ms for wall-clock kickoff in the host city's IANA timezone. */
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
  let guess = Date.UTC(y, mo - 1, d, clock.hour, clock.minute, 0, 0);

  for (let i = 0; i < 12; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(new Date(guess));

    const ty = readDateTimePart(parts, "year");
    const tmo = readDateTimePart(parts, "month");
    const td = readDateTimePart(parts, "day");
    const th = readDateTimePart(parts, "hour") % 24;
    const tm = readDateTimePart(parts, "minute");

    const diffMin =
      (y - ty) * 525600 +
      (mo - tmo) * 43200 +
      (d - td) * 1440 +
      (clock.hour - th) * 60 +
      (clock.minute - tm);

    if (diffMin === 0) return guess;
    guess += diffMin * 60 * 1000;
  }

  console.warn(
    `[match-kickoff] Failed to converge kickoff for ${date} ${clock.hour}:${String(clock.minute).padStart(2, "0")} in ${timeZone}`
  );
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

export type ResolvedWcKickoff = {
  date: string;
  venueCity: string;
  /** Kickoff in the host stadium's local wall clock (from official schedule when known). */
  venueLocalTime: string;
  kickoffUtc: string;
  cestDate: string;
  cestTime: string;
};

/**
 * Resolve kickoff from the official fixture schedule: venue-local time + stadium TZ → UTC → CEST.
 */
export function resolveWcKickoffForFixture(input: {
  date?: string | null;
  time?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  venueCity?: string | null;
}): ResolvedWcKickoff | null {
  const schedule = resolveFixtureScheduleMeta({
    date: input.date,
    time: input.time,
    homeName: input.homeName,
    awayName: input.awayName,
  });
  const fixtureVenue = resolveFixtureVenue({
    date: schedule?.date ?? input.date,
    homeName: input.homeName,
    awayName: input.awayName,
    venue_city: input.venueCity,
  });

  const date = schedule?.date?.trim() || input.date?.trim().slice(0, 10);
  const venueLocalTime = schedule?.kickoff_time?.trim() || input.time?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !venueLocalTime) return null;

  const venueCity = normalizePredictorVenueCity(
    fixtureVenue?.city ?? input.venueCity,
    { defaultWhenUnknown: "Mexico City" }
  );

  const kickoffUtc = wcVenueKickoffToUtcIso({
    date,
    time: venueLocalTime,
    venueCity,
  });
  if (!kickoffUtc) return null;

  const cest = utcIsoToWcDateTime(kickoffUtc);
  return {
    date,
    venueCity,
    venueLocalTime,
    kickoffUtc,
    cestDate: cest.date,
    cestTime: cest.time,
  };
}

/** Kickoff label in Central European time (CEST/CET) for hub cards and predictor. */
export function formatWcVenueKickoff(input: {
  date?: string | null | undefined;
  time?: string | null | undefined;
  venueCity?: string | null;
  homeName?: string | null;
  awayName?: string | null;
}): string | null {
  const resolved = resolveWcKickoffForFixture(input);
  if (resolved) {
    const label = getWcTimezoneLabel(new Date(resolved.kickoffUtc));
    return `${resolved.cestTime} ${label}`;
  }

  const ms = resolveWcKickoffUtcMs(input);
  if (ms == null) {
    const clock = parseClock(input.time);
    return clock ? `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}` : null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: WC_DISPLAY_TIMEZONE,
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

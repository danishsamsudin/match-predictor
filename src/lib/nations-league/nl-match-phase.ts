import { isMatchFinished, type MatchPhase } from "@/lib/world-cup/match-kickoff";

/**
 * UEFA publishes Nations League kickoffs in Central European time (18:00 / 20:45 slots),
 * and that is what `matches.time` stores for the 2026/27 cycle.
 */
const NL_SCHEDULE_TIMEZONE = "Europe/Berlin";

function parseClock(time: string | null | undefined): { hour: number; minute: number } | null {
  if (!time?.trim()) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((p) => p.type === type)?.value ?? "0");
}

/** UTC epoch ms for a Nations League kickoff expressed as a Central European wall clock. */
export function resolveNlKickoffUtcMs(input: {
  date?: string | null;
  time?: string | null;
}): number | null {
  const date = input.date?.trim().slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  // No published time yet: treat the whole match day as pre-match until 23:59 CET.
  const clock = parseClock(input.time) ?? { hour: 23, minute: 59 };
  const [y, mo, d] = date.split("-").map(Number);
  let guess = Date.UTC(y, mo - 1, d, clock.hour, clock.minute, 0, 0);

  for (let i = 0; i < 12; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: NL_SCHEDULE_TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(new Date(guess));

    const diffMin =
      (y - part(parts, "year")) * 525600 +
      (mo - part(parts, "month")) * 43200 +
      (d - part(parts, "day")) * 1440 +
      (clock.hour - (part(parts, "hour") % 24)) * 60 +
      (clock.minute - part(parts, "minute"));

    if (diffMin === 0) return guess;
    guess += diffMin * 60 * 1000;
  }

  return guess;
}

export function nlKickoffUtcIso(input: {
  date?: string | null;
  time?: string | null;
}): string | null {
  const ms = resolveNlKickoffUtcMs(input);
  return ms != null ? new Date(ms).toISOString() : null;
}

/**
 * Pre-match / live / finished for a Nations League fixture.
 *
 * Unlike the World Cup resolver this does not look up stadium metadata (NL venues are
 * European cities that are absent from the World Cup stadium table, which would silently
 * fall back to a North American timezone and delay the lock by several hours).
 */
export function resolveNlMatchPhase(
  input: {
    status?: string | null;
    homeGoals?: number | null;
    awayGoals?: number | null;
    date?: string | null;
    time?: string | null;
  },
  now: Date = new Date()
): MatchPhase {
  if (isMatchFinished(input)) return "finished";
  if (input.status === "live" || input.status === "in_progress") return "live";

  const status = input.status?.toLowerCase() ?? "";
  const placeholderScore =
    status === "scheduled" && input.homeGoals === 0 && input.awayGoals === 0;
  if (!placeholderScore && (input.homeGoals != null || input.awayGoals != null)) {
    return "live";
  }

  const kickoffMs = resolveNlKickoffUtcMs(input);
  if (kickoffMs != null && now.getTime() >= kickoffMs) return "live";

  return "pre";
}

/** Locked lines may only be rewritten while the fixture has not kicked off. */
export function shouldRefreshNlPrediction(phase: MatchPhase): boolean {
  return phase === "pre";
}

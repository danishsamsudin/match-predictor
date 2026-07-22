/**
 * Matchday calendar helpers in the operator/user IANA timezone.
 *
 * Set GLPM_MATCHDAY_TIMEZONE (e.g. Africa/Lagos, Europe/Berlin) so "today",
 * first/last kickoff windows, and due times align with where you live.
 * Kickoff due math itself is absolute UTC once the slate is chosen.
 */

export const LINEUP_LEAD_MS = 70 * 60 * 1000;
/** Typical regulation + HT + stoppage before FT is published. */
export const MATCH_DURATION_MS = 110 * 60 * 1000;
export const RESULTS_AFTER_FT_MS = 2 * 60 * 60 * 1000;
/** Delay after results ingest before retrain + upcoming predictions. */
export const REFRESH_AFTER_RESULTS_MS = 60 * 60 * 1000;

export const LINEUP_STARTER_TYPE_ID = 11;
/** Both teams usually publish 11 starters. */
export const MIN_CONFIRMED_STARTERS = 20;

export function resolveMatchdayTimeZone(override?: string | null): string {
  const raw =
    override?.trim() ||
    process.env.GLPM_MATCHDAY_TIMEZONE?.trim() ||
    process.env.TZ?.trim() ||
    "UTC";
  try {
    // Throws RangeError for invalid IANA zones.
    Intl.DateTimeFormat(undefined, { timeZone: raw });
    return raw;
  } catch {
    console.warn(`Invalid matchday timezone "${raw}", falling back to UTC`);
    return "UTC";
  }
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset such that localWall = utcInstant + offset. */
function timeZoneOffsetMs(utcInstant: Date, timeZone: string): number {
  const p = zonedParts(utcInstant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcInstant.getTime();
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedWallTimeToUtc(
  dateYmd: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid dateYmd: ${dateYmd}`);
  let utc = new Date(Date.UTC(y, m - 1, d, hour, minute, second));
  for (let i = 0; i < 4; i++) {
    const offset = timeZoneOffsetMs(utc, timeZone);
    utc = new Date(Date.UTC(y, m - 1, d, hour, minute, second) - offset);
  }
  return utc;
}

export function startOfZonedDayUtc(dateYmd: string, timeZone: string): Date {
  return zonedWallTimeToUtc(dateYmd, 0, 0, 0, timeZone);
}

export function endOfZonedDayUtc(dateYmd: string, timeZone: string): Date {
  // Exclusive end = next calendar day 00:00 in that zone.
  const start = startOfZonedDayUtc(dateYmd, timeZone);
  const noon = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  const nextYmd = formatDateInTimeZone(
    new Date(noon.getTime() + 24 * 60 * 60 * 1000),
    timeZone
  );
  // Walk forward until the zoned date advances (handles DST).
  let probe = new Date(start.getTime() + 20 * 60 * 60 * 1000);
  for (let i = 0; i < 48; i++) {
    probe = new Date(probe.getTime() + 30 * 60 * 1000);
    if (formatDateInTimeZone(probe, timeZone) !== dateYmd) {
      return zonedWallTimeToUtc(
        formatDateInTimeZone(probe, timeZone),
        0,
        0,
        0,
        timeZone
      );
    }
  }
  return startOfZonedDayUtc(nextYmd, timeZone);
}

export function addCalendarDays(dateYmd: string, deltaDays: number): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + deltaDays));
  return utc.toISOString().slice(0, 10);
}

export type MatchdayFixtureRef = {
  id: number;
  startingAt: string | null;
  seasonId?: number | null;
  leagueId?: number | null;
  stateId?: number | null;
};

export type MatchdayWindowPlan = {
  timeZone: string;
  matchDate: string;
  fixtureIds: number[];
  firstKickoffAt: string | null;
  lastKickoffAt: string | null;
  lineupDueAt: string | null;
  resultsDueAt: string | null;
  refreshDueAt: string | null;
  emptyMatchday: boolean;
};

export function parseKickoffMs(startingAt: string | null | undefined): number | null {
  if (!startingAt) return null;
  // SportMonks often returns "YYYY-MM-DD HH:mm:ss" (UTC). Normalize.
  const normalized = startingAt.includes("T")
    ? startingAt
    : startingAt.replace(" ", "T") + (startingAt.endsWith("Z") ? "" : "Z");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function filterFixturesOnMatchDate(
  fixtures: MatchdayFixtureRef[],
  matchDate: string,
  timeZone: string
): MatchdayFixtureRef[] {
  return fixtures.filter((f) => {
    const ms = parseKickoffMs(f.startingAt);
    if (ms == null) return false;
    return formatDateInTimeZone(new Date(ms), timeZone) === matchDate;
  });
}

export function buildMatchdayWindowPlan(args: {
  fixtures: MatchdayFixtureRef[];
  matchDate: string;
  timeZone: string;
}): MatchdayWindowPlan {
  const timeZone = resolveMatchdayTimeZone(args.timeZone);
  const onDay = filterFixturesOnMatchDate(args.fixtures, args.matchDate, timeZone);
  const kickoffs = onDay
    .map((f) => parseKickoffMs(f.startingAt))
    .filter((ms): ms is number => ms != null)
    .sort((a, b) => a - b);

  if (!kickoffs.length) {
    return {
      timeZone,
      matchDate: args.matchDate,
      fixtureIds: onDay.map((f) => f.id),
      firstKickoffAt: null,
      lastKickoffAt: null,
      lineupDueAt: null,
      resultsDueAt: null,
      refreshDueAt: null,
      emptyMatchday: true,
    };
  }

  const first = kickoffs[0]!;
  const last = kickoffs[kickoffs.length - 1]!;
  const lineupDue = first - LINEUP_LEAD_MS;
  const resultsDue = last + MATCH_DURATION_MS + RESULTS_AFTER_FT_MS;
  const refreshDue = resultsDue + REFRESH_AFTER_RESULTS_MS;

  return {
    timeZone,
    matchDate: args.matchDate,
    fixtureIds: onDay.map((f) => f.id),
    firstKickoffAt: new Date(first).toISOString(),
    lastKickoffAt: new Date(last).toISOString(),
    lineupDueAt: new Date(lineupDue).toISOString(),
    resultsDueAt: new Date(resultsDue).toISOString(),
    refreshDueAt: new Date(refreshDue).toISOString(),
    emptyMatchday: false,
  };
}

export function countStartingXi(lineups: Array<{ type_id?: number }> | null | undefined): number {
  if (!lineups?.length) return 0;
  return lineups.filter((l) => l.type_id === LINEUP_STARTER_TYPE_ID).length;
}

export function hasConfirmedLineups(
  lineups: Array<{ type_id?: number }> | null | undefined,
  minStarters = MIN_CONFIRMED_STARTERS
): boolean {
  return countStartingXi(lineups) >= minStarters;
}

export type DailySyncPhase = "morning" | "lineup" | "results" | "refresh" | "idle";

export type DailySyncWindowFlags = {
  emptyMatchday: boolean;
  lineupDone: boolean;
  resultsDone: boolean;
  refreshDone: boolean;
  lineupDueAt: string | null;
  resultsDueAt: string | null;
  refreshDueAt: string | null;
};

/** Pick the next dispatcher phase from persisted window flags. */
export function resolveAutoPhase(
  window: DailySyncWindowFlags | null,
  nowMs = Date.now()
): DailySyncPhase {
  if (!window) return "morning";
  if (window.emptyMatchday) return "idle";

  if (
    !window.refreshDone &&
    window.resultsDone &&
    window.refreshDueAt &&
    nowMs >= Date.parse(window.refreshDueAt)
  ) {
    return "refresh";
  }
  if (
    !window.resultsDone &&
    window.resultsDueAt &&
    nowMs >= Date.parse(window.resultsDueAt)
  ) {
    return "results";
  }
  if (
    !window.lineupDone &&
    window.lineupDueAt &&
    nowMs >= Date.parse(window.lineupDueAt)
  ) {
    return "lineup";
  }
  return "idle";
}

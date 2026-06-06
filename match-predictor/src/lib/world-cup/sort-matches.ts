import { resolveFixtureScheduleMeta } from "@/lib/world-cup/fixture-venues";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function normalizeKickoffTime(time: string | null | undefined): string {
  if (!time?.trim()) return "99:99";
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time.trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function sortKeys(m: WcMatchRow): {
  date: string;
  time: string;
  matchNumber: number;
} {
  const official = resolveFixtureScheduleMeta({
    date: m.date,
    time: m.time,
    homeName: m.home_team_name,
    awayName: m.away_team_name,
  });
  return {
    date: official?.date?.trim() || m.date || "9999-99-99",
    time: normalizeKickoffTime(official?.kickoff_time ?? m.time),
    matchNumber: official?.match_number ?? 9999,
  };
}

/** Earliest kickoff first (official date when known, then time, then FIFA match number). */
export function compareByKickoffAsc(a: WcMatchRow, b: WcMatchRow): number {
  const ka = sortKeys(a);
  const kb = sortKeys(b);
  const dateCmp = ka.date.localeCompare(kb.date);
  if (dateCmp !== 0) return dateCmp;
  const timeCmp = ka.time.localeCompare(kb.time);
  if (timeCmp !== 0) return timeCmp;
  return ka.matchNumber - kb.matchNumber;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Fixed en-GB-style label — avoids Node vs browser `toLocaleDateString` differences during hydration. */
export function formatWorldCupDayLabel(isoDate: string): string {
  if (isoDate === "unknown") return "Date TBC";
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const weekday = WEEKDAY_NAMES[d.getUTCDay()];
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

export function formatKickoffTime(time: string | null | undefined): string | null {
  if (!time?.trim()) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time.trim();
  const h = Number(m[1]);
  const min = m[2];
  if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:${min}`;
  return time.trim();
}

/** Groups pre-sorted matches into calendar days (preserves order within each day). */
export function groupMatchesByDay<T extends WcMatchRow>(
  matches: T[]
): Array<{ date: string; matches: T[] }> {
  const groups: Array<{ date: string; matches: T[] }> = [];
  for (const m of matches) {
    const day = m.date?.trim() || "unknown";
    const last = groups[groups.length - 1];
    if (last?.date === day) {
      last.matches.push(m);
    } else {
      groups.push({ date: day, matches: [m] });
    }
  }
  return groups;
}

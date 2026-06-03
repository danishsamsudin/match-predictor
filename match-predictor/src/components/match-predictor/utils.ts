import type { FixtureOption } from "@/lib/types/football-lookup";
import {
  formatFixtureKickoffLocal,
  getDefaultMatchDateTimeLocal,
  utcIsoToLocalDateTime,
} from "@/lib/utils/kickoff-display";

export function formatFixtureLabel(fixture: FixtureOption): string {
  const timePart = formatFixtureKickoffLocal(fixture.date);
  return `${fixture.home.name} vs ${fixture.away.name} · ${timePart}`;
}

export function parseFixtureDateTime(isoDate: string): { date: string; time: string } {
  return utcIsoToLocalDateTime(isoDate);
}

/** Local date (YYYY-MM-DD) and time (HH:MM) rounded to the nearest hour. */
export function getDefaultMatchDateTime(now = new Date()): { date: string; time: string } {
  return getDefaultMatchDateTimeLocal(now);
}

export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

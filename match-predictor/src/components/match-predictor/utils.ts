import type { FixtureOption } from "@/lib/types/football-lookup";

export function formatFixtureLabel(fixture: FixtureOption): string {
  const kickoff = new Date(fixture.date);
  const dateLabel = kickoff.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = kickoff.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
  return `${fixture.home.name} vs ${fixture.away.name} · ${dateLabel} ${timeLabel}`;
}

export function parseFixtureDateTime(isoDate: string): { date: string; time: string } {
  const kickoff = new Date(isoDate);
  return {
    date: kickoff.toISOString().slice(0, 10),
    time: kickoff.toISOString().slice(11, 16),
  };
}

/** UTC date (YYYY-MM-DD) and time (HH:MM) rounded to the nearest hour. */
export function getDefaultMatchDateTime(now = new Date()): { date: string; time: string } {
  const rounded = new Date(now);
  if (rounded.getUTCMinutes() >= 30) {
    rounded.setUTCHours(rounded.getUTCHours() + 1);
  }
  rounded.setUTCMinutes(0, 0, 0);

  const date = [
    rounded.getUTCFullYear(),
    String(rounded.getUTCMonth() + 1).padStart(2, "0"),
    String(rounded.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const time = `${String(rounded.getUTCHours()).padStart(2, "0")}:00`;

  return { date, time };
}

export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

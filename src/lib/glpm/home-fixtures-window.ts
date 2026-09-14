import type { GlpmHubUpcomingMatch } from "@/lib/glpm/hub-types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar YYYY-MM-DD. */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function matchLocalYmd(match: GlpmHubUpcomingMatch): string | null {
  if (match.kickoffAt) {
    const kickoff = new Date(match.kickoffAt);
    if (!Number.isNaN(kickoff.getTime())) return localYmd(kickoff);
  }
  if (match.date) return match.date.slice(0, 10);
  return null;
}

function addLocalDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + delta, 12, 0, 0);
  return localYmd(dt);
}

/**
 * Local calendar days from today through today+7 that have upcoming matches.
 * Covers the rest of this matchweek plus the following weekend.
 */
export function upcomingWeekWindow(
  matches: GlpmHubUpcomingMatch[],
  now = new Date()
): string[] {
  const today = localYmd(now);
  const last = addLocalDays(today, 7);
  const days = new Set<string>();
  for (const match of matches) {
    const ymd = matchLocalYmd(match);
    if (!ymd || ymd < today || ymd > last) continue;
    days.add(ymd);
  }
  return [...days].sort();
}

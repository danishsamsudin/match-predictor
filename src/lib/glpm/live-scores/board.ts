import {
  isFinishedFixture,
  SM_FIXTURE_STATE_FINISHED,
} from "@/lib/glpm/sportmonks/fixtureSchedule";
import {
  addCalendarDays,
  formatDateInTimeZone,
  resolveMatchdayTimeZone,
} from "@/lib/glpm/sportmonks/matchday";
import { LIVE_POLL_AFTER_KICKOFF_MS } from "./constants";

export type ScoreboardRowRef = {
  sm_id: number;
  state_id: number | null;
  status: string | null;
  kickoff_at: string | null;
  match_date?: string | null;
  home_score: number | null;
  away_score: number | null;
};

export type ScoreboardCalendar = {
  timeZone: string;
  todayDate: string;
  yesterdayDate: string;
};

export function scoreboardCalendar(
  nowMs = Date.now(),
  timeZone = resolveMatchdayTimeZone()
): ScoreboardCalendar {
  const todayDate = formatDateInTimeZone(new Date(nowMs), timeZone);
  return {
    timeZone,
    todayDate,
    yesterdayDate: addCalendarDays(todayDate, -1),
  };
}

export function isFinishedScoreboardRow(row: ScoreboardRowRef): boolean {
  if (row.state_id != null && SM_FIXTURE_STATE_FINISHED.has(row.state_id)) return true;
  return isFinishedFixture({
    id: row.sm_id,
    stateId: row.state_id,
    stateName: row.status,
  });
}

export function hasPostedScore(row: ScoreboardRowRef): boolean {
  return row.home_score != null && row.away_score != null;
}

/**
 * Treat a row as a result when SportMonks marked it finished, or when kickoff
 * is older than the live poll window and a score is already posted.
 */
export function looksFinishedScoreboardRow(row: ScoreboardRowRef, nowMs: number): boolean {
  if (isFinishedScoreboardRow(row)) return true;
  if (!hasPostedScore(row) || !row.kickoff_at) return false;
  const kickMs = Date.parse(row.kickoff_at);
  if (!Number.isFinite(kickMs)) return false;
  return nowMs - kickMs > LIVE_POLL_AFTER_KICKOFF_MS;
}

export function kickoffYmd(row: ScoreboardRowRef, timeZone: string): string | null {
  if (row.kickoff_at) {
    const kickMs = Date.parse(row.kickoff_at);
    if (Number.isFinite(kickMs)) {
      return formatDateInTimeZone(new Date(kickMs), timeZone);
    }
  }
  const dateOnly = row.match_date?.slice(0, 10);
  return dateOnly || null;
}

export function finishedStatusLabel(row: Pick<ScoreboardRowRef, "state_id" | "status">): string {
  if (row.state_id === 7) return "AET";
  if (row.state_id === 8) return "Pens";
  if (row.state_id === 11) return "Awarded";
  if (row.state_id === 12) return "WO";
  const raw = row.status?.trim().toLowerCase();
  if (raw === "after extra time" || raw === "aet") return "AET";
  if (raw === "after penalties" || raw === "ap") return "Pens";
  if (raw === "awarded") return "Awarded";
  if (raw === "walkover") return "WO";
  return "FT";
}

export function splitDayResults<T extends ScoreboardRowRef>(args: {
  rows: T[];
  liveIds: Set<number>;
  todayDate: string;
  yesterdayDate: string;
  timeZone: string;
  nowMs: number;
}): { finishedToday: T[]; yesterday: T[] } {
  const finishedToday: T[] = [];
  const yesterday: T[] = [];

  for (const row of args.rows) {
    if (args.liveIds.has(row.sm_id)) continue;
    const ymd = kickoffYmd(row, args.timeZone);
    if (!ymd) continue;

    if (ymd === args.todayDate) {
      if (looksFinishedScoreboardRow(row, args.nowMs)) finishedToday.push(row);
      continue;
    }

    if (ymd === args.yesterdayDate && (looksFinishedScoreboardRow(row, args.nowMs) || hasPostedScore(row))) {
      yesterday.push(row);
    }
  }

  finishedToday.sort((a, b) => (b.kickoff_at ?? "").localeCompare(a.kickoff_at ?? ""));
  yesterday.sort((a, b) => {
    const kick = (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? "");
    return kick !== 0 ? kick : a.sm_id - b.sm_id;
  });

  return { finishedToday, yesterday };
}

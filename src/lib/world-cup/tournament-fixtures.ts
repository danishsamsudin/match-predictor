import {
  inferGroupCodeFromDraw,
  WORLD_CUP_2026_TOURNAMENT_END,
  WORLD_CUP_2026_TOURNAMENT_START,
} from "@/lib/world-cup/group-draw";
import type { WcMatchRow } from "@/lib/world-cup/standings";

/** 12 groups × 6 matches per group. */
export const WORLD_CUP_2026_GROUP_STAGE_MATCH_COUNT = 72;

const KNOCKOUT_ROUND_RE =
  /round of|quarter-?final|semi-?final|third place|final\b|knockout/i;

function isFbrefScheduleId(id: string): boolean {
  return /^[a-f0-9]{6,12}$/i.test(id.trim());
}

function pairDateKey(
  homeId: string | null,
  awayId: string | null,
  date: string | null
): string | null {
  if (!homeId || !awayId || !date) return null;
  const [a, b] = homeId < awayId ? [homeId, awayId] : [awayId, homeId];
  return `${a}|${b}|${date}`;
}

function matchRowScore(m: WcMatchRow): number {
  let score = 0;
  if (isFifaWorldCup2026FinalsCompetition(m.competition, m.date)) score += 20;
  if (m.id && isFbrefScheduleId(m.id)) score += 10;
  if (m.venue_city?.trim() || m.venue?.trim()) score += 5;
  if (m.group_code) score += 3;
  if (m.time) score += 1;
  if (m.home_goals != null && m.away_goals != null) score += 25;
  if (m.status === "finished") score += 10;
  return score;
}

export function isExcludedWorldCupCompetition(competition: string | null | undefined): boolean {
  const comp = (competition ?? "").toLowerCase();
  return (
    comp.includes("qualif") ||
    comp.includes("wcq") ||
    comp.includes("play-off") ||
    comp.includes("playoff")
  );
}

/** Finals tournament window with official competition label (not date-only). */
export function isFifaWorldCup2026FinalsCompetition(
  competition: string | null | undefined,
  date: string | null | undefined
): boolean {
  if (!date || date < WORLD_CUP_2026_TOURNAMENT_START || date > WORLD_CUP_2026_TOURNAMENT_END) {
    return false;
  }
  if (isExcludedWorldCupCompetition(competition)) return false;
  const comp = (competition ?? "").trim();
  if (/fifa\s+world\s+cup\s+2026/i.test(comp)) return true;
  // FBref schedule rows are stored as competition "World Cup" (see import merge).
  if (/^world\s+cup$/i.test(comp)) return true;
  return false;
}

/**
 * True for official group-stage fixtures: both teams in the same drawn group,
 * tournament dates, and not a knockout round label.
 */
export function isWorldCup2026GroupStageMatch(
  m: WcMatchRow,
  teamToGroup: Map<string, string>
): boolean {
  if (!isFifaWorldCup2026FinalsCompetition(m.competition, m.date)) {
    const round = `${m.competition ?? ""} ${m.round ?? ""}`;
    if (!/group\s+[a-l]/i.test(round)) return false;
    if (!m.date || m.date < WORLD_CUP_2026_TOURNAMENT_START || m.date > WORLD_CUP_2026_TOURNAMENT_END) {
      return false;
    }
    if (isExcludedWorldCupCompetition(m.competition)) return false;
  }

  if (m.round && KNOCKOUT_ROUND_RE.test(m.round)) return false;

  const groupFromDraw = inferGroupCodeFromDraw(m.home_team_id, m.away_team_id, teamToGroup);
  if (!groupFromDraw) return false;

  if (m.group_code && m.group_code.toUpperCase() !== groupFromDraw) return false;

  return true;
}

/** Collapse squad-log duplicates and schedule rows for the same pairing on the same date. */
export function dedupeWorldCupMatches<T extends WcMatchRow>(matches: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const m of matches) {
    const key = pairDateKey(m.home_team_id, m.away_team_id, m.date);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || matchRowScore(m) > matchRowScore(existing)) {
      byKey.set(key, m);
    }
  }

  return [...byKey.values()];
}

export function filterWorldCup2026GroupStageMatches<T extends WcMatchRow>(
  matches: T[],
  teamToGroup: Map<string, string>
): T[] {
  return dedupeWorldCupMatches(matches).filter((m) =>
    isWorldCup2026GroupStageMatch(m, teamToGroup)
  );
}

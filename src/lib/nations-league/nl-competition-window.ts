import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { WcMatchRow } from "@/lib/world-cup/standings";

/**
 * Gap (days) that splits UEFA international windows for NL.
 * Sep/Oct MD1–4 cluster vs November MD5–6 (~40 days) must not share
 * in-competition form or talent decay.
 */
export const NL_WINDOW_GAP_DAYS = 21;

/** Short turnaround inside a window (e.g. MD1 → MD2 in 3 days). */
export const NL_CONGESTION_REST_DAYS = 4;

export function parseIsoDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = dateStr.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function daysBetweenIso(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function isNlCompetition(competition: string | null | undefined): boolean {
  if (!competition) return true; // hub finished lists are already NL-scoped
  return /nations league/i.test(competition);
}

function matchInvolvesTeam(
  m: WcMatchRow,
  teamId: string,
  teamApiId: number,
  teamName?: string
): boolean {
  if (m.home_team_id === teamId || m.away_team_id === teamId) return true;
  const homeApi = resolveApiTeamId(m.home_team_id ?? "", m.home_team_name ?? "");
  const awayApi = resolveApiTeamId(m.away_team_id ?? "", m.away_team_name ?? "");
  if (homeApi === teamApiId || awayApi === teamApiId) return true;
  if (teamName) {
    const key = teamName.trim().toLowerCase();
    if ((m.home_team_name ?? "").trim().toLowerCase() === key) return true;
    if ((m.away_team_name ?? "").trim().toLowerCase() === key) return true;
  }
  return false;
}

/**
 * Finished NL matches for a team in the same congested window as `fixtureDate`.
 * Walks backwards from the fixture; stops when the gap to the previous match
 * exceeds {@link NL_WINDOW_GAP_DAYS}.
 */
export function filterMatchesInSameWindow(
  finishedMatches: WcMatchRow[],
  teamId: string,
  teamApiId: number,
  fixtureDate: string | null | undefined,
  options?: { windowGapDays?: number; teamName?: string }
): WcMatchRow[] {
  const gap = options?.windowGapDays ?? NL_WINDOW_GAP_DAYS;
  const fx = parseIsoDate(fixtureDate);
  if (!fx) return [];

  const prior = finishedMatches
    .filter((m) => isNlCompetition(m.competition))
    .filter((m) => {
      const finished =
        m.status === "finished" || (m.home_goals != null && m.away_goals != null);
      return finished;
    })
    .filter((m) => matchInvolvesTeam(m, teamId, teamApiId, options?.teamName))
    .filter((m) => {
      const d = parseIsoDate(m.date);
      return d != null && d < fx;
    })
    .sort((a, b) => (parseIsoDate(a.date) ?? "").localeCompare(parseIsoDate(b.date) ?? ""));

  const included: WcMatchRow[] = [];
  let cursor = fx;
  for (let i = prior.length - 1; i >= 0; i--) {
    const d = parseIsoDate(prior[i]!.date);
    if (!d) continue;
    if (daysBetweenIso(d, cursor) <= gap) {
      included.push(prior[i]!);
      cursor = d;
    } else {
      break;
    }
  }
  return included.reverse();
}

/** Rest days since the team's last finished match in the same window (null if none). */
export function restDaysInWindow(
  windowMatches: WcMatchRow[],
  fixtureDate: string | null | undefined
): number | null {
  const fx = parseIsoDate(fixtureDate);
  if (!fx || !windowMatches.length) return null;
  const last = windowMatches[windowMatches.length - 1];
  const d = parseIsoDate(last?.date);
  if (!d) return null;
  return daysBetweenIso(d, fx);
}

/**
 * Synthetic rotation index from fixture congestion (0 = rested, ~0.35 = 3-day turnaround).
 * Used when XI-based rotation is unavailable.
 */
export function congestionRotationIndex(restDays: number | null): number {
  if (restDays == null || restDays > NL_CONGESTION_REST_DAYS) return 0;
  if (restDays <= 3) return 0.35;
  return 0.22;
}

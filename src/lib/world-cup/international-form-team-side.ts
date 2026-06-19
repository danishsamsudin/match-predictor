import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";

function norm(name: string): string {
  return normalizeNationalTeamName(name);
}

/** Stable key for the same fixture across FBref UUIDs, API ids, and name variants. */
export function canonicalInternationalFormMatchKey(
  match: InternationalFormMatch
): string {
  const homeLabel = norm(match.home_team_name ?? match.home_team_id ?? "home");
  const awayLabel = norm(match.away_team_name ?? match.away_team_id ?? "away");
  const [teamA, teamB] = [homeLabel, awayLabel].sort();
  return `${match.date ?? ""}|${teamA}|${teamB}`;
}

/** Prefer rows with richer metadata and official tournament alignment. */
export function internationalFormMatchPriority(match: InternationalFormMatch): number {
  let score = 0;
  if (match.competition?.toLowerCase().includes("world cup")) score += 20;
  if (match.event_id != null) score += 8;
  if (match.home_team_name?.trim() && match.away_team_name?.trim()) score += 6;
  if (match.home_xg != null && match.away_xg != null) score += 4;
  if (match.processPayload) score += 3;
  return score;
}

export function dedupeInternationalFormMatches(
  matches: InternationalFormMatch[]
): InternationalFormMatch[] {
  const byKey = new Map<string, InternationalFormMatch>();
  for (const match of matches) {
    const key = canonicalInternationalFormMatchKey(match);
    const existing = byKey.get(key);
    if (
      !existing ||
      internationalFormMatchPriority(match) > internationalFormMatchPriority(existing)
    ) {
      byKey.set(key, match);
    }
  }
  return [...byKey.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function mergeInternationalFormWithWcFinals(
  form: InternationalFormMatch[],
  finalsSlice: InternationalFormMatch[]
): InternationalFormMatch[] {
  const merged = dedupeInternationalFormMatches(form);
  const byKey = new Map(
    merged.map((match) => [canonicalInternationalFormMatchKey(match), match] as const)
  );
  for (const row of finalsSlice) {
    byKey.set(canonicalInternationalFormMatchKey(row), row);
  }
  return [...byKey.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

function idMatches(
  candidate: string | null | undefined,
  teamId: string,
  apiTeamId: number
): boolean {
  if (!candidate) return false;
  if (candidate === teamId) return true;
  if (apiTeamId > 0 && candidate === String(apiTeamId)) return true;
  return false;
}

function nameMatches(
  candidate: string | null | undefined,
  teamName: string | undefined
): boolean {
  if (!candidate?.trim() || !teamName?.trim()) return false;
  return norm(candidate) === norm(teamName);
}

/**
 * Resolve whether a team played home or away in an international form row.
 * Matches DB UUID, Sofascore/API numeric id, or normalized team name.
 */
export function resolveInternationalFormTeamSide(
  match: InternationalFormMatch,
  teamId: string,
  teamName?: string
): "home" | "away" | null {
  const apiTeamId = resolveApiTeamId(teamId, teamName ?? "");

  if (idMatches(match.home_team_id, teamId, apiTeamId)) return "home";
  if (idMatches(match.away_team_id, teamId, apiTeamId)) return "away";

  if (nameMatches(match.home_team_name, teamName)) return "home";
  if (nameMatches(match.away_team_name, teamName)) return "away";

  return null;
}

export function isTeamInInternationalFormMatch(
  match: InternationalFormMatch,
  teamId: string,
  teamName?: string
): boolean {
  return resolveInternationalFormTeamSide(match, teamId, teamName) != null;
}

export function teamGoalsInInternationalForm(
  match: InternationalFormMatch,
  teamId: string,
  teamName?: string
): { goalsFor: number; goalsAgainst: number } | null {
  const side = resolveInternationalFormTeamSide(match, teamId, teamName);
  if (!side || match.home_goals == null || match.away_goals == null) return null;
  if (side === "home") {
    return { goalsFor: match.home_goals, goalsAgainst: match.away_goals };
  }
  return { goalsFor: match.away_goals, goalsAgainst: match.home_goals };
}

export function opponentInInternationalForm(
  match: InternationalFormMatch,
  teamId: string,
  teamName?: string
): { id: string | null; name: string | null } | null {
  const side = resolveInternationalFormTeamSide(match, teamId, teamName);
  if (!side) return null;
  if (side === "home") {
    return { id: match.away_team_id ?? null, name: match.away_team_name ?? null };
  }
  return { id: match.home_team_id ?? null, name: match.home_team_name ?? null };
}

export function pickInternationalFormSideValue<T>(
  match: InternationalFormMatch,
  teamId: string,
  teamName: string | undefined,
  homeValue: T,
  awayValue: T
): T | null {
  const side = resolveInternationalFormTeamSide(match, teamId, teamName);
  if (!side) return null;
  return side === "home" ? homeValue : awayValue;
}

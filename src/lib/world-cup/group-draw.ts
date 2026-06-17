import groupsPayload from "../../../data/world-cup-2026-groups.json";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { inferGroupCodeFromCompetition } from "@/lib/world-cup/enrich-matches";

export const WORLD_CUP_2026_TOURNAMENT_START = "2026-06-11";
export const WORLD_CUP_2026_TOURNAMENT_END = "2026-07-19";

export function loadGroupDraw(): Record<string, string[]> {
  const payload = groupsPayload as { groups: Record<string, string[]> };
  return payload.groups ?? {};
}

/** Map Supabase team id → group letter (A–L) using the official draw JSON. */
export function buildTeamIdToGroupMap(
  teamNameById: Map<string, string>,
  draw: Record<string, string[]> = loadGroupDraw()
): Map<string, string> {
  const normalizedDraw = new Map<string, string>();
  for (const [code, names] of Object.entries(draw)) {
    for (const name of names) {
      normalizedDraw.set(normalizeNationalTeamName(name), code.toUpperCase());
    }
  }

  const teamToGroup = new Map<string, string>();
  for (const [teamId, name] of teamNameById) {
    const group = normalizedDraw.get(normalizeNationalTeamName(name));
    if (group) teamToGroup.set(teamId, group);
  }
  return teamToGroup;
}

/** Both teams must belong to the same group in the draw. */
export function inferGroupCodeFromDraw(
  homeTeamId: string | null,
  awayTeamId: string | null,
  teamToGroup: Map<string, string>
): string | null {
  if (!homeTeamId || !awayTeamId) return null;
  const homeGroup = teamToGroup.get(homeTeamId);
  const awayGroup = teamToGroup.get(awayTeamId);
  if (homeGroup && awayGroup && homeGroup === awayGroup) return homeGroup;
  return null;
}

/** Finals tournament fixtures only — requires FIFA World Cup 2026 competition + dates. */
export function isWorldCup2026TournamentFixture(
  competition: string | null | undefined,
  date: string | null | undefined
): boolean {
  if (!date || date < WORLD_CUP_2026_TOURNAMENT_START || date > WORLD_CUP_2026_TOURNAMENT_END) {
    return false;
  }
  const comp = (competition ?? "").trim().toLowerCase();
  if (comp.includes("qualif") || comp.includes("wcq") || comp.includes("play-off")) {
    return false;
  }
  if (/fifa\s+world\s+cup\s+2026/i.test(comp)) return true;
  if (comp === "world cup") return true;
  return false;
}

export function resolveGroupCode(input: {
  existing: string | null | undefined;
  competition: string | null | undefined;
  round: string | null | undefined;
  date: string | null | undefined;
  homeTeamId: string | null;
  awayTeamId: string | null;
  teamToGroup: Map<string, string>;
}): string | null {
  const existing = input.existing?.trim().toUpperCase();
  if (existing && /^[A-L]$/.test(existing)) return existing;

  const fromText = inferGroupCodeFromCompetition(
    input.competition ?? null,
    input.round ?? null
  );
  if (fromText) return fromText;

  if (!isWorldCup2026TournamentFixture(input.competition, input.date)) return null;

  return inferGroupCodeFromDraw(
    input.homeTeamId,
    input.awayTeamId,
    input.teamToGroup
  );
}

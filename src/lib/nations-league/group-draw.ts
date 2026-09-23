import groupsPayload from "../../../data/nations-league-2026/groups.json";
import {
  findNationsLeagueTeamByName,
  NATIONS_LEAGUE_2026_TEAMS,
} from "@/lib/data/nations-league-2026-teams";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";

export const NL_2026_LEAGUE_PHASE_START = "2026-09-24";
export const NL_2026_LEAGUE_PHASE_END = "2026-11-17";
export const NL_COMPETITION_LABEL = "UEFA Nations League 2026/27";

export type NlLeagueTier = "A" | "B" | "C" | "D";
export type NlGroupDraw = Record<string, string[]>;

export function loadNlGroupDraw(): NlGroupDraw {
  const payload = groupsPayload as { groups: NlGroupDraw };
  return payload.groups ?? {};
}

export function leagueTierFromGroupCode(groupCode: string | null | undefined): NlLeagueTier | null {
  if (!groupCode) return null;
  const t = groupCode.trim().charAt(0).toUpperCase();
  if (t === "A" || t === "B" || t === "C" || t === "D") return t;
  return null;
}

export function buildNlTeamIdToGroupMap(
  draw: NlGroupDraw = loadNlGroupDraw()
): Map<number, string> {
  const map = new Map<number, string>();
  for (const [code, names] of Object.entries(draw)) {
    for (const name of names) {
      const team = findNationsLeagueTeamByName(name);
      if (team) map.set(team.id, code.toUpperCase());
    }
  }
  return map;
}

export function buildNlTeamNameToGroupMap(
  draw: NlGroupDraw = loadNlGroupDraw()
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [code, names] of Object.entries(draw)) {
    for (const name of names) {
      map.set(normalizeNationalTeamName(name), code.toUpperCase());
    }
  }
  return map;
}

export function inferNlGroupCodeFromDraw(
  homeTeamId: number,
  awayTeamId: number,
  teamToGroup: Map<number, string> = buildNlTeamIdToGroupMap()
): string | null {
  const home = teamToGroup.get(homeTeamId);
  const away = teamToGroup.get(awayTeamId);
  if (home && away && home === away) return home;
  return null;
}

export function isNationsLeague202627Fixture(
  competition: string | null | undefined,
  date: string | null | undefined
): boolean {
  const c = (competition ?? "").toLowerCase();
  if (!/nations league/.test(c)) return false;
  const d = (date ?? "").slice(0, 10);
  if (!d) return false;
  return d >= "2026-09-01" && d <= "2027-06-30";
}

export function allNlTeamNames(): string[] {
  return NATIONS_LEAGUE_2026_TEAMS.map((t) => t.name);
}

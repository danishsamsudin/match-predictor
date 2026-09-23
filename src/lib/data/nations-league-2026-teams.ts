import type { TeamOption } from "@/lib/types/football-lookup";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";

/** Reference league id for UEFA Nations League in football-reference / Supabase sync. */
export const NATIONS_LEAGUE_REFERENCE_LEAGUE_ID = 5;

const NL_TEAM_IDS = new Set<number>();

/**
 * Sofascore / SportAPI national team ids for UEFA Nations League 2026/27 (54 nations).
 * IDs aligned with team-logo-manifest + WC catalog where overlapping.
 */
export const NATIONS_LEAGUE_2026_TEAMS: TeamOption[] = [
  // League A
  { id: 4481, name: "France" },
  { id: 4707, name: "Italy" },
  { id: 4717, name: "Belgium" },
  { id: 4700, name: "Türkiye" },
  { id: 4711, name: "Germany" },
  { id: 4705, name: "Netherlands" },
  { id: 6355, name: "Serbia" },
  { id: 4710, name: "Greece" },
  { id: 4698, name: "Spain" },
  { id: 4715, name: "Croatia" },
  { id: 4713, name: "England" },
  { id: 4714, name: "Czechia" },
  { id: 4704, name: "Portugal" },
  { id: 4476, name: "Denmark" },
  { id: 4475, name: "Norway" },
  { id: 4702, name: "Wales" },
  // League B
  { id: 4695, name: "Scotland" },
  { id: 4699, name: "Switzerland" },
  { id: 4484, name: "Slovenia" },
  { id: 4777, name: "North Macedonia" },
  { id: 4709, name: "Hungary" },
  { id: 4701, name: "Ukraine" },
  { id: 4763, name: "Georgia" },
  { id: 4786, name: "Northern Ireland" },
  { id: 4480, name: "Israel" },
  { id: 4718, name: "Austria" },
  { id: 4693, name: "Republic of Ireland" },
  { id: 154426, name: "Kosovo" },
  { id: 4703, name: "Poland" },
  { id: 4479, name: "Bosnia & Herzegovina" },
  { id: 4477, name: "Romania" },
  { id: 4688, name: "Sweden" },
  // League C
  { id: 4690, name: "Albania" },
  { id: 4712, name: "Finland" },
  { id: 4743, name: "Belarus" },
  { id: 4833, name: "San Marino" },
  { id: 7139, name: "Montenegro" },
  { id: 4740, name: "Armenia" },
  { id: 4482, name: "Cyprus" },
  { id: 4706, name: "Latvia" },
  { id: 4772, name: "Kazakhstan" },
  { id: 4697, name: "Slovakia" },
  { id: 4760, name: "Faroe Islands" },
  { id: 4782, name: "Moldova" },
  { id: 4708, name: "Iceland" },
  { id: 4716, name: "Bulgaria" },
  { id: 4759, name: "Estonia" },
  { id: 4478, name: "Luxembourg" },
  // League D
  { id: 129264, name: "Gibraltar" },
  { id: 4483, name: "Malta" },
  { id: 4818, name: "Andorra" },
  { id: 4776, name: "Lithuania" },
  { id: 4742, name: "Azerbaijan" },
  { id: 4830, name: "Liechtenstein" },
];

for (const team of NATIONS_LEAGUE_2026_TEAMS) {
  NL_TEAM_IDS.add(team.id);
}

export function isNationsLeagueLeague(leagueId: number): boolean {
  return leagueId === NATIONS_LEAGUE_REFERENCE_LEAGUE_ID;
}

/** UI/model hint: NL Graham runs stamp `nl-*` model versions. */
export function isNationsLeagueModelVersion(modelVersion?: string | null): boolean {
  return Boolean(modelVersion?.startsWith("nl-"));
}

/** Prefer selected tournament id; fall back to prediction model version. */
export function isNationsLeaguePredictUi(opts: {
  referenceLeagueId?: number | null;
  modelVersion?: string | null;
}): boolean {
  if (
    opts.referenceLeagueId != null &&
    Number.isFinite(opts.referenceLeagueId) &&
    isNationsLeagueLeague(opts.referenceLeagueId)
  ) {
    return true;
  }
  return isNationsLeagueModelVersion(opts.modelVersion);
}

export function isNationsLeague2026TeamId(teamId: number): boolean {
  return NL_TEAM_IDS.has(teamId);
}

export function isNationsLeague2026TeamName(name: string): boolean {
  const key = normalizeNationalTeamName(name);
  return NATIONS_LEAGUE_2026_TEAMS.some((t) => normalizeNationalTeamName(t.name) === key);
}

export function filterToNationsLeagueTeams(teams: TeamOption[]): TeamOption[] {
  const byId = new Map(NATIONS_LEAGUE_2026_TEAMS.map((t) => [t.id, t]));
  for (const team of teams) {
    if (NL_TEAM_IDS.has(team.id)) {
      byId.set(team.id, { ...byId.get(team.id), ...team, name: team.name });
    }
  }
  return NATIONS_LEAGUE_2026_TEAMS.map((ref) => byId.get(ref.id) ?? ref);
}

export function findNationsLeagueTeamByName(name: string): TeamOption | undefined {
  const key = normalizeNationalTeamName(name);
  return NATIONS_LEAGUE_2026_TEAMS.find((t) => normalizeNationalTeamName(t.name) === key);
}

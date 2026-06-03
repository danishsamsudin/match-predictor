import squadsPayload from "../../../data/world-cup-2026-official-squads.json";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
  isWorldCup2026TeamName,
} from "@/lib/data/world-cup-2026-teams";

export type OfficialWcCoach = {
  name: string;
  nationality: string | null;
  role: string;
};

export type OfficialWcPlayer = {
  name: string;
  position: string;
  dob: string;
  club: string;
  heightCm: number;
};

export type OfficialWcTeamSquad = {
  fifaName: string;
  code: string;
  coach: OfficialWcCoach | null;
  players: OfficialWcPlayer[];
};

export type OfficialWcSquadsFile = {
  source: string;
  version: string;
  publishedAt: string;
  teams: Record<string, OfficialWcTeamSquad>;
};

export const OFFICIAL_WC_2026_SQUADS = squadsPayload as OfficialWcSquadsFile;

const TEAM_BY_NORMALIZED_NAME = new Map(
  WORLD_CUP_2026_TEAMS.map((team) => [normalizeNationalTeamName(team.name), team.name])
);

/** Canonical app team label for a World Cup 2026 nation (matches JSON keys). */
export function resolveWc2026TeamLabel(
  teamName?: string,
  teamId?: number
): string | null {
  if (teamId != null) {
    const byId = WORLD_CUP_2026_TEAMS.find((team) => team.id === teamId);
    if (byId) return byId.name;
  }
  if (!teamName?.trim()) return null;
  if (!isWorldCup2026TeamName(teamName)) return null;
  const key = normalizeNationalTeamName(teamName);
  return TEAM_BY_NORMALIZED_NAME.get(key) ?? null;
}

export function getOfficialWcTeamSquad(teamLabel: string): OfficialWcTeamSquad | null {
  return OFFICIAL_WC_2026_SQUADS.teams[teamLabel] ?? null;
}

export function officialWcSquadPublishedDate(): string {
  return OFFICIAL_WC_2026_SQUADS.publishedAt;
}

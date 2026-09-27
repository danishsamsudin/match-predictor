import md1StartingXis from "../../../data/nations-league-2026/md1-starting-xis.json";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";

export type NlMd1Player = {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  jerseyNumber: string | null;
  substitute: boolean;
};

export type NlMd1TeamLineup = {
  teamId: number;
  teamName: string;
  formation: string | null;
  starters: NlMd1Player[];
  substitutes: NlMd1Player[];
};

type Md1File = {
  scrapedAt?: string;
  matchday?: number;
  teams?: NlMd1TeamLineup[];
};

let byTeamId: Map<number, NlMd1TeamLineup> | null = null;
let byTeamName: Map<string, NlMd1TeamLineup> | null = null;

function ensureIndexes(): void {
  if (byTeamId && byTeamName) return;
  byTeamId = new Map();
  byTeamName = new Map();
  const file = md1StartingXis as Md1File;
  for (const team of file.teams ?? []) {
    if (!team?.teamId || !team.starters?.length) continue;
    byTeamId.set(team.teamId, team);
    byTeamName.set(normalizeNationalTeamName(team.teamName), team);
  }
}

/** Actual Matchday 1 starting XI + bench from Sofascore (committed JSON). */
export function getNlMd1TeamLineup(
  teamId?: number | null,
  teamName?: string | null
): NlMd1TeamLineup | null {
  ensureIndexes();
  if (teamId != null && Number.isFinite(teamId)) {
    const byId = byTeamId!.get(teamId);
    if (byId) return byId;
  }
  if (teamName?.trim()) {
    return byTeamName!.get(normalizeNationalTeamName(teamName)) ?? null;
  }
  return null;
}

export function nlMd1SquadScrapedAt(): string | null {
  return (md1StartingXis as Md1File).scrapedAt ?? null;
}

export function listNlMd1TeamLineups(): NlMd1TeamLineup[] {
  ensureIndexes();
  return [...byTeamId!.values()];
}

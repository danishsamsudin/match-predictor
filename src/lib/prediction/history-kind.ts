import { getLeagueById } from "@/lib/data/football-reference";
import {
  isWorldCupLeague,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
export type PredictionHistoryKind =
  | "world_cup"
  | "league_compare"
  | "league_fixture"
  | "international";

export type PredictionHistoryKindMeta = {
  kind: PredictionHistoryKind;
  label: string;
};

const WORLD_CUP_TEAM_IDS = new Set(WORLD_CUP_2026_TEAMS.map((t) => t.id));

function snapshotEntityType(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const entityType = (snapshot as Record<string, unknown>).entityType;
  return entityType === "national" || entityType === "club" ? entityType : undefined;
}

function isWorldCupTeamPair(homeTeamId: number, awayTeamId: number): boolean {
  return WORLD_CUP_TEAM_IDS.has(homeTeamId) && WORLD_CUP_TEAM_IDS.has(awayTeamId);
}

export function classifyStoredPrediction(row: {
  entity_type?: string | null;
  comparison_mode?: string | null;
  home_league_id?: number | null;
  away_league_id?: number | null;
  home_team_id: number;
  away_team_id: number;
  inputs_snapshot?: unknown;
}): PredictionHistoryKind {
  const snapshotType = snapshotEntityType(row.inputs_snapshot);
  const entityType = row.entity_type ?? snapshotType ?? "club";

  const homeLeague = row.home_league_id ?? undefined;
  const awayLeague = row.away_league_id ?? undefined;
  const worldCupLeague =
    (homeLeague != null && isWorldCupLeague(homeLeague)) ||
    (awayLeague != null && isWorldCupLeague(awayLeague));

  if (
    entityType === "national" ||
    worldCupLeague ||
    isWorldCupTeamPair(row.home_team_id, row.away_team_id)
  ) {
    if (worldCupLeague || isWorldCupTeamPair(row.home_team_id, row.away_team_id)) {
      return "world_cup";
    }
    return "international";
  }

  if (row.comparison_mode === "compare") {
    return "league_compare";
  }

  return "league_fixture";
}

export function kindMetaForStoredPrediction(row: {
  entity_type?: string | null;
  comparison_mode?: string | null;
  home_league_id?: number | null;
  away_league_id?: number | null;
  home_team_id: number;
  away_team_id: number;
  inputs_snapshot?: unknown;
}): PredictionHistoryKindMeta {
  const kind = classifyStoredPrediction(row);

  if (kind === "world_cup") {
    return { kind, label: "World Cup" };
  }

  if (kind === "international") {
    return { kind, label: "International" };
  }

  if (kind === "league_compare") {
    const homeLeague = row.home_league_id != null ? getLeagueById(row.home_league_id) : null;
    const awayLeague = row.away_league_id != null ? getLeagueById(row.away_league_id) : null;
    if (homeLeague && awayLeague && homeLeague.id === awayLeague.id) {
      return { kind, label: homeLeague.name };
    }
    if (homeLeague && awayLeague) {
      return { kind, label: `${homeLeague.name} · ${awayLeague.name}` };
    }
    return { kind, label: "League compare" };
  }

  const leagueId = row.home_league_id ?? row.away_league_id;
  const league = leagueId != null ? getLeagueById(leagueId) : null;
  if (league) {
    return { kind, label: league.name };
  }
  return { kind, label: "League match" };
}

export function worldCupHubKindMeta(): PredictionHistoryKindMeta {
  return { kind: "world_cup", label: "World Cup" };
}

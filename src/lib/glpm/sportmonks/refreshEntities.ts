import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import { tryCreateServiceClient } from "../../supabase";
import {
  createSportmonksClient,
  PLAN_PLAYER_INCLUDE,
  PLAN_PLAYER_INCLUDE_MINIMAL,
  SportmonksApiError,
} from "../../sportmonks/client";
import { chunkIds, DEFAULT_GLPM_SEASON_IDS_2026_27 } from "../../sportmonks/constants";
import type { SmCoach, SmPlayer } from "../../sportmonks/types";
import {
  upsertSportmonksCoachesBatch,
  upsertSportmonksPlayersBatch,
  upsertSportmonksTeamsBatch,
} from "../layer1/sportmonks/mapEntities";

type Client = SupabaseClient<Database>;

export type EntityRefreshSummary = {
  discoveredTeamIds: number;
  fetched: number;
  upserted: number;
  failed: number;
  dryRun: boolean;
};

function extractParticipantIds(payload: unknown): number[] {
  const ids = new Set<number>();
  const walk = (node: unknown, parentKey: string | null) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parentKey);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (parentKey === "participants" && typeof obj.id === "number") {
      ids.add(obj.id);
    }
    for (const [k, v] of Object.entries(obj)) walk(v, k);
  };
  walk(payload, null);
  return [...ids];
}

export async function discoverGlpmTeamIds(
  supabase: Client,
  seasonIds: number[],
  client = createSportmonksClient()
): Promise<number[]> {
  const ids = new Set<number>();

  const { data: matchTeams } = await supabase
    .from("glpm_matches")
    .select("home_team_sm_id, away_team_sm_id")
    .in("season_id", seasonIds);

  for (const row of matchTeams ?? []) {
    ids.add(row.home_team_sm_id);
    ids.add(row.away_team_sm_id);
  }

  for (const seasonId of seasonIds) {
    try {
      const schedule = await client.getSeasonSchedule(seasonId);
      for (const teamId of extractParticipantIds(schedule)) ids.add(teamId);
    } catch {
      // Season schedule may not be published yet.
    }
  }

  const { data: existingTeams } = await supabase.from("glpm_teams").select("sm_id");
  for (const row of existingTeams ?? []) ids.add(row.sm_id);

  return [...ids].sort((a, b) => a - b);
}

export type RefreshTeamsOptions = {
  seasonIds?: number[];
  teamIds?: number[];
  dryRun?: boolean;
  maxTeams?: number;
};

export async function refreshSportmonksTeams(
  options: RefreshTeamsOptions = {}
): Promise<EntityRefreshSummary> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const client = createSportmonksClient();
  const seasonIds = options.seasonIds ?? DEFAULT_GLPM_SEASON_IDS_2026_27;

  let teamIds =
    options.teamIds ??
    (await discoverGlpmTeamIds(supabase, seasonIds, client));

  if (options.maxTeams != null && Number.isFinite(options.maxTeams)) {
    teamIds = teamIds.slice(0, options.maxTeams);
  }

  if (options.dryRun) {
    return {
      discoveredTeamIds: teamIds.length,
      fetched: 0,
      upserted: 0,
      failed: 0,
      dryRun: true,
    };
  }

  let fetched = 0;
  let upserted = 0;
  let failed = 0;

  for (const chunk of chunkIds(teamIds)) {
    try {
      const teams = await client.listTeamsByIds(chunk);
      fetched += teams.length;
      upserted += await upsertSportmonksTeamsBatch(supabase, teams);
    } catch (err) {
      failed += chunk.length;
      console.error(
        "Team chunk refresh failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    discoveredTeamIds: teamIds.length,
    fetched,
    upserted,
    failed,
    dryRun: false,
  };
}

export type RefreshPlayersOptions = {
  seasonIds?: number[];
  teamIds?: number[];
  dryRun?: boolean;
  maxPages?: number;
  maxPlayers?: number;
};

type SquadRow = {
  player_id?: number;
  team_id?: number;
  player?: SmPlayer;
};

function playersFromSquadPayload(payload: unknown): SmPlayer[] {
  const res = payload as { data?: SquadRow[] };
  const rows = Array.isArray(res?.data) ? res.data : Array.isArray(payload) ? payload : [];
  const players: SmPlayer[] = [];

  for (const row of rows as SquadRow[]) {
    const player = row.player;
    if (!player?.id) continue;
    const teamId = row.team_id ?? player.teams?.[0]?.team_id;
    players.push({
      ...player,
      teams:
        player.teams?.length || teamId == null
          ? player.teams
          : [{ team_id: teamId, end: null }],
    });
  }

  return players;
}

function coachesFromTeamPayload(teams: Array<{ id: number; coaches?: SmCoach[] }>): SmCoach[] {
  const dedup = new Map<number, SmCoach>();
  for (const team of teams) {
    for (const coach of team.coaches ?? []) {
      if (!coach?.id) continue;
      const withTeam = {
        ...coach,
        teams: [
          ...(coach.teams ?? []),
          { team_id: team.id, active: true, end: null },
        ],
      };
      dedup.set(coach.id, withTeam);
    }
  }
  return [...dedup.values()];
}

async function fetchPlayersFromSquads(
  client: ReturnType<typeof createSportmonksClient>,
  seasonIds: number[],
  teamIds: number[],
  maxPlayers?: number
): Promise<SmPlayer[]> {
  const dedup = new Map<number, SmPlayer>();

  for (const seasonId of seasonIds) {
    for (const teamId of teamIds) {
      if (maxPlayers != null && dedup.size >= maxPlayers) break;
      try {
        const payload = await client.getTeamSquad(seasonId, teamId);
        for (const player of playersFromSquadPayload(payload)) {
          dedup.set(player.id, player);
          if (maxPlayers != null && dedup.size >= maxPlayers) break;
        }
      } catch (err) {
        if (err instanceof SportmonksApiError && (err.status === 404 || err.status === 403)) {
          continue;
        }
        console.error(
          `Squad season=${seasonId} team=${teamId} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    if (maxPlayers != null && dedup.size >= maxPlayers) break;
  }

  return [...dedup.values()];
}

async function fetchPlayersScoped(
  client: ReturnType<typeof createSportmonksClient>,
  args: { seasonIds: number[]; teamIds: number[]; maxPages?: number; maxPlayers?: number }
): Promise<SmPlayer[]> {
  const dedup = new Map<number, SmPlayer>();

  const ingest = (players: SmPlayer[]) => {
    for (const p of players) {
      dedup.set(p.id, p);
      if (args.maxPlayers != null && dedup.size >= args.maxPlayers) return true;
    }
    return false;
  };

  const loadWithInclude = async (include: string) => {
    try {
      const players = await client.listPlayersBySeasons(args.seasonIds, include, {
        maxPages: args.maxPages,
      });
      if (ingest(players)) return;
    } catch (err) {
      if (!(err instanceof SportmonksApiError)) throw err;
      if (err.status !== 400 && err.status !== 403) throw err;
    }

    const fromSquads = await fetchPlayersFromSquads(
      client,
      args.seasonIds,
      args.teamIds,
      args.maxPlayers
    );
    ingest(fromSquads);
  };

  try {
    await loadWithInclude(PLAN_PLAYER_INCLUDE);
  } catch (err) {
    if (err instanceof SportmonksApiError && err.status === 403) {
      await loadWithInclude(PLAN_PLAYER_INCLUDE_MINIMAL);
    } else {
      throw err;
    }
  }

  const values = [...dedup.values()];
  if (args.maxPlayers != null && Number.isFinite(args.maxPlayers)) {
    return values.slice(0, args.maxPlayers);
  }
  return values;
}

export async function refreshSportmonksPlayers(
  options: RefreshPlayersOptions = {}
): Promise<EntityRefreshSummary> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const client = createSportmonksClient();
  const seasonIds = options.seasonIds ?? DEFAULT_GLPM_SEASON_IDS_2026_27;

  const teamIds =
    options.teamIds ??
    (await discoverGlpmTeamIds(supabase, seasonIds, client));

  if (options.dryRun) {
    return {
      discoveredTeamIds: teamIds.length,
      fetched: 0,
      upserted: 0,
      failed: 0,
      dryRun: true,
    };
  }

  // Players FK → glpm_teams; refresh team rows first.
  await refreshSportmonksTeams({ seasonIds, teamIds });

  let players = await fetchPlayersScoped(client, {
    seasonIds,
    teamIds,
    maxPages: options.maxPages,
    maxPlayers: options.maxPlayers,
  });

  if (options.maxPlayers != null && Number.isFinite(options.maxPlayers)) {
    players = players.slice(0, options.maxPlayers);
  }

  let upserted = 0;
  let failed = 0;

  try {
    upserted = await upsertSportmonksPlayersBatch(supabase, players);
  } catch (err) {
    failed = players.length;
    throw err;
  }

  return {
    discoveredTeamIds: teamIds.length,
    fetched: players.length,
    upserted,
    failed,
    dryRun: false,
  };
}

export type RefreshCoachesOptions = {
  seasonIds?: number[];
  teamIds?: number[];
  dryRun?: boolean;
  maxPages?: number;
  maxCoaches?: number;
};

async function fetchCoachesScoped(
  client: ReturnType<typeof createSportmonksClient>,
  teamIds: number[],
  maxPages?: number
): Promise<SmCoach[]> {
  const dedup = new Map<number, SmCoach>();

  for (const chunk of chunkIds(teamIds)) {
    try {
      const teams = await client.listTeamsByIds(chunk, "coaches");
      for (const coach of coachesFromTeamPayload(teams)) {
        dedup.set(coach.id, coach);
      }
    } catch (err) {
      console.error(
        "Coach chunk via teams failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  if (dedup.size === 0) {
    const coaches = await client.listCoaches(undefined, { maxPages });
    for (const c of coaches) dedup.set(c.id, c);
  }

  return [...dedup.values()];
}

export async function refreshSportmonksCoaches(
  options: RefreshCoachesOptions = {}
): Promise<EntityRefreshSummary> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const client = createSportmonksClient();
  const seasonIds = options.seasonIds ?? DEFAULT_GLPM_SEASON_IDS_2026_27;

  const teamIds =
    options.teamIds ??
    (await discoverGlpmTeamIds(supabase, seasonIds, client));

  if (options.dryRun) {
    return {
      discoveredTeamIds: teamIds.length,
      fetched: 0,
      upserted: 0,
      failed: 0,
      dryRun: true,
    };
  }

  await refreshSportmonksTeams({ seasonIds, teamIds });

  let coaches = await fetchCoachesScoped(client, teamIds, options.maxPages);

  if (teamIds.length) {
    const allowed = new Set(teamIds);
    coaches = coaches.filter((c) => {
      const links = c.teams ?? [];
      return links.some((t) => t.team_id != null && allowed.has(t.team_id));
    });
  }

  if (options.maxCoaches != null && Number.isFinite(options.maxCoaches)) {
    coaches = coaches.slice(0, options.maxCoaches);
  }

  const upserted = await upsertSportmonksCoachesBatch(supabase, coaches);

  return {
    discoveredTeamIds: teamIds.length,
    fetched: coaches.length,
    upserted,
    failed: 0,
    dryRun: false,
  };
}

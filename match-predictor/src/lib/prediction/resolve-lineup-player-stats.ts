import { listFbrefPlayerStatsForTeam } from "@/lib/fbref/supabase-store";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { squadPositionToLineupPos } from "@/lib/prediction/build-custom-lineup";
import type { FixtureLineup } from "@/lib/types/football";
import type { SquadPlayer } from "@/lib/types/team-comparison";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedLineupPlayer = {
  playerId: number;
  name: string;
  role: "G" | "D" | "M" | "F";
  stats: Record<string, string | number | null>;
  performanceScore: number | null;
};

export type LineupPlayerStatsMap = Map<number, ResolvedLineupPlayer>;

async function loadScoutlystStatsByPlayerId(
  supabase: SupabaseClient<Database> | null,
  teamId: number
): Promise<Map<number, Record<string, string | number | null>>> {
  const map = new Map<number, Record<string, string | number | null>>();
  if (!supabase) return map;

  const { data } = await supabase
    .from("scoutlyst_player_snapshots")
    .select("sofascore_player_id, stats, snapshot_date")
    .eq("reference_team_id", teamId)
    .order("snapshot_date", { ascending: false })
    .limit(500);

  for (const row of data ?? []) {
    const id = row.sofascore_player_id;
    if (id == null || map.has(id)) continue;
    const stats =
      row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? (row.stats as Record<string, string | number | null>)
        : {};
    map.set(id, stats);
  }
  return map;
}

async function loadFbrefStatsByPlayerId(
  supabase: SupabaseClient<Database> | null,
  teamId: string
): Promise<Map<string, Record<string, string | number | null>>> {
  const map = new Map<string, Record<string, string | number | null>>();
  if (!supabase) return map;

  try {
    const rows = await listFbrefPlayerStatsForTeam(teamId);
    for (const row of rows) {
      const existing = map.get(row.player_id) ?? {};
      const stats = row.stats as Record<string, string | number | null>;
      map.set(row.player_id, { ...existing, ...stats });
    }
  } catch {
    // FBref optional
  }
  return map;
}

function squadPlayerToResolved(
  p: SquadPlayer,
  rawStats: Record<string, string | number | null>
): ResolvedLineupPlayer {
  return {
    playerId: p.sofascorePlayerId,
    name: p.name,
    role: squadPositionToLineupPos(p.fieldPosition ?? p.position) as "G" | "D" | "M" | "F",
    stats: rawStats,
    performanceScore: p.performanceScore,
  };
}

async function loadTeamRosterStats(
  supabase: SupabaseClient<Database> | null,
  teamId: number,
  teamName: string | undefined,
  leagueId: number | undefined,
  entityType: "club" | "national" | undefined
): Promise<Map<number, ResolvedLineupPlayer>> {
  const [squad, scoutlystById, fbrefById] = await Promise.all([
    loadTeamSquadForComparison(supabase, teamId, teamName, leagueId, entityType),
    loadScoutlystStatsByPlayerId(supabase, teamId),
    loadFbrefStatsByPlayerId(supabase, String(teamId)),
  ]);

  const roster = [...squad.starters, ...squad.substitutes];
  const map = new Map<number, ResolvedLineupPlayer>();
  for (const p of roster) {
    const fbrefKey = p.scoutlystPlayerKey?.startsWith("fbref:")
      ? p.scoutlystPlayerKey.replace("fbref:", "")
      : null;
    const fbrefStats = (fbrefKey ? fbrefById.get(fbrefKey) ?? {} : {}) as Record<
      string,
      string | number | null
    >;
    const rawStats = { ...fbrefStats, ...(scoutlystById.get(p.sofascorePlayerId) ?? {}) };
    map.set(p.sofascorePlayerId, squadPlayerToResolved(p, rawStats));
  }
  return map;
}

/** Load per-player stats for starters from squad comparison data. */
export async function resolveLineupPlayerStats(input: {
  lineups: FixtureLineup[];
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName?: string;
  awayTeamName?: string;
  homeLeagueId?: number;
  awayLeagueId?: number;
  entityType?: "club" | "national";
  supabase: SupabaseClient<Database> | null;
}): Promise<{ home: LineupPlayerStatsMap; away: LineupPlayerStatsMap }> {
  const [homeRoster, awayRoster] = await Promise.all([
    loadTeamRosterStats(
      input.supabase,
      input.homeTeamId,
      input.homeTeamName,
      input.homeLeagueId,
      input.entityType
    ),
    loadTeamRosterStats(
      input.supabase,
      input.awayTeamId,
      input.awayTeamName,
      input.awayLeagueId,
      input.entityType
    ),
  ]);

  const homeLineup = input.lineups.find((l) => l.team.id === input.homeTeamId);
  const awayLineup = input.lineups.find((l) => l.team.id === input.awayTeamId);

  const home = new Map<number, ResolvedLineupPlayer>();
  const away = new Map<number, ResolvedLineupPlayer>();

  for (const slot of homeLineup?.startXI ?? []) {
    const id = slot.player.id;
    const fromRoster = homeRoster.get(id);
    home.set(
      id,
      fromRoster ?? {
        playerId: id,
        name: slot.player.name,
        role: (slot.player.pos as "G" | "D" | "M" | "F") || "M",
        stats: {},
        performanceScore: slot.player.performanceScore ?? null,
      }
    );
  }

  for (const slot of awayLineup?.startXI ?? []) {
    const id = slot.player.id;
    const fromRoster = awayRoster.get(id);
    away.set(
      id,
      fromRoster ?? {
        playerId: id,
        name: slot.player.name,
        role: (slot.player.pos as "G" | "D" | "M" | "F") || "M",
        stats: {},
        performanceScore: slot.player.performanceScore ?? null,
      }
    );
  }

  return { home, away };
}

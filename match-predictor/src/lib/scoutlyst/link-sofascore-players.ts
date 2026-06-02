import { normalizeTeamName, normalizeText } from "@/lib/soccerdata/normalize";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SportApiEvent, SportApiLineupsResponse } from "@/lib/types/sportapi";

export type SofaScorePlayerIndex = Map<string, number>;

function indexKey(teamId: number, playerName: string): string {
  return `${teamId}:${normalizeText(playerName)}`;
}

function collectFromLineupSide(
  side: SportApiLineupsResponse["home"] | undefined,
  teamId: number,
  index: SofaScorePlayerIndex
) {
  if (!side) return;
  for (const p of side.players ?? []) {
    const id = p.player?.id;
    const name = p.player?.name;
    if (!id || !name) continue;
    const key = indexKey(teamId, name);
    if (!index.has(key)) index.set(key, id);
  }
}

/** Build name+team → SofaScore player_id from recent stored lineups. */
export async function buildSofaScorePlayerIndex(
  supabase: SupabaseClient<Database>,
  options?: { lineupLimit?: number }
): Promise<SofaScorePlayerIndex> {
  const index: SofaScorePlayerIndex = new Map();
  const limit = options?.lineupLimit ?? 400;

  const { data: rows } = await supabase
    .from("synced_event_lineups")
    .select("event_id, payload")
    .order("synced_at", { ascending: false })
    .limit(limit);

  const eventIds = (rows ?? []).map((r) => r.event_id);
  if (!eventIds.length) return index;

  const { data: events } = await supabase
    .from("synced_events")
    .select("event_id, payload")
    .in("event_id", eventIds);

  const teamIdsByEvent = new Map<number, { homeId: number; awayId: number }>();
  for (const ev of events ?? []) {
    const payload = ev.payload as SportApiEvent | null;
    const homeId = payload?.homeTeam?.id;
    const awayId = payload?.awayTeam?.id;
    if (homeId && awayId) teamIdsByEvent.set(ev.event_id, { homeId, awayId });
  }

  for (const row of rows ?? []) {
    const teams = teamIdsByEvent.get(row.event_id);
    const lineups = row.payload as SportApiLineupsResponse | null;
    if (!teams || !lineups) continue;
    collectFromLineupSide(lineups.home, teams.homeId, index);
    collectFromLineupSide(lineups.away, teams.awayId, index);
  }

  return index;
}

export async function buildTeamNameToIdMap(
  supabase: SupabaseClient<Database>
): Promise<Map<string, number>> {
  const { data: teams } = await supabase.from("synced_teams").select("team_id, team_name");
  const map = new Map<string, number>();
  for (const row of teams ?? []) {
    const norm = normalizeTeamName(row.team_name);
    if (!map.has(norm)) map.set(norm, row.team_id);
  }
  return map;
}

export function resolveSofaScorePlayerId(input: {
  playerName: string;
  teamName: string | null;
  referenceTeamId: number | null;
  playerIndex: SofaScorePlayerIndex;
}): { sofascorePlayerId: number | null; confidence: number } {
  if (!input.referenceTeamId) return { sofascorePlayerId: null, confidence: 0 };
  const key = indexKey(input.referenceTeamId, input.playerName);
  const id = input.playerIndex.get(key);
  if (id != null) return { sofascorePlayerId: id, confidence: 0.85 };
  void input.teamName;
  return { sofascorePlayerId: null, confidence: 0 };
}

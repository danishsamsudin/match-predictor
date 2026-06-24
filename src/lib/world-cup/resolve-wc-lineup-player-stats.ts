import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { primaryPositionToken } from "@/lib/data/normalize-player-position";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WcResolvedLineupPlayer {
  optaPlayerId: string;
  playerName: string;
  role: "G" | "D" | "M" | "F";
  isStarter: boolean;
  availabilityFactor: number;
  avgOptaPoints: number | null;
  chanceIndexPer90: number | null;
  defensiveActionsPer90: number | null;
  gkSaveIndex: number | null;
  minutesTotal: number;
}

export type WcLineupPlayerStatsMap = Record<string, WcResolvedLineupPlayer>;

function normalizeName(name: string): string {
  return normalizeNationalTeamName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lastNameKey(name: string): string {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function roleFromPosition(position: string | null | undefined): "G" | "D" | "M" | "F" {
  const token = primaryPositionToken(position);
  const p = token.toUpperCase();
  if (p === "GK" || p === "G" || p.startsWith("G")) return "G";
  if (p.startsWith("D") || p === "CB" || p === "LB" || p === "RB") return "D";
  if (p.startsWith("F") || p === "ST" || p === "CF" || p === "LW" || p === "RW") return "F";
  return "M";
}

function positionFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const pos = p.last_position ?? p.position;
  return typeof pos === "string" ? pos : null;
}

function matchPlayerName(
  query: string,
  candidates: WcResolvedLineupPlayer[]
): WcResolvedLineupPlayer | null {
  const key = normalizeName(query);
  if (!key) return null;

  const exact = candidates.find((c) => normalizeName(c.playerName) === key);
  if (exact) return exact;

  const last = lastNameKey(query);
  if (!last || last.length < 2) return null;

  const byLast = candidates.filter((c) => {
    const n = normalizeName(c.playerName);
    return n.endsWith(` ${last}`) || n === last || n.split(" ").pop() === last;
  });

  if (byLast.length === 1) return byLast[0]!;
  return null;
}

async function loadTournamentFormForTeam(
  supabase: SupabaseClient,
  teamApiId: number
): Promise<WcResolvedLineupPlayer[]> {
  const { data } = await supabase
    .from("world_cup_player_tournament_form")
    .select("*")
    .eq("team_api_id", teamApiId);

  return (data ?? []).map((row) => {
    const position = positionFromPayload(row.payload);
    return {
      optaPlayerId: String(row.opta_player_id),
      playerName: String(row.player_name),
      role: roleFromPosition(position),
      isStarter: Boolean(row.was_last_starter),
      availabilityFactor: Number(row.availability_factor ?? 1),
      avgOptaPoints: row.avg_opta_points != null ? Number(row.avg_opta_points) : null,
      chanceIndexPer90: row.chance_index_per90 != null ? Number(row.chance_index_per90) : null,
      defensiveActionsPer90:
        row.defensive_actions_per90 != null ? Number(row.defensive_actions_per90) : null,
      gkSaveIndex: row.gk_save_index != null ? Number(row.gk_save_index) : null,
      minutesTotal: Number(row.minutes_total ?? 0),
    };
  });
}

async function loadMatchPositionsForTeam(
  supabase: SupabaseClient,
  teamApiId: number,
  playerNames: string[]
): Promise<Map<string, string>> {
  const { data: matchRows } = await supabase
    .from("world_cup_player_match_stats")
    .select("match_id")
    .eq("team_api_id", teamApiId)
    .eq("is_starter", true)
    .limit(100);

  const matchIds = [...new Set((matchRows ?? []).map((r) => String(r.match_id)))];
  if (!matchIds.length) return new Map();

  const { data: dated } = await supabase
    .from("matches")
    .select("id, date")
    .in("id", matchIds)
    .order("date", { ascending: false })
    .limit(1);

  const latestMatchId = dated?.[0]?.id;
  if (!latestMatchId) return new Map();

  const { data: starters } = await supabase
    .from("world_cup_player_match_stats")
    .select("player_name, position")
    .eq("match_id", latestMatchId)
    .eq("team_api_id", teamApiId)
    .eq("is_starter", true);

  const byNorm = new Map<string, string>();
  for (const row of starters ?? []) {
    const pos = row.position;
    if (typeof pos === "string" && pos) {
      byNorm.set(normalizeName(String(row.player_name)), pos);
    }
  }

  const result = new Map<string, string>();
  for (const name of playerNames) {
    const pos = byNorm.get(normalizeName(name));
    if (pos) result.set(name, pos);
  }
  return result;
}

export async function resolveWcLineupPlayerStats(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  playerNames: string[];
}): Promise<WcLineupPlayerStatsMap> {
  const candidates = await loadTournamentFormForTeam(input.supabase, input.teamApiId);
  const matchPositions = await loadMatchPositionsForTeam(
    input.supabase,
    input.teamApiId,
    input.playerNames
  );
  const map: WcLineupPlayerStatsMap = {};

  for (const name of input.playerNames) {
    const matched = matchPlayerName(name, candidates);
    if (matched) {
      const pos = matchPositions.get(name);
      map[name] = pos ? { ...matched, role: roleFromPosition(pos) } : matched;
    }
  }

  return map;
}

export function unresolvedWcLineupPlayerNames(
  playerNames: string[],
  resolved: WcLineupPlayerStatsMap
): string[] {
  return playerNames.filter((name) => !resolved[name]);
}

async function findLatestStarterMatchId(
  supabase: SupabaseClient,
  teamApiId: number
): Promise<string | null> {
  const { data: matchRows } = await supabase
    .from("world_cup_player_match_stats")
    .select("match_id")
    .eq("team_api_id", teamApiId)
    .eq("is_starter", true)
    .limit(200);

  const matchIds = [...new Set((matchRows ?? []).map((r) => String(r.match_id)))];
  if (!matchIds.length) return null;

  const { data: dated } = await supabase
    .from("matches")
    .select("id, date")
    .in("id", matchIds)
    .order("date", { ascending: false })
    .limit(1);

  return dated?.[0]?.id ?? null;
}

export async function projectWcModelXiFromLastStarters(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  limit?: number;
}): Promise<string[]> {
  const latestMatchId = await findLatestStarterMatchId(input.supabase, input.teamApiId);
  if (!latestMatchId) return [];

  const { data: starters } = await input.supabase
    .from("world_cup_player_match_stats")
    .select("player_name, position, match_rank")
    .eq("match_id", latestMatchId)
    .eq("team_api_id", input.teamApiId)
    .eq("is_starter", true)
    .order("match_rank", { ascending: true, nullsFirst: false });

  return (starters ?? [])
    .slice(0, input.limit ?? 11)
    .map((s) => String(s.player_name));
}

export async function projectWcModelXiFromLastStartersWithDetails(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  limit?: number;
}): Promise<Array<{ name: string; position: string | null; squadOrder: number }>> {
  const latestMatchId = await findLatestStarterMatchId(input.supabase, input.teamApiId);
  if (!latestMatchId) return [];

  const { data: starters } = await input.supabase
    .from("world_cup_player_match_stats")
    .select("player_name, position, match_rank")
    .eq("match_id", latestMatchId)
    .eq("team_api_id", input.teamApiId)
    .eq("is_starter", true)
    .order("match_rank", { ascending: true, nullsFirst: false });

  return (starters ?? []).slice(0, input.limit ?? 11).map((s, idx) => ({
    name: String(s.player_name),
    position: s.position != null ? String(s.position) : null,
    squadOrder: idx,
  }));
}

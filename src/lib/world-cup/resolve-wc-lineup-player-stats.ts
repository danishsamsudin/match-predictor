import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
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

function roleFromPosition(position: string | null | undefined): "G" | "D" | "M" | "F" {
  const p = (position ?? "").toUpperCase();
  if (p.startsWith("G")) return "G";
  if (p.startsWith("D")) return "D";
  if (p.startsWith("F")) return "F";
  return "M";
}

function matchPlayerName(
  query: string,
  candidates: WcResolvedLineupPlayer[]
): WcResolvedLineupPlayer | null {
  const key = normalizeName(query);
  if (!key) return null;

  const exact = candidates.find((c) => normalizeName(c.playerName) === key);
  if (exact) return exact;

  const parts = key.split(" ").filter(Boolean);
  const last = parts[parts.length - 1];
  return (
    candidates.find((c) => {
      const n = normalizeName(c.playerName);
      return n.includes(key) || key.includes(n) || (last != null && last.length > 0 && n.endsWith(last));
    }) ?? null
  );
}

async function loadTournamentFormForTeam(
  supabase: SupabaseClient,
  teamApiId: number
): Promise<WcResolvedLineupPlayer[]> {
  const { data } = await supabase
    .from("world_cup_player_tournament_form")
    .select("*")
    .eq("team_api_id", teamApiId);

  return (data ?? []).map((row) => ({
    optaPlayerId: String(row.opta_player_id),
    playerName: String(row.player_name),
    role: roleFromPosition(null),
    isStarter: Boolean(row.was_last_starter),
    availabilityFactor: Number(row.availability_factor ?? 1),
    avgOptaPoints: row.avg_opta_points != null ? Number(row.avg_opta_points) : null,
    chanceIndexPer90: row.chance_index_per90 != null ? Number(row.chance_index_per90) : null,
    defensiveActionsPer90:
      row.defensive_actions_per90 != null ? Number(row.defensive_actions_per90) : null,
    gkSaveIndex: row.gk_save_index != null ? Number(row.gk_save_index) : null,
    minutesTotal: Number(row.minutes_total ?? 0),
  }));
}

export async function resolveWcLineupPlayerStats(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  playerNames: string[];
}): Promise<WcLineupPlayerStatsMap> {
  const candidates = await loadTournamentFormForTeam(input.supabase, input.teamApiId);
  const map: WcLineupPlayerStatsMap = {};

  for (const name of input.playerNames) {
    const matched = matchPlayerName(name, candidates);
    if (matched) {
      map[name] = matched;
    }
  }

  return map;
}

export async function projectWcModelXiFromLastStarters(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  limit?: number;
}): Promise<string[]> {
  const { data: matchRows } = await input.supabase
    .from("world_cup_player_match_stats")
    .select("match_id, ingested_at")
    .eq("team_api_id", input.teamApiId)
    .eq("is_starter", true)
    .order("ingested_at", { ascending: false })
    .limit(50);

  const seen = new Set<string>();
  let latestMatchId: string | null = null;
  for (const row of matchRows ?? []) {
    const id = String(row.match_id);
    if (!seen.has(id)) {
      seen.add(id);
      latestMatchId = id;
      break;
    }
  }

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

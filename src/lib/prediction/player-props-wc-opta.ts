import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { SupabaseClient } from "@supabase/supabase-js";

function playerNamesMatch(playerName: string, otherName: string): boolean {
  const playerKeys = new Set(playerNameLookupKeys(playerName).map(normalizeText));
  const otherKeys = playerNameLookupKeys(otherName).map(normalizeText);
  return otherKeys.some((key) => playerKeys.has(key));
}

/** Per-player WC tournament overlay for goal/assist prop rates. */
export type WcPlayerPropOverlay = {
  optaPlayerId: string;
  playerName: string;
  teamApiId: number;
  goalRate90: number;
  assistRate90: number;
  chanceIndexPer90: number;
  shotsOnTargetPer90: number;
  /** Tournament sum of shots on target from ingested Opta match stats. */
  shotsOnTargetTotal: number;
  /** Cumulative tournament goals from ingested Opta match stats. */
  goalsTotal: number;
  /** Cumulative tournament assists from ingested Opta match stats. */
  assistsTotal: number;
  /** Cumulative tournament xG from ingested Opta match stats. */
  xgTotal: number;
  goalsPer90: number;
  xgPer90: number;
  minutesTotal: number;
  matchesPlayed: number;
  wasLastStarter: boolean;
  availabilityFactor: number;
  /** 0–1 blend weight toward WC rates vs club-season stats. */
  wcWeight: number;
};

function normalizeName(name: string): string {
  return normalizeNationalTeamName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveStat(
  stats: Record<string, unknown>,
  keys: string[]
): number {
  for (const key of keys) {
    const v = num(stats[key]);
    if (v > 0) return v;
  }
  return 0;
}

function computeWcWeight(minutesTotal: number, matchesPlayed: number): number {
  if (minutesTotal <= 0 || matchesPlayed <= 0) return 0;
  const minutesFactor = clamp(minutesTotal / 180, 0, 1);
  const matchFactor = clamp(matchesPlayed / 2, 0, 1);
  return clamp(0.35 + minutesFactor * 0.4 + matchFactor * 0.25, 0, 0.95);
}

/**
 * Tournament goal rate from Opta xG, goals, and chance index (per 90).
 * Chance index is scaled to an xG-equivalent threat rate for midfield creators.
 */
export function wcGoalRate90FromTournament(input: {
  goalsTotal: number;
  xgTotal: number;
  minutesTotal: number;
  chanceIndexPer90: number | null;
  shotsOnTargetPer90: number | null;
}): number {
  const minutes = Math.max(input.minutesTotal, 1);
  const per90 = 90 / minutes;
  const goalsPer90 = input.goalsTotal * per90;
  const xgPer90 = input.xgTotal * per90;
  const chanceThreat = (input.chanceIndexPer90 ?? 0) * 0.36;
  const sotThreat = (input.shotsOnTargetPer90 ?? 0) * 0.11;

  return clamp(
    Math.max(xgPer90, goalsPer90 * 0.92, chanceThreat, sotThreat),
    0.02,
    1.2
  );
}

export function wcAssistRate90FromTournament(input: {
  assistsTotal: number;
  minutesTotal: number;
  chanceIndexPer90: number | null;
}): number {
  const minutes = Math.max(input.minutesTotal, 1);
  const per90 = 90 / minutes;
  const astPer90 = input.assistsTotal * per90;
  const chanceAssist = (input.chanceIndexPer90 ?? 0) * 0.22;
  return clamp(Math.max(astPer90, chanceAssist * 0.45), 0.02, 0.85);
}

type TournamentFormRow = {
  team_api_id: number;
  opta_player_id: string;
  player_name: string;
  matches_played: number;
  minutes_total: number;
  chance_index_per90: number | null;
  was_last_starter: boolean;
  availability_factor: number | null;
};

type MatchStatRow = {
  opta_player_id: string;
  player_name: string;
  team_api_id: number;
  minutes: number | null;
  stats: Record<string, unknown>;
};

export function aggregateWcPlayerMatchStats(rows: MatchStatRow[]): Map<
  string,
  {
    goals: number;
    assists: number;
    xg: number;
    sot: number;
    minutes: number;
    playerName: string;
    teamApiId: number;
    optaPlayerId: string;
  }
> {
  const byPlayer = new Map<
    string,
    {
      goals: number;
      assists: number;
      xg: number;
      sot: number;
      minutes: number;
      playerName: string;
      teamApiId: number;
      optaPlayerId: string;
    }
  >();

  for (const row of rows) {
    const key = `${row.team_api_id}|${row.opta_player_id}`;
    const stats = row.stats ?? {};
    const cur = byPlayer.get(key) ?? {
      goals: 0,
      assists: 0,
      xg: 0,
      sot: 0,
      minutes: 0,
      playerName: String(row.player_name),
      teamApiId: Number(row.team_api_id),
      optaPlayerId: String(row.opta_player_id),
    };
    cur.goals += resolveStat(stats, ["goals", "G"]);
    cur.assists += resolveStat(stats, ["assists", "A"]);
    cur.xg += resolveStat(stats, ["expectedGoals", "xg", "expected_goals"]);
    cur.sot += resolveStat(stats, ["shots_on_target", "SOnT", "SOT"]);
    cur.minutes += Math.max(0, num(row.minutes));
    if (row.player_name) cur.playerName = String(row.player_name);
    byPlayer.set(key, cur);
  }

  return byPlayer;
}

export async function loadWcPlayerPropOverlays(
  supabase: SupabaseClient,
  teamApiIds: number[]
): Promise<Map<string, WcPlayerPropOverlay>> {
  const uniqueTeams = [...new Set(teamApiIds.filter((id) => id > 0))];
  if (!uniqueTeams.length) return new Map();

  const [formRes, statsRes] = await Promise.all([
    supabase
      .from("world_cup_player_tournament_form")
      .select(
        "team_api_id, opta_player_id, player_name, matches_played, minutes_total, chance_index_per90, was_last_starter, availability_factor"
      )
      .in("team_api_id", uniqueTeams),
    supabase
      .from("world_cup_player_match_stats")
      .select("opta_player_id, player_name, team_api_id, minutes, stats")
      .in("team_api_id", uniqueTeams),
  ]);

  const agg = aggregateWcPlayerMatchStats((statsRes.data ?? []) as MatchStatRow[]);
  const overlays = new Map<string, WcPlayerPropOverlay>();
  const coveredKeys = new Set<string>();

  for (const row of (formRes.data ?? []) as TournamentFormRow[]) {
    const key = `${row.team_api_id}|${row.opta_player_id}`;
    const matchAgg = agg.get(key) ?? {
      goals: 0,
      assists: 0,
      xg: 0,
      sot: 0,
      minutes: 0,
    };
    const minutesTotal = Math.max(
      num(row.minutes_total),
      matchAgg.minutes,
      1
    );
    const chanceIndexPer90 =
      row.chance_index_per90 != null ? num(row.chance_index_per90) : null;
    const shotsOnTargetPer90 =
      minutesTotal > 0 ? (matchAgg.sot * 90) / minutesTotal : 0;
    const goalRate90 = wcGoalRate90FromTournament({
      goalsTotal: matchAgg.goals,
      xgTotal: matchAgg.xg,
      minutesTotal,
      chanceIndexPer90,
      shotsOnTargetPer90,
    });
    const assistRate90 = wcAssistRate90FromTournament({
      assistsTotal: matchAgg.assists,
      minutesTotal,
      chanceIndexPer90,
    });

    const overlay: WcPlayerPropOverlay = {
      optaPlayerId: String(row.opta_player_id),
      playerName: String(row.player_name),
      teamApiId: Number(row.team_api_id),
      goalRate90,
      assistRate90,
      chanceIndexPer90: chanceIndexPer90 ?? 0,
      shotsOnTargetPer90,
      shotsOnTargetTotal: matchAgg.sot,
      goalsTotal: matchAgg.goals,
      assistsTotal: matchAgg.assists,
      xgTotal: matchAgg.xg,
      goalsPer90: (matchAgg.goals * 90) / minutesTotal,
      xgPer90: (matchAgg.xg * 90) / minutesTotal,
      minutesTotal,
      matchesPlayed: Math.max(0, Math.round(num(row.matches_played))),
      wasLastStarter: Boolean(row.was_last_starter),
      availabilityFactor: num(row.availability_factor) || 1,
      wcWeight: computeWcWeight(minutesTotal, num(row.matches_played)),
    };

    overlays.set(normalizeName(overlay.playerName), overlay);
    coveredKeys.add(key);
  }

  for (const [key, matchAgg] of agg) {
    if (coveredKeys.has(key)) continue;
    const hasTournamentActivity =
      matchAgg.goals > 0 ||
      matchAgg.assists > 0 ||
      matchAgg.xg > 0 ||
      matchAgg.sot > 0 ||
      matchAgg.minutes > 0;
    if (!hasTournamentActivity) continue;
    const minutesTotal = Math.max(matchAgg.minutes, 1);
    const shotsOnTargetPer90 = (matchAgg.sot * 90) / minutesTotal;
    const overlay: WcPlayerPropOverlay = {
      optaPlayerId: matchAgg.optaPlayerId,
      playerName: matchAgg.playerName,
      teamApiId: matchAgg.teamApiId,
      goalRate90: wcGoalRate90FromTournament({
        goalsTotal: matchAgg.goals,
        xgTotal: matchAgg.xg,
        minutesTotal,
        chanceIndexPer90: null,
        shotsOnTargetPer90,
      }),
      assistRate90: wcAssistRate90FromTournament({
        assistsTotal: matchAgg.assists,
        minutesTotal,
        chanceIndexPer90: null,
      }),
      chanceIndexPer90: 0,
      shotsOnTargetPer90,
      shotsOnTargetTotal: matchAgg.sot,
      goalsTotal: matchAgg.goals,
      assistsTotal: matchAgg.assists,
      xgTotal: matchAgg.xg,
      goalsPer90: (matchAgg.goals * 90) / minutesTotal,
      xgPer90: (matchAgg.xg * 90) / minutesTotal,
      minutesTotal,
      matchesPlayed: 0,
      wasLastStarter: false,
      availabilityFactor: 1,
      wcWeight: computeWcWeight(minutesTotal, 1),
    };
    overlays.set(normalizeName(overlay.playerName), overlay);
  }

  return overlays;
}

export function resolveWcOverlayForPlayer(
  playerName: string,
  teamApiId: number,
  overlays: Map<string, WcPlayerPropOverlay> | undefined
): WcPlayerPropOverlay | null {
  if (!overlays?.size) return null;

  const direct = overlays.get(normalizeName(playerName));
  if (direct && direct.teamApiId === teamApiId) return direct;

  for (const overlay of overlays.values()) {
    if (overlay.teamApiId !== teamApiId) continue;
    if (playerNamesMatch(playerName, overlay.playerName)) return overlay;
  }

  return null;
}

/** Expected minutes when WC tournament form is available. */
export function wcExpectedMinutes(overlay: WcPlayerPropOverlay | null): number | null {
  if (!overlay) return null;
  if (overlay.wasLastStarter) return 88 * overlay.availabilityFactor;
  if (overlay.minutesTotal >= 135) return clamp(72 * overlay.availabilityFactor, 45, 90);
  if (overlay.minutesTotal >= 45) return clamp(55 * overlay.availabilityFactor, 30, 75);
  return null;
}

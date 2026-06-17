import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { WORLD_CUP_FINALS_COMPETITION_OR } from "@/lib/world-cup/match-query";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WcMatchResolveInput {
  homeTeamId: number;
  awayTeamId: number;
  homeName?: string;
  awayName?: string;
  matchDate: string;
  city?: string;
}

export interface ResolvedWcMatch {
  match: WcMatchRow;
  matchId: string;
  /** True when URL home/away differs from official fixture orientation. */
  teamsSwappedInInput: boolean;
}

function teamIdSet(input: WcMatchResolveInput): Set<number> {
  const ids = new Set<number>();
  if (input.homeTeamId) ids.add(input.homeTeamId);
  if (input.awayTeamId) ids.add(input.awayTeamId);
  if (input.homeName) {
    const id = WORLD_CUP_2026_TEAMS.find(
      (t) => normalizeNationalTeamName(t.name) === normalizeNationalTeamName(input.homeName!)
    )?.id;
    if (id) ids.add(id);
  }
  if (input.awayName) {
    const id = WORLD_CUP_2026_TEAMS.find(
      (t) => normalizeNationalTeamName(t.name) === normalizeNationalTeamName(input.awayName!)
    )?.id;
    if (id) ids.add(id);
  }
  return ids;
}

function mapDbRow(
  row: Record<string, unknown>,
  teamNames: Map<string, string>
): WcMatchRow {
  return {
    id: String(row.id),
    date: (row.date as string | null) ?? null,
    time: (row.time as string | null) ?? null,
    competition: (row.competition as string | null) ?? null,
    round: (row.round as string | null) ?? null,
    venue: (row.venue as string | null) ?? null,
    venue_city: (row.venue_city as string | null) ?? (row.venue as string | null),
    group_code: (row.group_code as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    home_team_id: (row.home_team_id as string | null) ?? null,
    away_team_id: (row.away_team_id as string | null) ?? null,
    home_goals: (row.home_goals as number | null) ?? null,
    away_goals: (row.away_goals as number | null) ?? null,
    home_team_name: row.home_team_id
      ? teamNames.get(String(row.home_team_id))
      : undefined,
    away_team_name: row.away_team_id
      ? teamNames.get(String(row.away_team_id))
      : undefined,
  };
}

export function isWorldCup2026PredictContext(input: WcMatchResolveInput): boolean {
  const ids = teamIdSet(input);
  if (ids.size !== 2) return false;
  for (const id of ids) {
    if (!WORLD_CUP_2026_TEAMS.some((t) => t.id === id)) return false;
  }
  const date = input.matchDate?.slice(0, 10);
  return Boolean(date && date >= "2026-06-01" && date <= "2026-07-31");
}

function shiftIsoDate(isoDate: string, dayDelta: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayDelta);
  return d.toISOString().slice(0, 10);
}

/** Opta widget dates can be +1 day vs fixture DB when kickoff crosses UTC midnight. */
export function candidateWcMatchDates(matchDate: string): string[] {
  const base = matchDate.slice(0, 10);
  const candidates = [base, shiftIsoDate(base, -1), shiftIsoDate(base, 1)];
  return [...new Set(candidates)];
}

function matchRowToResolved(
  row: Record<string, unknown>,
  teamNames: Map<string, string>,
  wantHome: number,
  wantAway: number
): ResolvedWcMatch | null {
  const homeId = resolveApiTeamId(
    String(row.home_team_id ?? ""),
    teamNames.get(String(row.home_team_id)) ?? ""
  );
  const awayId = resolveApiTeamId(
    String(row.away_team_id ?? ""),
    teamNames.get(String(row.away_team_id)) ?? ""
  );

  if (homeId === wantHome && awayId === wantAway) {
    return {
      match: mapDbRow(row, teamNames),
      matchId: String(row.id),
      teamsSwappedInInput: false,
    };
  }
  if (homeId === wantAway && awayId === wantHome) {
    return {
      match: mapDbRow(row, teamNames),
      matchId: String(row.id),
      teamsSwappedInInput: true,
    };
  }
  return null;
}

async function resolveWcMatchOnDate(
  supabase: SupabaseClient,
  input: WcMatchResolveInput,
  date: string,
  teamNames: Map<string, string>
): Promise<ResolvedWcMatch | null> {
  const { data: rows, error } = await supabase
    .from("matches")
    .select("*")
    .eq("date", date)
    .or(WORLD_CUP_FINALS_COMPETITION_OR);

  if (error || !rows?.length) return null;

  const wantHome = resolveApiTeamId(String(input.homeTeamId), input.homeName ?? "");
  const wantAway = resolveApiTeamId(String(input.awayTeamId), input.awayName ?? "");

  for (const row of rows) {
    const resolved = matchRowToResolved(
      row as Record<string, unknown>,
      teamNames,
      wantHome,
      wantAway
    );
    if (resolved) return resolved;
  }

  return null;
}

async function resolveWcMatchByTeamPair(
  supabase: SupabaseClient,
  input: Pick<WcMatchResolveInput, "homeTeamId" | "awayTeamId" | "homeName" | "awayName">
): Promise<ResolvedWcMatch | null> {
  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const { data: rows, error } = await supabase
    .from("matches")
    .select("*")
    .or(WORLD_CUP_FINALS_COMPETITION_OR)
    .gte("date", "2026-06-01")
    .lte("date", "2026-07-31");

  if (error || !rows?.length) return null;

  const wantHome = resolveApiTeamId(String(input.homeTeamId), input.homeName ?? "");
  const wantAway = resolveApiTeamId(String(input.awayTeamId), input.awayName ?? "");

  const hits: ResolvedWcMatch[] = [];
  for (const row of rows) {
    const resolved = matchRowToResolved(
      row as Record<string, unknown>,
      teamNames,
      wantHome,
      wantAway
    );
    if (resolved) hits.push(resolved);
  }

  if (hits.length === 1) return hits[0];
  return null;
}

export async function resolveWcMatchFromPredictInput(
  supabase: SupabaseClient,
  input: WcMatchResolveInput
): Promise<ResolvedWcMatch | null> {
  if (!isWorldCup2026PredictContext(input)) return null;

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  for (const date of candidateWcMatchDates(input.matchDate)) {
    const resolved = await resolveWcMatchOnDate(supabase, input, date, teamNames);
    if (resolved) return resolved;
  }

  return null;
}

export async function resolveWcMatchFromParsedTeams(
  supabase: SupabaseClient,
  input: {
    homeTeamApiId: number;
    awayTeamApiId: number;
    matchDate: string | null;
  }
): Promise<ResolvedWcMatch | null> {
  const baseInput = {
    homeTeamId: input.homeTeamApiId,
    awayTeamId: input.awayTeamApiId,
  };

  if (input.matchDate) {
    const resolved = await resolveWcMatchFromPredictInput(supabase, {
      ...baseInput,
      matchDate: input.matchDate,
    });
    if (resolved) return resolved;
  }

  return resolveWcMatchByTeamPair(supabase, baseInput);
}

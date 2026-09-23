import {
  isNationsLeague2026TeamId,
  isNationsLeague2026TeamName,
  NATIONS_LEAGUE_2026_TEAMS,
} from "@/lib/data/nations-league-2026-teams";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import {
  NL_2026_LEAGUE_PHASE_END,
  NL_2026_LEAGUE_PHASE_START,
  NL_COMPETITION_LABEL,
} from "@/lib/nations-league/group-draw";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NlMatchResolveInput {
  homeTeamId: number;
  awayTeamId: number;
  homeName?: string;
  awayName?: string;
  matchDate: string;
  city?: string;
}

export interface ResolvedNlMatch {
  match: WcMatchRow;
  matchId: string;
  teamsSwappedInInput: boolean;
}

function teamIdSet(input: NlMatchResolveInput): Set<number> {
  const ids = new Set<number>();
  if (input.homeTeamId) ids.add(input.homeTeamId);
  if (input.awayTeamId) ids.add(input.awayTeamId);
  if (input.homeName && isNationsLeague2026TeamName(input.homeName)) {
    const t = NATIONS_LEAGUE_2026_TEAMS.find(
      (x) =>
        normalizeNationalTeamName(x.name) === normalizeNationalTeamName(input.homeName!)
    );
    if (t) ids.add(t.id);
  }
  if (input.awayName && isNationsLeague2026TeamName(input.awayName)) {
    const t = NATIONS_LEAGUE_2026_TEAMS.find(
      (x) =>
        normalizeNationalTeamName(x.name) === normalizeNationalTeamName(input.awayName!)
    );
    if (t) ids.add(t.id);
  }
  return ids;
}

export function isNationsLeague2026PredictContext(input: NlMatchResolveInput): boolean {
  const ids = teamIdSet(input);
  if (ids.size !== 2) return false;
  for (const id of ids) {
    if (!isNationsLeague2026TeamId(id)) return false;
  }
  const date = input.matchDate?.slice(0, 10);
  // Live 2026/27 window + allow historical 2024/25 for eval/backtest deep links
  if (!date) return false;
  if (date >= NL_2026_LEAGUE_PHASE_START && date <= "2028-03-31") return true;
  if (date >= "2024-09-01" && date <= "2025-06-30") return true;
  return false;
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

function shiftIsoDate(isoDate: string, dayDelta: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayDelta);
  return d.toISOString().slice(0, 10);
}

async function findNlMatchInDb(
  supabase: SupabaseClient,
  input: NlMatchResolveInput,
  options?: { allowSynthetic?: boolean }
): Promise<ResolvedNlMatch | null> {
  const ids = [...teamIdSet(input)];
  if (ids.length < 2) return null;

  const date = input.matchDate.slice(0, 10);
  const dates = [date, shiftIsoDate(date, -1), shiftIsoDate(date, 1)];

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const idStrs = ids.map(String);
  const { data: rows } = await supabase
    .from("matches")
    .select("*")
    .in("date", dates)
    .ilike("competition", "%Nations League%")
    .or(
      `and(home_team_id.in.(${idStrs.join(",")}),away_team_id.in.(${idStrs.join(",")}))`
    );

  const candidates = (rows ?? []).filter((row) => {
    const h = String(row.home_team_id ?? "");
    const a = String(row.away_team_id ?? "");
    return idStrs.includes(h) && idStrs.includes(a);
  });

  if (candidates.length) {
    const row = candidates[0]!;
    const match = mapDbRow(row as Record<string, unknown>, teamNames);
    const homeApi = Number(row.home_team_id);
    const teamsSwappedInInput =
      input.homeTeamId === Number(row.away_team_id) &&
      input.awayTeamId === homeApi;
    return { match, matchId: match.id, teamsSwappedInInput };
  }

  if (options?.allowSynthetic === false) return null;

  // Synthetic scheduled row when fixture not yet in DB (predict deep-links only)
  const homeId = String(input.homeTeamId);
  const awayId = String(input.awayTeamId);
  const syntheticId = `nl-synth-${date}-${homeId}-${awayId}`;
  const match: WcMatchRow = {
    id: syntheticId,
    date,
    time: null,
    competition: NL_COMPETITION_LABEL,
    round: null,
    venue: input.city ?? null,
    venue_city: input.city ?? null,
    group_code: null,
    status: "scheduled",
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: null,
    away_goals: null,
    home_team_name:
      input.homeName ??
      NATIONS_LEAGUE_2026_TEAMS.find((t) => t.id === input.homeTeamId)?.name,
    away_team_name:
      input.awayName ??
      NATIONS_LEAGUE_2026_TEAMS.find((t) => t.id === input.awayTeamId)?.name,
  };
  return { match, matchId: syntheticId, teamsSwappedInInput: false };
}

export async function resolveNlMatchFromPredictInput(
  supabase: SupabaseClient,
  input: NlMatchResolveInput
): Promise<ResolvedNlMatch | null> {
  if (!isNationsLeague2026PredictContext(input)) return null;
  return findNlMatchInDb(supabase, input, { allowSynthetic: true });
}

/**
 * Resolve a real Nations League `matches` row for Opta ingest (no synthetic IDs).
 * Falls back to a season-wide team-pair search when the Opta date is off by a day or missing.
 */
export async function resolveNlMatchFromParsedTeams(
  supabase: SupabaseClient,
  input: {
    homeTeamApiId: number;
    awayTeamApiId: number;
    matchDate: string | null;
  }
): Promise<ResolvedNlMatch | null> {
  if (input.matchDate) {
    const onDate = await findNlMatchInDb(
      supabase,
      {
        homeTeamId: input.homeTeamApiId,
        awayTeamId: input.awayTeamApiId,
        matchDate: input.matchDate,
      },
      { allowSynthetic: false }
    );
    if (onDate) return onDate;
  }

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));
  const idStrs = [String(input.homeTeamApiId), String(input.awayTeamApiId)];

  const { data: rows } = await supabase
    .from("matches")
    .select("*")
    .ilike("competition", "%Nations League%")
    .gte("date", "2024-09-01")
    .lte("date", "2027-06-30")
    .or(
      `and(home_team_id.in.(${idStrs.join(",")}),away_team_id.in.(${idStrs.join(",")}))`
    );

  const hits = (rows ?? []).filter((row) => {
    const h = String(row.home_team_id ?? "");
    const a = String(row.away_team_id ?? "");
    return idStrs.includes(h) && idStrs.includes(a);
  });

  if (hits.length !== 1) return null;

  const row = hits[0]!;
  const match = mapDbRow(row as Record<string, unknown>, teamNames);
  const homeApi = Number(row.home_team_id);
  const teamsSwappedInInput =
    input.homeTeamApiId === Number(row.away_team_id) &&
    input.awayTeamApiId === homeApi;
  return { match, matchId: match.id, teamsSwappedInInput };
}

export { NL_2026_LEAGUE_PHASE_START, NL_2026_LEAGUE_PHASE_END };

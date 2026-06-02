import { getTeamName } from "@/lib/data/football-reference";
import { WORLD_CUP_2026_TEAMS } from "@/lib/data/world-cup-2026-teams";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PredictionTeamNameRow = {
  id?: string;
  home_team_id: number;
  away_team_id: number;
  match_id?: number;
  inputs_snapshot?: unknown;
  home_league_id?: number | null;
  away_league_id?: number | null;
};

export type ResolvedTeamNames = {
  homeTeamName: string;
  awayTeamName: string;
};

export function teamNamesFromSnapshot(snapshot: unknown): {
  homeTeamName?: string;
  awayTeamName?: string;
} {
  if (!snapshot || typeof snapshot !== "object") return {};
  const s = snapshot as Record<string, unknown>;
  return {
    homeTeamName:
      typeof s.homeTeamName === "string" && s.homeTeamName.trim()
        ? s.homeTeamName.trim()
        : undefined,
    awayTeamName:
      typeof s.awayTeamName === "string" && s.awayTeamName.trim()
        ? s.awayTeamName.trim()
        : undefined,
  };
}

function referenceTeamName(teamId: number, leagueId?: number | null): string | undefined {
  const byLeague =
    leagueId != null && Number.isFinite(leagueId)
      ? getTeamName(teamId, leagueId)
      : getTeamName(teamId);
  if (byLeague) return byLeague;
  return WORLD_CUP_2026_TEAMS.find((t) => t.id === teamId)?.name;
}

export async function resolvePredictionTeamNames(
  supabase: SupabaseClient<Database>,
  row: PredictionTeamNameRow
): Promise<ResolvedTeamNames> {
  const batch = await resolvePredictionTeamNamesBatch(supabase, [row]);
  const key = rowKey(row);
  return (
    batch.get(key) ?? {
      homeTeamName: referenceTeamName(row.home_team_id, row.home_league_id) ?? `Team ${row.home_team_id}`,
      awayTeamName: referenceTeamName(row.away_team_id, row.away_league_id) ?? `Team ${row.away_team_id}`,
    }
  );
}

function rowKey(row: PredictionTeamNameRow): string {
  return row.id ?? `${row.home_team_id}-${row.away_team_id}-${row.match_id ?? 0}`;
}

export async function resolvePredictionTeamNamesBatch(
  supabase: SupabaseClient<Database>,
  rows: PredictionTeamNameRow[]
): Promise<Map<string, ResolvedTeamNames>> {
  const out = new Map<string, ResolvedTeamNames>();

  const needsFixture: PredictionTeamNameRow[] = [];
  const needsTeamLookup = new Set<number>();
  const matchIds = new Set<number>();

  for (const row of rows) {
    const key = rowKey(row);
    const fromSnapshot = teamNamesFromSnapshot(row.inputs_snapshot);
    const home =
      fromSnapshot.homeTeamName ??
      referenceTeamName(row.home_team_id, row.home_league_id);
    const away =
      fromSnapshot.awayTeamName ??
      referenceTeamName(row.away_team_id, row.away_league_id);

    if (home && away) {
      out.set(key, { homeTeamName: home, awayTeamName: away });
      continue;
    }

    const partial: ResolvedTeamNames = {
      homeTeamName: home ?? "",
      awayTeamName: away ?? "",
    };
    out.set(key, partial);

    if (!home || !away) {
      needsFixture.push(row);
      if (row.match_id && row.match_id > 0) matchIds.add(row.match_id);
      if (!home) needsTeamLookup.add(row.home_team_id);
      if (!away) needsTeamLookup.add(row.away_team_id);
    }
  }

  const fixtureByEventId = new Map<
    number,
    { home_team_id: number; away_team_id: number; home_team_name: string; away_team_name: string }
  >();
  if (matchIds.size > 0) {
    const { data } = await supabase
      .from("synced_fixtures")
      .select("event_id, home_team_id, away_team_id, home_team_name, away_team_name")
      .in("event_id", [...matchIds]);
    for (const f of data ?? []) {
      fixtureByEventId.set(f.event_id, f);
    }
  }

  const teamNameById = new Map<number, string>();
  if (needsTeamLookup.size > 0) {
    const { data } = await supabase
      .from("synced_teams")
      .select("team_id, team_name")
      .in("team_id", [...needsTeamLookup]);
    for (const t of data ?? []) {
      if (!teamNameById.has(t.team_id)) {
        teamNameById.set(t.team_id, t.team_name);
      }
    }
  }

  for (const row of needsFixture) {
    const key = rowKey(row);
    const current = out.get(key)!;
    const fixture =
      row.match_id && row.match_id > 0 ? fixtureByEventId.get(row.match_id) : undefined;

    let homeTeamName = current.homeTeamName;
    let awayTeamName = current.awayTeamName;

    if (!homeTeamName && fixture?.home_team_id === row.home_team_id) {
      homeTeamName = fixture.home_team_name;
    }
    if (!awayTeamName && fixture?.away_team_id === row.away_team_id) {
      awayTeamName = fixture.away_team_name;
    }

    if (!homeTeamName) {
      homeTeamName =
        teamNameById.get(row.home_team_id) ??
        referenceTeamName(row.home_team_id, row.home_league_id) ??
        `Team ${row.home_team_id}`;
    }
    if (!awayTeamName) {
      awayTeamName =
        teamNameById.get(row.away_team_id) ??
        referenceTeamName(row.away_team_id, row.away_league_id) ??
        `Team ${row.away_team_id}`;
    }

    out.set(key, { homeTeamName, awayTeamName });
  }

  return out;
}

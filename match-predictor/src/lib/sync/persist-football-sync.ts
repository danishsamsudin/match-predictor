import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { SportApiEvent, SportApiStandingsResponse } from "@/lib/types/sportapi";
import type { EntityType } from "@/lib/types/football-lookup";
import { buildStoredTeamStatisticsRow } from "@/lib/sync/team-prediction-metrics";
import {
  mapStandingsRowToTeamStatistics,
} from "@/lib/api/sportapi/mappers";

type ServiceClient = SupabaseClient<Database>;

export async function persistStandingsTeams(
  supabase: ServiceClient,
  input: {
    standings: SportApiStandingsResponse;
    referenceLeagueId: number;
    uniqueTournamentId: number;
    seasonId: number;
    seasonYear: number;
    entityType: EntityType;
    syncedAt: string;
  }
): Promise<number> {
  let count = 0;

  for (const group of input.standings.standings ?? []) {
    for (const row of group.rows ?? []) {
      if (!row.team?.id || !row.team?.name) continue;

      const { error: teamError } = await supabase.from("synced_teams").upsert(
        {
          league_id: input.referenceLeagueId,
          team_id: row.team.id,
          team_name: row.team.name,
          short_name: row.team.shortName ?? null,
          slug: row.team.slug ?? null,
          entity_type: input.entityType,
          unique_tournament_id: input.uniqueTournamentId,
          season_id: input.seasonId,
          synced_at: input.syncedAt,
        },
        { onConflict: "league_id,team_id" }
      );

      if (teamError) {
        console.warn("synced_teams upsert failed:", teamError.message, row.team.id);
        continue;
      }

      const homeStats = mapStandingsRowToTeamStatistics(
        row,
        input.referenceLeagueId,
        input.seasonYear,
        true
      );
      const awayStats = mapStandingsRowToTeamStatistics(
        row,
        input.referenceLeagueId,
        input.seasonYear,
        false
      );
      const stored = buildStoredTeamStatisticsRow(homeStats, awayStats);

      const { error: statsError } = await supabase.from("synced_team_statistics").upsert(
        {
          team_id: row.team.id,
          unique_tournament_id: input.uniqueTournamentId,
          season_id: input.seasonId,
          reference_league_id: input.referenceLeagueId,
          payload: stored.payload,
          metrics_home: stored.metrics_home,
          metrics_away: stored.metrics_away,
          synced_at: input.syncedAt,
        },
        { onConflict: "team_id,unique_tournament_id,season_id" }
      );

      if (statsError) {
        console.warn("synced_team_statistics upsert failed:", statsError.message, row.team.id);
        continue;
      }

      count += 1;
    }
  }

  return count;
}

export function isValidEventForSync(event: SportApiEvent): boolean {
  return (
    Number.isFinite(event.id) &&
    Number.isFinite(event.homeTeam.id) &&
    Boolean(event.homeTeam.name) &&
    Number.isFinite(event.awayTeam.id) &&
    Boolean(event.awayTeam.name)
  );
}

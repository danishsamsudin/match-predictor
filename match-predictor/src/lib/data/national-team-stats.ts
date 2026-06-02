import { resolveSportApiLeague } from "@/lib/config/sportapi-leagues";
import { readSyncedSeasons, readSyncedStandings } from "@/lib/data/synced-resource-cache";
import { findStandingsRow } from "@/lib/sync/build-football-bundle";
import { mapStandingsRowToTeamStatistics } from "@/lib/api/sportapi/mappers";
import { teamStatisticsFromMetrics } from "@/lib/sync/team-prediction-metrics";
import type { TeamStatistics } from "@/lib/types/football";
import type { SportApiEvent } from "@/lib/types/sportapi";
import type { TeamStatAverages } from "@/lib/types/prediction";

/** Typical per-match international averages when no synced/API data exists. */
const INTERNATIONAL_BASELINE: TeamStatAverages = {
  goalsFor: 1.35,
  goalsAgainst: 1.15,
  corners: 5.2,
  fouls: 11,
  yellowCards: 1.8,
  redCards: 0.08,
  shotsOnTarget: 4.2,
};

function eventInvolvesTeam(
  event: SportApiEvent,
  teamId: number,
  teamName?: string
): boolean {
  if (event.homeTeam.id === teamId || event.awayTeam.id === teamId) return true;
  if (!teamName) return false;
  const normalized = teamName.toLowerCase();
  return (
    event.homeTeam.name.toLowerCase() === normalized ||
    event.awayTeam.name.toLowerCase() === normalized
  );
}

function goalsForTeamInEvent(event: SportApiEvent, teamId: number): number | null {
  const homeGoals = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const awayGoals = event.awayScore?.current ?? event.awayScore?.display ?? null;
  if (homeGoals == null || awayGoals == null) return null;
  if (event.homeTeam.id === teamId) return homeGoals;
  if (event.awayTeam.id === teamId) return awayGoals;
  return null;
}

function goalsAgainstTeamInEvent(event: SportApiEvent, teamId: number): number | null {
  const homeGoals = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const awayGoals = event.awayScore?.current ?? event.awayScore?.display ?? null;
  if (homeGoals == null || awayGoals == null) return null;
  if (event.homeTeam.id === teamId) return awayGoals;
  if (event.awayTeam.id === teamId) return homeGoals;
  return null;
}

/** Build averages from recent finished matches (any competition). */
export function deriveTeamStatisticsFromFormEvents(
  events: SportApiEvent[],
  teamId: number,
  teamName: string,
  leagueId: number,
  season: number,
  isHomeSide: boolean
): TeamStatistics | null {
  const finished = events.filter(
    (e) =>
      eventInvolvesTeam(e, teamId, teamName) &&
      (e.status?.type === "finished" || e.status?.type === "ended")
  );

  let goalsFor = 0;
  let goalsAgainst = 0;
  let matches = 0;

  for (const event of finished) {
    const gf = goalsForTeamInEvent(event, teamId);
    const ga = goalsAgainstTeamInEvent(event, teamId);
    if (gf == null || ga == null) continue;
    goalsFor += gf;
    goalsAgainst += ga;
    matches += 1;
  }

  const metrics: TeamStatAverages =
    matches >= 2
      ? {
          ...INTERNATIONAL_BASELINE,
          goalsFor: goalsFor / matches,
          goalsAgainst: goalsAgainst / matches,
        }
      : { ...INTERNATIONAL_BASELINE };

  return teamStatisticsFromMetrics(
    metrics,
    { id: teamId, name: teamName },
    leagueId,
    season,
    isHomeSide
  );
}

export async function loadTeamStatisticsFromStandingsCache(
  teamId: number,
  leagueId: number,
  season: number,
  isHomeSide: boolean,
  teamName?: string
): Promise<TeamStatistics | null> {
  const mapping = resolveSportApiLeague(leagueId);
  if (!mapping) return null;

  const seasons = await readSyncedSeasons(mapping.uniqueTournamentId);
  const seasonId = seasons?.seasons?.[0]?.id;
  if (!seasonId) return null;

  const standings = await readSyncedStandings(mapping.uniqueTournamentId, seasonId);
  if (!standings) return null;

  const row = findStandingsRow(standings, teamId, teamName);
  if (!row) return null;

  return mapStandingsRowToTeamStatistics(row, leagueId, season, isHomeSide);
}

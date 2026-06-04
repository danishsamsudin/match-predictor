import { resolveSportApiLeague } from "@/lib/config/sportapi-leagues";
import { readSyncedSeasons, readSyncedStandings } from "@/lib/data/synced-resource-cache";
import { findStandingsRow } from "@/lib/sync/build-football-bundle";
import { mapStandingsRowToTeamStatistics } from "@/lib/api/sportapi/mappers";
import { teamStatisticsFromMetrics } from "@/lib/sync/team-prediction-metrics";
import {
  computeInternationalRatesFromMatches,
  internationalDecayWeight,
  internationalMatchTierWeight,
  INTERNATIONAL_BASE_GOALS,
} from "@/lib/world-cup/international-strength";
import type { TeamStatistics } from "@/lib/types/football";
import type { SportApiEvent } from "@/lib/types/sportapi";
import type { TeamStatAverages } from "@/lib/types/prediction";

/** Typical per-match international averages when no synced/API data exists. */
const INTERNATIONAL_BASELINE: TeamStatAverages = {
  goalsFor: INTERNATIONAL_BASE_GOALS,
  goalsAgainst: INTERNATIONAL_BASE_GOALS,
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

function competitionLabel(event: SportApiEvent): string {
  return (
    event.tournament?.uniqueTournament?.name ??
    event.tournament?.name ??
    ""
  );
}

function eventDateIso(event: SportApiEvent): string | null {
  if (event.startTime) return event.startTime.slice(0, 10);
  if (event.startTimestamp) {
    return new Date(event.startTimestamp * 1000).toISOString().slice(0, 10);
  }
  return null;
}

/** Build averages from weighted recent internationals (tier + long decay). */
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

  const history = finished
    .map((event) => {
      const gf = goalsForTeamInEvent(event, teamId);
      const ga = goalsAgainstTeamInEvent(event, teamId);
      if (gf == null || ga == null) return null;
      return {
        date: eventDateIso(event),
        home_team_id: String(event.homeTeam.id),
        away_team_id: String(event.awayTeam.id),
        home_goals: event.homeTeam.id === teamId ? gf : ga,
        away_goals: event.homeTeam.id === teamId ? ga : gf,
        competition: competitionLabel(event),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const rates = computeInternationalRatesFromMatches(String(teamId), history, Date.now(), teamName);
  const sample = rates.sample;

  const metrics: TeamStatAverages =
    sample.effectiveWeight >= 0.35
      ? {
          ...INTERNATIONAL_BASELINE,
          goalsFor: sample.goalsFor,
          goalsAgainst: sample.goalsAgainst,
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

/** Export for diagnostics — tier × decay weight for one event. */
export function nationalFormEventWeight(event: SportApiEvent, referenceMs = Date.now()): number {
  return (
    internationalMatchTierWeight(competitionLabel(event)) *
    internationalDecayWeight(eventDateIso(event), referenceMs)
  );
}

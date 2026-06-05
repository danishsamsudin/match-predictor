import { resolveSportApiLeague } from "@/lib/config/sportapi-leagues";
import type { AggregatedTeamEventMetrics } from "@/lib/data/aggregate-team-event-metrics";
import { readSyncedSeasons, readSyncedStandings } from "@/lib/data/synced-resource-cache";
import { findStandingsRow } from "@/lib/sync/build-football-bundle";
import { mapStandingsRowToTeamStatistics } from "@/lib/api/sportapi/mappers";
import { teamStatisticsFromMetrics } from "@/lib/sync/team-prediction-metrics";
import {
  computeInternationalRatesFromMatches,
  internationalDecayWeight,
  internationalMatchTierWeight,
  INTERNATIONAL_BASE_GOALS,
  type InternationalTeamRates,
} from "@/lib/world-cup/international-strength";
import {
  confederationStrengthModifier,
  resolveNationalConfederation,
} from "@/lib/world-cup/confederation-strength";
import type { TeamStatistics } from "@/lib/types/football";
import type { SportApiEvent } from "@/lib/types/sportapi";
import type { TeamStatAverages } from "@/lib/types/prediction";

/** Typical per-match international averages when no synced/API data exists. */
export const INTERNATIONAL_BASELINE: TeamStatAverages = {
  goalsFor: INTERNATIONAL_BASE_GOALS,
  goalsAgainst: INTERNATIONAL_BASE_GOALS,
  corners: 5.2,
  fouls: 11,
  yellowCards: 1.8,
  redCards: 0.08,
  shotsOnTarget: 4.2,
};

function blendMetric(
  observed: number | null | undefined,
  fallback: number,
  weight: number
): number {
  if (observed == null || !Number.isFinite(observed) || observed <= 0) return fallback;
  const w = Math.max(0, Math.min(1, weight));
  return observed * w + fallback * (1 - w);
}

/**
 * When synced match stats are sparse, infer stylistic event rates from attack/defense
 * form and confederation so national sides do not all share identical baselines.
 */
export function estimateNationalEventMetricsFromStyle(
  rates: InternationalTeamRates,
  teamId: number,
  teamName?: string
): Omit<TeamStatAverages, "goalsFor" | "goalsAgainst"> {
  const attack = rates.attack;
  const defense = rates.defense;
  const confedMod = confederationStrengthModifier(
    resolveNationalConfederation(teamId, teamName)
  );
  const sampleConfidence = Math.min(1, rates.sample.effectiveWeight / 6);

  const corners =
    INTERNATIONAL_BASELINE.corners *
    (0.82 + 0.2 * attack + 0.06 * (attack / Math.max(0.55, defense)));
  const shotsOnTarget =
    INTERNATIONAL_BASELINE.shotsOnTarget * (0.78 + 0.3 * attack + 0.04 * sampleConfidence);
  const fouls =
    INTERNATIONAL_BASELINE.fouls *
    (0.86 + 0.16 * defense + 0.05 / Math.max(0.55, confedMod));
  const yellowCards =
    INTERNATIONAL_BASELINE.yellowCards *
    (0.84 + 0.18 * defense + 0.04 * (fouls / INTERNATIONAL_BASELINE.fouls - 1));
  const redCards =
    INTERNATIONAL_BASELINE.redCards *
    (0.65 + 0.4 * (yellowCards / INTERNATIONAL_BASELINE.yellowCards - 1));

  return {
    corners: Math.round(corners * 100) / 100,
    fouls: Math.round(fouls * 100) / 100,
    yellowCards: Math.round(yellowCards * 100) / 100,
    redCards: Math.round(Math.max(0.02, redCards) * 100) / 100,
    shotsOnTarget: Math.round(shotsOnTarget * 100) / 100,
  };
}

export function buildNationalTeamStatAverages(
  rates: InternationalTeamRates,
  teamId: number,
  teamName: string,
  eventAggregates?: AggregatedTeamEventMetrics | null
): TeamStatAverages {
  const styled = estimateNationalEventMetricsFromStyle(rates, teamId, teamName);
  const aggregateWeight =
    eventAggregates?.sampleSize != null
      ? Math.min(0.82, eventAggregates.sampleSize / 10)
      : 0;

  const goalsFor =
    rates.sample.effectiveWeight >= 0.35
      ? rates.sample.goalsFor
      : INTERNATIONAL_BASELINE.goalsFor;
  const goalsAgainst =
    rates.sample.effectiveWeight >= 0.35
      ? rates.sample.goalsAgainst
      : INTERNATIONAL_BASELINE.goalsAgainst;

  return {
    goalsFor,
    goalsAgainst,
    corners: blendMetric(eventAggregates?.cornersPerGame, styled.corners, aggregateWeight),
    fouls: blendMetric(eventAggregates?.foulsPerGame, styled.fouls, aggregateWeight),
    yellowCards: blendMetric(
      eventAggregates?.yellowCardsPerGame,
      styled.yellowCards,
      aggregateWeight
    ),
    redCards: blendMetric(eventAggregates?.redCardsPerGame, styled.redCards, aggregateWeight),
    shotsOnTarget: blendMetric(
      eventAggregates?.shotsOnTargetPerGame,
      styled.shotsOnTarget,
      aggregateWeight
    ),
  };
}

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
  isHomeSide: boolean,
  eventAggregates?: AggregatedTeamEventMetrics | null
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
  const metrics = buildNationalTeamStatAverages(rates, teamId, teamName, eventAggregates);

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

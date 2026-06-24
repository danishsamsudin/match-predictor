import {
  computeTournamentSuspendedPlayerIds,
  countTeamCardsInTournament,
  competitionKey,
} from "@/lib/data/lineup-suspensions";
import { resolveTournamentDisciplineRules } from "@/lib/config/tournament-rules";
import {
  computeLineupImpact,
  ratingToPerformanceScore,
  resolvePlayerPerformanceScore,
} from "@/lib/prediction/lineup-impact";
import type { FixtureLineup, TopScorer } from "@/lib/types/football";
import type { SportApiEvent, SportApiIncidentsResponse } from "@/lib/types/sportapi";

export type CardMlFeatures = {
  home_key_players_suspended_count: number;
  away_key_players_suspended_count: number;
  home_attack_lav_delta: number;
  away_defense_lav_delta: number;
  home_tournament_yellows_avg: number;
  away_tournament_reds_total: number;
};

export type ExtractCardFeaturesOptions = {
  incidentsByEventId: ReadonlyMap<number, SportApiIncidentsResponse>;
  homeSuspendedPlayerIds?: Set<number>;
  awaySuspendedPlayerIds?: Set<number>;
  topScorers?: TopScorer[];
  /** performanceScore threshold for "key" (default 70). */
  keyPlayerMinScore?: number;
  forCompetitionId?: number | null;
};

const DEFAULT_KEY_PLAYER_MIN_SCORE = 70;

function topScorerIdsForTeam(topScorers: TopScorer[], teamId: number, limit = 3): Set<number> {
  const ids = new Set<number>();
  for (const scorer of topScorers) {
    if (!scorer.statistics.some((st) => st.team.id === teamId)) continue;
    ids.add(scorer.player.id);
    if (ids.size >= limit) break;
  }
  return ids;
}

function countKeyPlayersSuspended(
  lineup: FixtureLineup | undefined,
  suspendedIds: Set<number>,
  topScorers: TopScorer[],
  teamId: number,
  keyPlayerMinScore: number
): number {
  if (!lineup || suspendedIds.size === 0) return 0;
  const topIds = topScorerIdsForTeam(topScorers, teamId);
  const squad = [...lineup.startXI, ...(lineup.substitutes ?? [])];
  let count = 0;
  const counted = new Set<number>();

  for (const slot of squad) {
    const id = slot.player.id;
    if (!suspendedIds.has(id) || counted.has(id)) continue;
    counted.add(id);
    const score =
      slot.player.performanceScore ??
      (slot.player.averageRating != null
        ? ratingToPerformanceScore(slot.player.averageRating)
        : resolvePlayerPerformanceScore(null));
    const isKey = score >= keyPlayerMinScore || topIds.has(id);
    if (isKey) count += 1;
  }
  return count;
}

function resolveSuspendedSets(input: {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName?: string;
  awayTeamName?: string;
  allTournamentEvents: SportApiEvent[];
  incidentsByEventId: ReadonlyMap<number, SportApiIncidentsResponse>;
  homeSuspendedPlayerIds?: Set<number>;
  awaySuspendedPlayerIds?: Set<number>;
  forCompetitionId?: number | null;
}): { home: Set<number>; away: Set<number> } {
  if (input.homeSuspendedPlayerIds && input.awaySuspendedPlayerIds) {
    return {
      home: input.homeSuspendedPlayerIds,
      away: input.awaySuspendedPlayerIds,
    };
  }

  const competitionId =
    input.forCompetitionId ??
    (input.allTournamentEvents[0] ? competitionKey(input.allTournamentEvents[0]) : null);
  const rules = resolveTournamentDisciplineRules(competitionId);

  const home =
    input.homeSuspendedPlayerIds ??
    computeTournamentSuspendedPlayerIds({
      teamId: input.homeTeamId,
      teamName: input.homeTeamName,
      allTournamentEvents: input.allTournamentEvents,
      incidentsByEventId: input.incidentsByEventId,
      rules,
    });

  const away =
    input.awaySuspendedPlayerIds ??
    computeTournamentSuspendedPlayerIds({
      teamId: input.awayTeamId,
      teamName: input.awayTeamName,
      allTournamentEvents: input.allTournamentEvents,
      incidentsByEventId: input.incidentsByEventId,
      rules,
    });

  return { home, away };
}

export function extractCardFeatures(
  homeTeamId: number,
  awayTeamId: number,
  allTournamentEvents: SportApiEvent[],
  lineups: FixtureLineup[],
  options: ExtractCardFeaturesOptions
): CardMlFeatures {
  const keyPlayerMinScore = options.keyPlayerMinScore ?? DEFAULT_KEY_PLAYER_MIN_SCORE;
  const topScorers = options.topScorers ?? [];
  const homeLineup = lineups.find((l) => l.team.id === homeTeamId);
  const awayLineup = lineups.find((l) => l.team.id === awayTeamId);

  const { home: homeSuspended, away: awaySuspended } = resolveSuspendedSets({
    homeTeamId,
    awayTeamId,
    homeTeamName: homeLineup?.team.name,
    awayTeamName: awayLineup?.team.name,
    allTournamentEvents,
    incidentsByEventId: options.incidentsByEventId,
    homeSuspendedPlayerIds: options.homeSuspendedPlayerIds,
    awaySuspendedPlayerIds: options.awaySuspendedPlayerIds,
    forCompetitionId: options.forCompetitionId,
  });

  const impact = computeLineupImpact(lineups, topScorers, homeTeamId, awayTeamId, {
    homeSuspendedPlayerIds: homeSuspended,
    awaySuspendedPlayerIds: awaySuspended,
    allTournamentEvents,
    incidentsByEventId: options.incidentsByEventId,
  });

  const homeCards = countTeamCardsInTournament({
    teamId: homeTeamId,
    teamName: homeLineup?.team.name,
    allTournamentEvents,
    incidentsByEventId: options.incidentsByEventId,
  });
  const awayCards = countTeamCardsInTournament({
    teamId: awayTeamId,
    teamName: awayLineup?.team.name,
    allTournamentEvents,
    incidentsByEventId: options.incidentsByEventId,
  });

  return {
    home_key_players_suspended_count: countKeyPlayersSuspended(
      homeLineup,
      homeSuspended,
      topScorers,
      homeTeamId,
      keyPlayerMinScore
    ),
    away_key_players_suspended_count: countKeyPlayersSuspended(
      awayLineup,
      awaySuspended,
      topScorers,
      awayTeamId,
      keyPlayerMinScore
    ),
    home_attack_lav_delta: impact.homeAttackLavDelta ?? 0,
    away_defense_lav_delta: impact.awayDefenseLavDelta ?? 0,
    home_tournament_yellows_avg:
      homeCards.yellows / Math.max(1, homeCards.matchesPlayed),
    away_tournament_reds_total: awayCards.reds,
  };
}

import { computeFormScore, parseTeamStats } from "@/lib/api/football";
import { loadTeamPlayersForComparison } from "@/lib/data/load-team-players";
import {
  isPlaceholderTeamInfo,
  leagueNameForTeam,
  loadSeasonStatsFromDatabase,
  mergeSeasonStats,
  shouldUseDatabaseComparisonStats,
} from "@/lib/data/load-team-comparison-data";
import { getCanonicalTeamHomeVenue } from "@/lib/data/team-home-venues";
import type { FootballBundle, FixtureResult } from "@/lib/types/football";
import type {
  TeamComparisonSnapshot,
  TeamComparisonSide,
  TeamFormMatch,
  TeamSeasonStats,
} from "@/lib/types/team-comparison";
import type { PredictRequest } from "@/lib/types/prediction";
import { tryCreateServiceClient } from "@/lib/supabase";

function formResultForMatch(match: FixtureResult, teamId: number): TeamFormMatch["result"] {
  const isHome = match.teams.home.id === teamId;
  const winner = isHome ? match.teams.home.winner : match.teams.away.winner;
  if (winner === true) return "W";
  if (winner === false) return "L";
  if (winner === null) return "D";
  return "N/A";
}

function mapRecentForm(form: FixtureResult[], teamId: number): TeamFormMatch[] {
  return form.map((match) => {
    const isHome = match.teams.home.id === teamId;
    const teamGoals = isHome ? match.goals.home : match.goals.away;
    const oppGoals = isHome ? match.goals.away : match.goals.home;
    const opponent = isHome ? match.teams.away.name : match.teams.home.name;
    const score =
      teamGoals != null && oppGoals != null ? `${teamGoals}-${oppGoals}` : "N/A";

    return {
      date: match.fixture.date.slice(0, 10),
      opponent,
      score,
      result: formResultForMatch(match, teamId),
    };
  });
}

function buildSeasonStatsFromBundle(
  bundleStats: FootballBundle["homeStats"],
  isHomeSide: boolean,
  teamInfo: FootballBundle["homeTeamInfo"]
): TeamSeasonStats {
  const parsed = parseTeamStats(bundleStats, isHomeSide);
  const played = bundleStats.lineups.reduce((sum, l) => sum + l.played, 0) || 0;
  const yellowTotal = Object.values(bundleStats.cards.yellow).reduce(
    (sum, v) => sum + (v.total ?? 0),
    0
  );
  const redTotal = Object.values(bundleStats.cards.red).reduce(
    (sum, v) => sum + (v.total ?? 0),
    0
  );
  const topFormation = [...bundleStats.lineups].sort((a, b) => b.played - a.played)[0];
  const venueIsPlaceholder = isPlaceholderTeamInfo(teamInfo.venue);
  const canonicalVenue = getCanonicalTeamHomeVenue(teamInfo.team.id, teamInfo.team.name);

  return {
    formScorePct: null,
    form: bundleStats.form?.trim() || null,
    goalsForPerGame: parsed.goalsFor.toFixed(2),
    goalsAgainstPerGame: parsed.goalsAgainst.toFixed(2),
    cornersPerGame: parsed.corners > 0 ? parsed.corners.toFixed(1) : null,
    foulsPerGame: parsed.fouls > 0 ? parsed.fouls.toFixed(1) : null,
    yellowCardsPerGame:
      played > 0 && yellowTotal > 0 ? (yellowTotal / played).toFixed(2) : null,
    redCardsPerGame: played > 0 && redTotal > 0 ? (redTotal / played).toFixed(2) : null,
    shotsOnTargetPerGame:
      parsed.shotsOnTarget > 0 ? parsed.shotsOnTarget.toFixed(1) : null,
    preferredFormation: topFormation?.formation ?? null,
    venueName: venueIsPlaceholder
      ? canonicalVenue?.name ?? null
      : teamInfo.venue.name || canonicalVenue?.name || null,
    venueCapacity:
      venueIsPlaceholder || teamInfo.venue.capacity <= 0
        ? canonicalVenue
          ? String(canonicalVenue.capacity)
          : null
        : String(teamInfo.venue.capacity),
  };
}

async function buildSide(input: {
  teamId: number;
  teamName: string;
  leagueId: number;
  isHomeSide: boolean;
  stats: FootballBundle["homeStats"];
  form: FixtureResult[];
  formScore: number;
  teamInfo: FootballBundle["homeTeamInfo"];
  topScorers: FootballBundle["topScorers"];
  useDatabaseStats: boolean;
}): Promise<TeamComparisonSide> {
  const supabase = tryCreateServiceClient();
  const players = await loadTeamPlayersForComparison(
    supabase,
    input.teamId,
    input.topScorers,
    5
  );

  const fromBundle = buildSeasonStatsFromBundle(
    input.stats,
    input.isHomeSide,
    input.teamInfo
  );
  const formScorePct =
    input.form.length > 0 ? `${Math.round(input.formScore * 100)}%` : null;

  let seasonStats: TeamSeasonStats;
  if (input.useDatabaseStats || supabase) {
    const fromDb = await loadSeasonStatsFromDatabase(
      input.teamId,
      input.leagueId,
      input.isHomeSide,
      input.teamName
    );
    seasonStats = {
      ...mergeSeasonStats(fromDb.stats, fromBundle),
      formScorePct: formScorePct ?? fromDb.stats.formScorePct,
    };
  } else {
    seasonStats = {
      ...fromBundle,
      formScorePct,
    };
  }

  const recentForm = input.form.length
    ? mapRecentForm(input.form, input.teamId)
    : [];

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    leagueName: leagueNameForTeam(input.leagueId),
    seasonStats,
    recentForm,
    players,
  };
}

export async function buildTeamComparisonSnapshot(
  input: PredictRequest,
  bundle: FootballBundle
): Promise<TeamComparisonSnapshot> {
  const homeLeagueId = input.homeLeagueId ?? bundle.fixture.league.id;
  const awayLeagueId = input.awayLeagueId ?? bundle.fixture.league.id;
  const useDatabaseStats = shouldUseDatabaseComparisonStats();
  const homeFormScore = computeFormScore(bundle.homeForm, input.homeTeamId);
  const awayFormScore = computeFormScore(bundle.awayForm, input.awayTeamId);

  const homeName =
    input.homeTeamName?.trim() ||
    bundle.fixture.teams.home.name ||
    bundle.homeTeamInfo.team.name;
  const awayName =
    input.awayTeamName?.trim() ||
    bundle.fixture.teams.away.name ||
    bundle.awayTeamInfo.team.name;

  const [home, away] = await Promise.all([
    buildSide({
      teamId: input.homeTeamId,
      teamName: homeName,
      leagueId: homeLeagueId,
      isHomeSide: true,
      stats: bundle.homeStats,
      form: bundle.homeForm,
      formScore: homeFormScore,
      teamInfo: bundle.homeTeamInfo,
      topScorers: bundle.topScorers,
      useDatabaseStats,
    }),
    buildSide({
      teamId: input.awayTeamId,
      teamName: awayName,
      leagueId: awayLeagueId,
      isHomeSide: false,
      stats: bundle.awayStats,
      form: bundle.awayForm,
      formScore: awayFormScore,
      teamInfo: bundle.awayTeamInfo,
      topScorers: bundle.topScorers,
      useDatabaseStats,
    }),
  ]);

  return { home, away, usesDatabaseStats: useDatabaseStats };
}

export function displayValue(value: string | null | undefined): string {
  if (value == null || value === "") return "N/A";
  return value;
}

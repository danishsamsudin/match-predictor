import {
  mapEventToFixture,
  mapEventToFixtureResult,
  mapLineups,
  mapStandingsRowToTeamStatistics,
  enrichTeamStatsFromMatchStatistics,
} from "@/lib/api/sportapi/mappers";
import type { FootballBundle, TopScorer } from "@/lib/types/football";
import type { SportApiEvent, SportApiLineupsResponse, SportApiStatisticsResponse } from "@/lib/types/sportapi";

export function buildFootballBundleFromParts(input: {
  event: SportApiEvent;
  referenceLeagueId: number;
  season: number;
  homeTeamId: number;
  awayTeamId: number;
  statistics?: SportApiStatisticsResponse;
  lineups?: SportApiLineupsResponse;
  homeStandingsRow?: Parameters<typeof mapStandingsRowToTeamStatistics>[0];
  awayStandingsRow?: Parameters<typeof mapStandingsRowToTeamStatistics>[0];
  homeFormEvents: SportApiEvent[];
  awayFormEvents: SportApiEvent[];
  h2hEvents: SportApiEvent[];
  topScorers?: TopScorer[];
  venueCity?: string;
}): FootballBundle {
  const fixture = mapEventToFixture(input.event, input.referenceLeagueId, input.season);
  if (input.venueCity) {
    fixture.fixture.venue.city = input.venueCity;
  }

  let homeStats = input.homeStandingsRow
    ? mapStandingsRowToTeamStatistics(
        input.homeStandingsRow,
        input.referenceLeagueId,
        input.season,
        true
      )
    : mapStandingsRowToTeamStatistics(
        {
          team: input.event.homeTeam,
          position: 10,
          matches: 10,
          wins: 3,
          draws: 3,
          losses: 4,
          scoresFor: 15,
          scoresAgainst: 15,
          points: 12,
        },
        input.referenceLeagueId,
        input.season,
        true
      );

  let awayStats = input.awayStandingsRow
    ? mapStandingsRowToTeamStatistics(
        input.awayStandingsRow,
        input.referenceLeagueId,
        input.season,
        false
      )
    : mapStandingsRowToTeamStatistics(
        {
          team: input.event.awayTeam,
          position: 10,
          matches: 10,
          wins: 3,
          draws: 3,
          losses: 4,
          scoresFor: 15,
          scoresAgainst: 15,
          points: 12,
        },
        input.referenceLeagueId,
        input.season,
        false
      );

  if (input.statistics) {
    homeStats = enrichTeamStatsFromMatchStatistics(homeStats, input.statistics, true);
    awayStats = enrichTeamStatsFromMatchStatistics(awayStats, input.statistics, false);
  }

  const lineups = input.lineups
    ? mapLineups(
        input.lineups,
        input.homeTeamId,
        input.awayTeamId,
        input.event.homeTeam.name,
        input.event.awayTeam.name
      )
    : [];

  return {
    fixture,
    homeStats,
    awayStats,
    homeForm: input.homeFormEvents.slice(0, 5).map(mapEventToFixtureResult),
    awayForm: input.awayFormEvents.slice(0, 5).map(mapEventToFixtureResult),
    h2h: input.h2hEvents.slice(0, 10).map(mapEventToFixtureResult),
    lineups,
    topScorers: input.topScorers ?? [],
    homeTeamInfo: {
      team: { id: input.homeTeamId, name: input.event.homeTeam.name, country: "" },
      venue: {
        id: 0,
        name: fixture.fixture.venue.name,
        address: "",
        city: fixture.fixture.venue.city,
        capacity: 40000,
        surface: "grass",
        image: "",
      },
    },
    awayTeamInfo: {
      team: { id: input.awayTeamId, name: input.event.awayTeam.name, country: "" },
      venue: {
        id: 0,
        name: `${input.event.awayTeam.name} Stadium`,
        address: "",
        city: fixture.fixture.venue.city,
        capacity: 40000,
        surface: "grass",
        image: "",
      },
    },
  };
}

export function findStandingsRow(
  standingsPayload: { standings?: Array<{ rows?: Array<Parameters<typeof mapStandingsRowToTeamStatistics>[0]> }> },
  teamId: number,
  teamName?: string
) {
  for (const group of standingsPayload.standings ?? []) {
    const row = group.rows?.find((r) => {
      const idMatch = r.team.id === teamId;
      const nameMatch =
        teamName && r.team.name.toLowerCase() === teamName.toLowerCase();
      return idMatch || nameMatch;
    });
    if (row) return row;
  }
  return undefined;
}

export function filterFormForTeam(events: SportApiEvent[], teamId: number): SportApiEvent[] {
  return events.filter((e) => e.homeTeam.id === teamId || e.awayTeam.id === teamId);
}

import fixtureVenueSchedule from "../../../data/nations-league-2026/fixture-venues.json";
import {
  NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
} from "@/lib/data/nations-league-2026-teams";
import type { FixtureOption } from "@/lib/types/football-lookup";

type NlVenueFixture = {
  sofascore_event_id: number;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  kickoff_utc: string;
  venue_city: string | null;
};

const NL_LEAGUE_NAME = "UEFA Nations League";
const NL_SEASON = 2026;

/**
 * Nations League fixtures from the seeded Sofascore schedule
 * (event ids + team ids aligned with the national catalog).
 */
export function loadNationsLeagueScheduleFixtures(): FixtureOption[] {
  const rows = fixtureVenueSchedule.fixtures as NlVenueFixture[];
  return rows
    .filter(
      (row) =>
        Number.isFinite(row.sofascore_event_id) &&
        Number.isFinite(row.home_team_id) &&
        Number.isFinite(row.away_team_id) &&
        Boolean(row.kickoff_utc)
    )
    .map((row) => ({
      id: row.sofascore_event_id,
      date: row.kickoff_utc,
      venueCity: (row.venue_city ?? "").trim(),
      league: {
        id: NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
        name: NL_LEAGUE_NAME,
        season: NL_SEASON,
      },
      home: { id: row.home_team_id, name: row.home },
      away: { id: row.away_team_id, name: row.away },
    }));
}

import { resolveGroupCode } from "@/lib/world-cup/group-draw";
import { resolveFixtureVenue } from "@/lib/world-cup/fixture-venues";
import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export function deriveMatchStatus(m: WcMatchRow): string {
  if (m.status && m.status !== "scheduled") return m.status;
  if (m.home_goals != null && m.away_goals != null) return "finished";
  return "scheduled";
}

export function enrichMatchEnvironment(
  match: WcMatchRow,
  allMatches: WcMatchRow[],
  teamNameById: Map<string, string>,
  options?: {
    teamToGroup?: Map<string, string>;
    competition?: string | null;
    round?: string | null;
  }
): Partial<WcMatchRow> & {
  venue: string | null;
  venue_city: string | null;
  venue_label: string | null;
  venue_altitude_meters: number;
  rest_hours_home: number | null;
  rest_hours_away: number | null;
  prior_home_tz: string | null;
  prior_away_tz: string | null;
} {
  const homeName =
    match.home_team_name ??
    (match.home_team_id ? teamNameById.get(match.home_team_id) : undefined);
  const awayName =
    match.away_team_name ??
    (match.away_team_id ? teamNameById.get(match.away_team_id) : undefined);

  const fixtureVenue = resolveFixtureVenue({
    date: match.date,
    homeName,
    awayName,
    venue: match.venue,
    venue_city: match.venue_city,
  });

  const venueHint =
    fixtureVenue?.city ??
    match.venue_city ??
    fixtureVenue?.stadium ??
    match.venue ??
    null;
  const venue = resolveStadiumVenue(venueHint);
  const venueCity = venue?.city ?? fixtureVenue?.city ?? venueHint;
  const stadiumLabel = fixtureVenue?.stadium ?? match.venue ?? null;
  const altitude = venue?.altitude_meters ?? match.venue_altitude_meters ?? 0;
  const destTz = venue?.timezone ?? "America/New_York";

  const prior = (teamId: string) => {
    const finished = allMatches
      .filter(
        (m) =>
          m.status === "finished" &&
          m.date &&
          (m.home_team_id === teamId || m.away_team_id === teamId) &&
          m.id !== match.id
      )
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
    if (!finished?.date) return { hours: null as number | null, tz: null as string | null };
    const prevVenue = resolveStadiumVenue(finished.venue_city ?? null);
    const kickoff = match.date ? new Date(`${match.date}T12:00:00`) : new Date();
    const prevDate = new Date(finished.date);
    const hours = Math.max(
      0,
      (kickoff.getTime() - prevDate.getTime()) / (1000 * 60 * 60)
    );
    return { hours, tz: prevVenue?.timezone ?? null };
  };

  const homePrior = match.home_team_id ? prior(match.home_team_id) : { hours: null, tz: null };
  const awayPrior = match.away_team_id ? prior(match.away_team_id) : { hours: null, tz: null };

  return {
    venue: stadiumLabel,
    venue_city: venueCity,
    venue_label: stadiumLabel,
    venue_altitude_meters: altitude,
    rest_hours_home: homePrior.hours,
    rest_hours_away: awayPrior.hours,
    prior_home_tz: homePrior.tz,
    prior_away_tz: awayPrior.tz,
    status: deriveMatchStatus(match),
    group_code:
      resolveGroupCode({
        existing: match.group_code,
        competition: options?.competition,
        round: options?.round,
        date: match.date,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        teamToGroup: options?.teamToGroup ?? new Map(),
      }) ?? match.group_code,
  };
}

export function inferGroupCodeFromCompetition(
  competition: string | null,
  round: string | null
): string | null {
  const text = `${competition ?? ""} ${round ?? ""}`.toUpperCase();
  const m = text.match(/GROUP\s+([A-L])/);
  if (m) return m[1];
  return null;
}

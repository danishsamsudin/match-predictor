import {
  alignRecentMatchDisplay,
  namesNeedHomeAwaySwap,
} from "@/lib/world-cup/match-orientation";
import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { isTeamInInternationalFormMatch } from "@/lib/world-cup/international-form-team-side";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export type WcMatchRowWithIngest = WcMatchRow & {
  ingest_source_home?: string | null;
  ingest_source_away?: string | null;
  ingest_source_home_goals?: number | null;
  ingest_source_away_goals?: number | null;
};

/** Map a finished WC match to canonical home/away orientation and scores. */
export function wcMatchRowToInternationalForm(
  m: WcMatchRowWithIngest
): InternationalFormMatch | null {
  if (m.home_goals == null || m.away_goals == null) return null;
  if (!m.home_team_name?.trim() || !m.away_team_name?.trim()) return null;

  const aligned = alignRecentMatchDisplay({
    date: m.date,
    homeTeamName: m.home_team_name,
    awayTeamName: m.away_team_name,
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
    summary: null,
    ingestSourceHome: m.ingest_source_home,
    ingestSourceAway: m.ingest_source_away,
    ingestSourceHomeGoals: m.ingest_source_home_goals,
    ingestSourceAwayGoals: m.ingest_source_away_goals,
  });

  const orientationSwapped = namesNeedHomeAwaySwap(
    m.home_team_name,
    m.away_team_name,
    aligned.homeTeamName,
    aligned.awayTeamName
  );

  const venueMeta = resolveStadiumVenue(m.venue_city ?? m.venue ?? null);
  const venueAltitude =
    m.venue_altitude_meters ?? venueMeta?.altitude_meters ?? null;

  return {
    date: m.date,
    home_team_id: orientationSwapped ? m.away_team_id : m.home_team_id,
    away_team_id: orientationSwapped ? m.home_team_id : m.away_team_id,
    home_goals: aligned.homeGoals,
    away_goals: aligned.awayGoals,
    competition: m.competition ?? "FIFA World Cup 2026",
    home_team_name: aligned.homeTeamName,
    away_team_name: aligned.awayTeamName,
    venue_altitude_meters: venueAltitude,
  };
}

export function wcFinalsFormSlice(
  teamId: string,
  finishedMatches: WcMatchRowWithIngest[],
  teamName?: string
): InternationalFormMatch[] {
  const rows: InternationalFormMatch[] = [];
  for (const m of finishedMatches) {
    const aligned = wcMatchRowToInternationalForm(m);
    if (!aligned) continue;
    if (!isTeamInInternationalFormMatch(aligned, teamId, teamName)) continue;
    rows.push(aligned);
  }
  return rows;
}

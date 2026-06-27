import {
  alignRecentMatchDisplay,
  namesNeedHomeAwaySwap,
} from "@/lib/world-cup/match-orientation";

export type FinishedMatchDisplayAlign = {
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  homeTeamId: string;
  awayTeamId: string;
  label: string;
};

type FinishedMatchRow = {
  id: string;
  date: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number;
  away_goals: number;
  ingest_source_home?: string | null;
  ingest_source_away?: string | null;
  ingest_source_home_goals?: number | null;
  ingest_source_away_goals?: number | null;
};

/** Official schedule home/away and scores for finished-match reporting. */
export function alignFinishedMatchForDisplay(
  m: FinishedMatchRow,
  names: Map<string, string>
): FinishedMatchDisplayAlign | null {
  if (!m.home_team_id || !m.away_team_id) return null;

  const dbHomeName = names.get(String(m.home_team_id)) ?? "Home";
  const dbAwayName = names.get(String(m.away_team_id)) ?? "Away";
  const aligned = alignRecentMatchDisplay({
    date: m.date,
    homeTeamName: dbHomeName,
    awayTeamName: dbAwayName,
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
    summary: null,
    ingestSourceHome: m.ingest_source_home,
    ingestSourceAway: m.ingest_source_away,
    ingestSourceHomeGoals: m.ingest_source_home_goals,
    ingestSourceAwayGoals: m.ingest_source_away_goals,
  });

  if (aligned.homeGoals == null || aligned.awayGoals == null) return null;

  const orientationSwapped = namesNeedHomeAwaySwap(
    aligned.homeTeamName,
    aligned.awayTeamName,
    dbHomeName,
    dbAwayName
  );

  return {
    homeTeamName: aligned.homeTeamName,
    awayTeamName: aligned.awayTeamName,
    homeGoals: aligned.homeGoals,
    awayGoals: aligned.awayGoals,
    homeTeamId: orientationSwapped ? String(m.away_team_id) : String(m.home_team_id),
    awayTeamId: orientationSwapped ? String(m.home_team_id) : String(m.away_team_id),
    label: `${aligned.homeTeamName} vs ${aligned.awayTeamName}`,
  };
}

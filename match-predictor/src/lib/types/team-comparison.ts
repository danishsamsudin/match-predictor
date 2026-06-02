export interface TeamFormMatch {
  date: string;
  opponent: string;
  score: string;
  result: "W" | "D" | "L" | "N/A";
}

export interface TeamSeasonStats {
  formScorePct: string | null;
  form: string | null;
  goalsForPerGame: string | null;
  goalsAgainstPerGame: string | null;
  cornersPerGame: string | null;
  foulsPerGame: string | null;
  yellowCardsPerGame: string | null;
  redCardsPerGame: string | null;
  shotsOnTargetPerGame: string | null;
  preferredFormation: string | null;
  venueName: string | null;
  venueCapacity: string | null;
}

export interface TeamPlayerStat {
  name: string;
  goals: string | null;
  appearances: string | null;
  rating: string | null;
  position: string | null;
}

export interface TeamComparisonSide {
  teamId: number;
  teamName: string;
  leagueName: string | null;
  seasonStats: TeamSeasonStats;
  recentForm: TeamFormMatch[];
  players: TeamPlayerStat[];
}

export interface TeamComparisonSnapshot {
  home: TeamComparisonSide;
  away: TeamComparisonSide;
  /** When true, season rows use Supabase standings/events (not API placeholders). */
  usesDatabaseStats?: boolean;
}

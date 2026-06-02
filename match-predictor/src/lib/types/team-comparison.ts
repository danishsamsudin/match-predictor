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

export interface PlayerDisplayStat {
  label: string;
  value: string;
}

export interface SquadPlayer {
  sofascorePlayerId: number;
  scoutlystPlayerKey: string | null;
  name: string;
  /** GK, DEF, MID, FWD */
  position: string;
  /** Raw lineup slot when available (e.g. CB, LW). */
  fieldPosition: string | null;
  /** 0–100 composite from Scoutlyst / match ratings. */
  performanceScore: number | null;
  /** Share of inferred XI starts in recent matches (starters only). */
  startSharePct: number | null;
  detailStats: PlayerDisplayStat[];
  age: number | null;
}

export type TeamSquadSource = "lineups" | "scoutlyst" | "none";

export interface TeamSquadSnapshot {
  starters: SquadPlayer[];
  substitutes: SquadPlayer[];
  hasLineupData: boolean;
  hasScoutlystData: boolean;
  /** How starters/bench were chosen. */
  squadSource: TeamSquadSource;
  snapshotDate: string | null;
}

export interface TeamComparisonSide {
  teamId: number;
  teamName: string;
  leagueName: string | null;
  seasonStats: TeamSeasonStats;
  recentForm: TeamFormMatch[];
  players: TeamPlayerStat[];
  squad: TeamSquadSnapshot;
}

export interface TeamComparisonSnapshot {
  home: TeamComparisonSide;
  away: TeamComparisonSide;
  /** When true, season rows use Supabase standings/events (not API placeholders). */
  usesDatabaseStats?: boolean;
}

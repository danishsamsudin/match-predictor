/** Data-backed team metrics for betting context (not model outputs). */

export interface TeamMatchHistoryRow {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  competition: string | null;
}

export interface TeamFormRecord {
  wins: number;
  draws: number;
  losses: number;
}

export interface TeamRecentPerformanceInsights {
  windowSize: number;
  windowLabel: string;
  record: TeamFormRecord;
  goalDifferential: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  cleanSheetPct: number;
  failedToScorePct: number;
}

export interface TeamBettingTrendInsights {
  windowSize: number;
  bttsYesPct: number;
  over25Pct: number;
}

export interface TeamFifaRankingInsights {
  rank: number;
  points: number;
  snapshotLabel: string;
}

export interface TeamVsTop20Insights {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  ppg: number;
  winPct: number;
}

export interface TeamQualifyingInsights {
  matchesPlayed: number;
  points: number;
  ppg: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface TeamAttackingInsights {
  shotConversionPct: number | null;
  shotsPer90: number | null;
  shotsOnTargetPer90: number | null;
  crossesPer90: number | null;
  topScorerSharePct: number | null;
  topScorerName: string | null;
}

export interface TeamDefensiveInsights {
  goalkeeperSavePct: number | null;
  tacklesPer90: number | null;
  interceptionsPer90: number | null;
  shotsConcededPerGame: number | null;
}

export interface TeamSquadProfileInsights {
  averageAge: number | null;
  squadPlayersUsed: number;
  penaltyConversionPct: number | null;
  yellowCardsPer90: number | null;
}

export interface TeamBettingInsights {
  source: "synced" | "fbref" | "mixed" | "none";
  fifaRanking: TeamFifaRankingInsights | null;
  vsTop20: TeamVsTop20Insights | null;
  recent: TeamRecentPerformanceInsights | null;
  bettingTrends: TeamBettingTrendInsights | null;
  qualifying: TeamQualifyingInsights | null;
  attacking: TeamAttackingInsights | null;
  defensive: TeamDefensiveInsights | null;
  squad: TeamSquadProfileInsights | null;
}

export interface FixtureContextInsights {
  kickoffDate: string;
  homeRestDays: number | null;
  awayRestDays: number | null;
  homeLastMatchDate: string | null;
  awayLastMatchDate: string | null;
}

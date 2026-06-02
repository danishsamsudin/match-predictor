import type { TeamComparisonSnapshot } from "@/lib/types/team-comparison";

export interface PredictRequest {
  mode?: "fixture" | "compare";
  matchId?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeLeagueId?: number;
  awayLeagueId?: number;
  entityType?: "club" | "national";
  homeTeamName?: string;
  awayTeamName?: string;
  city: string;
  matchDate: string;
}

export interface FirstTeamToScorePct {
  home: number;
  away: number;
  none: number;
}

export interface ScoreCell {
  home: number;
  away: number;
  probability: number;
}

export interface OverUnderLine {
  line: number;
  overPct: number;
  underPct: number;
}

export interface PredictionAnalytics {
  topScores: ScoreCell[];
  scoreHeatmap: ScoreCell[];
  overUnder: OverUnderLine[];
  btts: { yesPct: number; noPct: number };
  totalGoalsDistribution: { goals: number; probability: number }[];
  h2h: { homeWinPct: number; drawPct: number; awayWinPct: number };
  formScores: { homePct: number; awayPct: number };
  momentumIndex: number;
  modelImpact: {
    label: string;
    homeMultiplier: number;
    awayMultiplier: number;
  }[];
  statComparison: { metric: string; home: number; away: number }[];
}

export interface PredictionResult {
  id?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  teamComparison?: TeamComparisonSnapshot;
  analytics?: PredictionAnalytics;
  homeWinPct: number;
  awayWinPct: number;
  drawPct: number;
  firstTeamToScorePct?: FirstTeamToScorePct;
  expectedGoals: { home: number; away: number };
  estimated: {
    corners: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
  };
  explanation: string;
  fromCache?: boolean;
  mode?: "fixture" | "compare";
  entityType?: "club" | "national";
  debug?: { factors: Record<string, number> };
}

export interface TeamStatAverages {
  goalsFor: number;
  goalsAgainst: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  shotsOnTarget: number;
}

export interface BaseProbabilityInput {
  homeFormScore: number;
  awayFormScore: number;
  h2hHomeWinRate: number;
  h2hDrawRate: number;
  h2hAwayWinRate: number;
  /** League strength multiplier Ω_L for home team (1.0 = top tier). */
  homeLeagueStrength: number;
  /** League strength multiplier Ω_L for away team. */
  awayLeagueStrength: number;
  homeStats: TeamStatAverages;
  awayStats: TeamStatAverages;
  /** When true, suppress asymmetric home/away momentum tilts (neutral venue). */
  isNeutralVenue?: boolean;
}

export interface BaseProbabilityOutput {
  homeXg: number;
  awayXg: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface LineupImpactResult {
  homeXgMultiplier: number;
  awayXgMultiplier: number;
  notes: string[];
}

export interface WeatherImpactResult {
  homeXgMultiplier: number;
  awayXgMultiplier: number;
  foulsMultiplier: number;
  cardsMultiplier: number;
  notes: string[];
}

export interface StadiumImpactResult {
  homeXgMultiplier: number;
  awayXgMultiplier: number;
  foulsMultiplier: number;
  cardsMultiplier: number;
  notes: string[];
}

export interface WeatherForecast {
  condition: string;
  tempC: number;
  humidity: number;
  windKph: number;
  precipMm: number;
  lat?: number;
  lon?: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class UpstreamApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamApiError";
  }
}

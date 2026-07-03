import type { FixtureLineup } from "@/lib/types/football";
import type { TeamComparisonSnapshot } from "@/lib/types/team-comparison";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";

/** How lineup data drives xG: manual XI uses player-xG blend; model uses team structural xG only. */
export type PredictionLineupSource = "manual_xi" | "model_xi";

export interface PredictRequest {
  mode?: "fixture" | "compare";
  /** manual_xi = player-xG from selected XI; model_xi = team structural xG only. */
  lineupSource?: PredictionLineupSource;
  /** Override predicted lineups for what-if analysis. */
  customLineups?: FixtureLineup[];
  matchId?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeLeagueId?: number;
  awayLeagueId?: number;
  entityType?: "club" | "national";
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamShortName?: string;
  awayTeamShortName?: string;
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
  /** Fair European (decimal) odds for the over side. */
  overOdds?: number;
  /** Fair European (decimal) odds for the under side. */
  underOdds?: number;
}

export interface WinningMarginLine {
  side: "home" | "away";
  margin: 1 | 2 | 3;
  probabilityPct: number;
}

export interface AsianHandicapLine {
  line: number;
  homeCoverPct: number;
  awayCoverPct: number;
  pushPct?: number;
}

export interface HandicapMarkets {
  winningMargins: WinningMarginLine[];
  asianHandicap: AsianHandicapLine[];
}

export interface PredictionAnalytics {
  topScores: ScoreCell[];
  scoreHeatmap: ScoreCell[];
  overUnder: OverUnderLine[];
  btts: {
    yesPct: number;
    noPct: number;
    yesOdds?: number;
    noOdds?: number;
  };
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
  /** BTTS / Over 2.5 rates from stored results (not the Poisson model). */
  historicalMarkets?: {
    home: { bttsYesPct: number; over25Pct: number; sampleSize: number };
    away: { bttsYesPct: number; over25Pct: number; sampleSize: number };
  };
  handicapMarkets: HandicapMarkets;
  /** Match-level player goal markets (anytime scorer, goal or assist). */
  playerProps?: PlayerPropsPayload;
}

export interface PredictionResult {
  modelVersion?: string;
  id?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamShortName?: string;
  awayTeamShortName?: string;
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
  lineupSource?: PredictionLineupSource;
  debug?: { factors: Record<string, number> };
  playerProps?: PlayerPropsPayload;
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
  /** Competition-average goals per team per match (μ). */
  leagueAvgGoals?: number;
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
  /** Opponent xG multiplier when home defense is weak (LAV). */
  homeDefenseMultiplier?: number;
  /** Opponent xG multiplier when away defense is weak (LAV). */
  awayDefenseMultiplier?: number;
  notes: string[];
  /** Sum of per-player LAV drop-offs from suspensions (home). */
  homeSuspensionLavImpact: number;
  /** Sum of per-player LAV drop-offs from suspensions (away). */
  awaySuspensionLavImpact: number;
  /** Normalized 0–1 tournament card-load risk (home). */
  homeDisciplineRiskIndex: number;
  /** Normalized 0–1 tournament card-load risk (away). */
  awayDisciplineRiskIndex: number;
  /** Attack-position suspension LAV delta (home). */
  homeAttackLavDelta?: number;
  /** Defense-position suspension LAV delta (home). */
  homeDefenseLavDelta?: number;
  /** Attack-position suspension LAV delta (away). */
  awayAttackLavDelta?: number;
  /** Defense-position suspension LAV delta (away). */
  awayDefenseLavDelta?: number;
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

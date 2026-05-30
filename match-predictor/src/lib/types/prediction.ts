export interface PredictRequest {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  city: string;
  matchDate: string;
}

export interface PredictionResult {
  id?: string;
  homeWinPct: number;
  awayWinPct: number;
  drawPct: number;
  expectedGoals: { home: number; away: number };
  estimated: {
    corners: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
  };
  explanation: string;
  fromCache?: boolean;
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
  homeStats: TeamStatAverages;
  awayStats: TeamStatAverages;
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

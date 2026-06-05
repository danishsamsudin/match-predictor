import type { TeamRef } from "@/lib/world-cup/knockout-bracket";
import type { ForecastMatchResult, TournamentForecast } from "@/lib/world-cup/tournament-simulation";

export type MonteCarloTeamStats = {
  teamId: string;
  teamName: string;
  winPct: number;
  finalPct: number;
  semiPct: number;
};

export type MonteCarloSummary = {
  iterations: number;
  teams: MonteCarloTeamStats[];
};

export type TournamentForecastPayload = {
  mode: "deterministic";
  computedAt: string;
  allocationKey: string | null;
  champion: TeamRef;
  runnerUp: TeamRef;
  thirdPlace: TeamRef;
  semiFinalists: [TeamRef, TeamRef];
  warnings: string[];
  knockoutMatches: ForecastMatchResult[];
  monteCarlo?: MonteCarloSummary;
};

export function toTournamentForecastPayload(
  forecast: TournamentForecast,
  monteCarlo?: MonteCarloSummary
): TournamentForecastPayload {
  return {
    mode: forecast.mode,
    computedAt: forecast.computedAt,
    allocationKey: forecast.allocationKey,
    champion: forecast.champion,
    runnerUp: forecast.runnerUp,
    thirdPlace: forecast.thirdPlace,
    semiFinalists: forecast.semiFinalists,
    warnings: forecast.warnings,
    knockoutMatches: forecast.knockoutMatches,
    monteCarlo,
  };
}

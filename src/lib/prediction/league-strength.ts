import type { EntityType } from "@/lib/types/football-lookup";

export interface ComparisonBundleInput {
  homeTeamId: number;
  awayTeamId: number;
  homeLeagueId: number;
  awayLeagueId: number;
  homeTeamName: string;
  awayTeamName: string;
  entityType?: EntityType;
  city: string;
  matchDate: string;
}

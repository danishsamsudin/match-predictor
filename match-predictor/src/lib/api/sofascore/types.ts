import type { SportApiEvent, SportApiSeason, SportApiStandingsResponse } from "@/lib/types/sportapi";

export interface SofascoreSeasonsResponse {
  seasons: SportApiSeason[];
}

export type SofascoreStandingsResponse = SportApiStandingsResponse;

export interface SofascoreEventsResponse {
  events: SportApiEvent[];
}

export interface SofascoreEventDetailResponse {
  event: SportApiEvent;
}

export type SofascoreStatisticsResponse = import("@/lib/types/sportapi").SportApiStatisticsResponse;
export type SofascoreLineupsResponse = import("@/lib/types/sportapi").SportApiLineupsResponse;
export type SofascoreIncidentsResponse = import("@/lib/types/sportapi").SportApiIncidentsResponse;
export type SofascoreH2HResponse = import("@/lib/types/sportapi").SportApiH2HResponse;

export interface SofascoreTeamStatisticsResponse {
  statistics: Record<string, number | string>;
}

export interface SofascoreTournamentDetailResponse {
  uniqueTournament?: { id: number; name: string; slug?: string };
  tournament?: { id: number; name: string };
}

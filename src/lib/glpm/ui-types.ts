/**
 * Client-safe GLPM UI payload types (no Supabase imports).
 */

import type { SideInteractions, PrimaryKey } from "@/lib/glpm/engine";
import type { GlpmRatingDimensionMetadata } from "@/lib/glpm/types";

export type GlpmStyleSummary = {
  labels: string[];
  avgPossession: number | null;
  avgPpda: number | null;
  avgDirectness: number | null;
};

export type GlpmPredictUiPayload = {
  homeTeam: {
    smId: number;
    name: string;
    ratings: Record<PrimaryKey, number>;
    metadata: Partial<Record<PrimaryKey, GlpmRatingDimensionMetadata>>;
    asOfDate: string;
    style: GlpmStyleSummary | null;
  };
  awayTeam: {
    smId: number;
    name: string;
    ratings: Record<PrimaryKey, number>;
    metadata: Partial<Record<PrimaryKey, GlpmRatingDimensionMetadata>>;
    asOfDate: string;
    style: GlpmStyleSummary | null;
  };
  seasonId: number;
  matchSmId: number | null;
  homeXg: number;
  awayXg: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  overUnder: Record<string, { over: number; under: number }>;
  scoreMatrix: number[][];
  interactions: {
    home: SideInteractions;
    away: SideInteractions;
  };
  context: Record<string, unknown>;
  xgModelVersion: string;
  predModelVersion: string;
  executedAt: string;
  predictionId: string | null;
};

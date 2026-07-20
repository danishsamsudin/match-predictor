/**
 * Match context + xG result types (Chapter 11).
 */

export type MatchContext = {
  isNeutralVenue?: boolean;
  homeRestDays?: number;
  awayRestDays?: number;
  homeTravelKm?: number;
  awayTravelKm?: number;
  venueAltitudeM?: number | null;
  competitionMu?: number | null;
  homeContextMultiplier?: number | null;
  awayContextMultiplier?: number | null;
};

export type XgEngineResult = {
  homeXg: number;
  awayXg: number;
  interactions: Record<string, unknown>;
  context: Record<string, unknown>;
  modelVersion: string;
};

export type PrimaryKey =
  | "attack"
  | "defence"
  | "goalkeeper"
  | "build_up"
  | "possession"
  | "pressing"
  | "finishing";

export const PRIMARY_ORDER: readonly PrimaryKey[] = [
  "attack",
  "defence",
  "goalkeeper",
  "build_up",
  "possession",
  "pressing",
  "finishing",
] as const;

export type RatingVectorInput = Partial<Record<PrimaryKey, number | null>> &
  Record<string, number | null | undefined>;

export const PRIMARY_LABELS: Record<PrimaryKey, string> = {
  attack: "Attack",
  defence: "Defence",
  goalkeeper: "Goalkeeper",
  build_up: "Build-up",
  possession: "Possession",
  pressing: "Pressing",
  finishing: "Finishing",
};

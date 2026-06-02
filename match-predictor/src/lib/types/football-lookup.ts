export type EntityType = "club" | "national";

export type SyncTier = 1 | 2 | 3;

export interface CountryOption {
  name: string;
  code: string;
}

export interface LeagueOption {
  id: number;
  name: string;
  country: string;
  season: number;
  type: string;
  entityType: EntityType;
  syncTier: SyncTier;
}

export interface TeamOption {
  id: number;
  name: string;
  /** Synced/API short label (e.g. PSG, BVB) for compact UI. */
  shortName?: string;
  logo?: string;
}

export interface FixtureOption {
  id: number;
  date: string;
  venueCity: string;
  league: { id: number; name: string; season: number };
  home: { id: number; name: string };
  away: { id: number; name: string };
}

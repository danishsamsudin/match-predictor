import { SM_LEAGUE } from "@/lib/sportmonks/constants";

export type StandingZoneKind =
  | "champions_league"
  | "europa_league"
  | "conference_league"
  | "relegation";

export type StandingZoneRange = {
  from: number;
  to: number;
};

export type StandingZonesConfig = {
  championsLeague: StandingZoneRange | null;
  europaLeague: StandingZoneRange | null;
  conferenceLeague: StandingZoneRange | null;
  /** Automatic relegation places at the bottom of the table. */
  relegationPlaces: number;
};

/**
 * Qualification / relegation bands by SportMonks competition id.
 * European spots follow typical association allocations (not cup-winner
 * adjustments). Play-off ranks (e.g. Eredivisie / Bundesliga 16th) are omitted.
 */
export const GLPM_STANDING_ZONES: Record<number, StandingZonesConfig> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: {
    championsLeague: { from: 1, to: 4 },
    europaLeague: { from: 5, to: 5 },
    conferenceLeague: { from: 6, to: 6 },
    relegationPlaces: 3,
  },
  [SM_LEAGUE.SERIE_A]: {
    championsLeague: { from: 1, to: 4 },
    europaLeague: { from: 5, to: 5 },
    conferenceLeague: { from: 6, to: 6 },
    relegationPlaces: 3,
  },
  [SM_LEAGUE.BUNDESLIGA]: {
    championsLeague: { from: 1, to: 4 },
    europaLeague: { from: 5, to: 5 },
    conferenceLeague: { from: 6, to: 6 },
    relegationPlaces: 2,
  },
  [SM_LEAGUE.EREDIVISIE]: {
    championsLeague: { from: 1, to: 2 },
    europaLeague: { from: 3, to: 3 },
    conferenceLeague: { from: 4, to: 4 },
    relegationPlaces: 2,
  },
  // Second tier: promotion path elsewhere; only mark relegation.
  [SM_LEAGUE.CHAMPIONSHIP]: {
    championsLeague: null,
    europaLeague: null,
    conferenceLeague: null,
    relegationPlaces: 3,
  },
};

const ZONES_BY_LEAGUE_NAME: Record<string, StandingZonesConfig> = {
  "Premier League": GLPM_STANDING_ZONES[SM_LEAGUE.PREMIER_LEAGUE]!,
  "Serie A": GLPM_STANDING_ZONES[SM_LEAGUE.SERIE_A]!,
  Bundesliga: GLPM_STANDING_ZONES[SM_LEAGUE.BUNDESLIGA]!,
  Eredivisie: GLPM_STANDING_ZONES[SM_LEAGUE.EREDIVISIE]!,
  Championship: GLPM_STANDING_ZONES[SM_LEAGUE.CHAMPIONSHIP]!,
};

const EMPTY_ZONES: StandingZonesConfig = {
  championsLeague: null,
  europaLeague: null,
  conferenceLeague: null,
  relegationPlaces: 0,
};

export function standingZonesForLeague(opts: {
  competitionId?: number | null;
  leagueName?: string | null;
}): StandingZonesConfig {
  if (opts.competitionId != null && GLPM_STANDING_ZONES[opts.competitionId]) {
    return GLPM_STANDING_ZONES[opts.competitionId]!;
  }
  const name = opts.leagueName?.trim();
  if (name && ZONES_BY_LEAGUE_NAME[name]) {
    return ZONES_BY_LEAGUE_NAME[name]!;
  }
  return EMPTY_ZONES;
}

function inRange(rank: number, range: StandingZoneRange | null): boolean {
  if (!range) return false;
  return rank >= range.from && rank <= range.to;
}

/** Resolve the highlight zone for a standings rank (European before relegation). */
export function standingZoneForRank(
  rank: number,
  teamCount: number,
  zones: StandingZonesConfig
): StandingZoneKind | null {
  if (rank <= 0 || teamCount <= 0) return null;
  if (inRange(rank, zones.championsLeague)) return "champions_league";
  if (inRange(rank, zones.europaLeague)) return "europa_league";
  if (inRange(rank, zones.conferenceLeague)) return "conference_league";
  if (isRelegationRank(rank, teamCount, zones.relegationPlaces)) {
    return "relegation";
  }
  return null;
}

export function relegationPlacesForCompetition(
  competitionId: number | null | undefined
): number {
  return standingZonesForLeague({ competitionId }).relegationPlaces;
}

/** True when this rank sits in the automatic relegation zone. */
export function isRelegationRank(
  rank: number,
  teamCount: number,
  relegationPlaces: number
): boolean {
  if (relegationPlaces <= 0 || teamCount <= 0 || rank <= 0) return false;
  const places = Math.min(relegationPlaces, teamCount);
  return rank > teamCount - places;
}

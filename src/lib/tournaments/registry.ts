/**
 * Tournament product registry - World Cup 2026 and Nations League 2026/27.
 */

export type TournamentSlug = "world-cup-2026" | "nations-league-2026";

export type TournamentFormat =
  | "group_stage_knockout"
  | "league_groups";

export interface TournamentConfig {
  id: TournamentSlug;
  label: string;
  shortLabel: string;
  href: string;
  leagueId: number;
  season: number;
  format: TournamentFormat;
  competitionLabel: string;
  /** Inclusive ISO date bounds for live hub fixtures. */
  leaguePhaseStart: string;
  leaguePhaseEnd: string;
  modelVersion: string;
  features: {
    groupStandings: boolean;
    knockoutProjection: boolean;
    tournamentForecast: boolean;
    modelXi: boolean;
    postMatchLearning: boolean;
    hostNationBoost: boolean;
    altitudeBoost: boolean;
    talentDecay: boolean;
  };
  dataDirs: {
    root: string;
    optaResults: string;
    optaPlayerStats: string;
    squads: string;
    fbrefImport: string;
  };
}

export const TOURNAMENT_REGISTRY: Record<TournamentSlug, TournamentConfig> = {
  "world-cup-2026": {
    id: "world-cup-2026",
    label: "World Cup 2026",
    shortLabel: "World Cup",
    href: "/world-cup",
    leagueId: 1,
    season: 2026,
    format: "group_stage_knockout",
    competitionLabel: "FIFA World Cup 2026",
    leaguePhaseStart: "2026-06-01",
    leaguePhaseEnd: "2026-07-31",
    modelVersion: "wc-graham-v1.1",
    features: {
      groupStandings: true,
      knockoutProjection: true,
      tournamentForecast: true,
      modelXi: true,
      postMatchLearning: true,
      hostNationBoost: true,
      altitudeBoost: true,
      talentDecay: true,
    },
    dataDirs: {
      root: "data/world-cup-2026",
      optaResults: "data/world-cup-2026/WC-Opta-Results",
      optaPlayerStats: "data/world-cup-2026/WC-Opta-Player-Stats",
      squads: "data/world-cup-2026/WC Squads",
      fbrefImport: "data/imports/fbref/world-cup",
    },
  },
  "nations-league-2026": {
    id: "nations-league-2026",
    label: "Nations League 2026/27",
    shortLabel: "Nations League",
    href: "/nations-league",
    leagueId: 5,
    season: 2026,
    format: "league_groups",
    competitionLabel: "UEFA Nations League 2026/27",
    leaguePhaseStart: "2026-09-24",
    leaguePhaseEnd: "2026-11-17",
    modelVersion: "nl-graham-v1.1",
    features: {
      groupStandings: true,
      knockoutProjection: false,
      tournamentForecast: false,
      modelXi: true,
      postMatchLearning: true,
      hostNationBoost: false,
      altitudeBoost: false,
      talentDecay: false,
    },
    dataDirs: {
      root: "data/nations-league-2026",
      optaResults: "data/nations-league-2026/NL-Opta-Results",
      optaPlayerStats: "data/nations-league-2026/NL-Opta-Player-Stats",
      squads: "data/nations-league-2026/NL Squads",
      fbrefImport: "data/imports/fbref/nations-league",
    },
  },
};

export const TOURNAMENT_NAV_ITEMS = (
  Object.values(TOURNAMENT_REGISTRY) as TournamentConfig[]
).map((t) => ({ href: t.href, label: t.label }));

export function getTournamentConfig(id: TournamentSlug): TournamentConfig {
  return TOURNAMENT_REGISTRY[id];
}

export function getTournamentByHref(pathname: string): TournamentConfig | null {
  return (
    (Object.values(TOURNAMENT_REGISTRY) as TournamentConfig[]).find(
      (t) => t.href === pathname
    ) ?? null
  );
}

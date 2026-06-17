import type { CountryOption, EntityType, LeagueOption, SyncTier, TeamOption } from "@/lib/types/football-lookup";
import { enrichTeamsWithLogos } from "@/lib/data/team-logos";
import { getClubHomeCity } from "@/lib/data/team-home-cities";
import { isNationalTeamId } from "@/lib/data/national-team-geography";
import {
  WORLD_CUP_2026_TEAMS,
  WORLD_CUP_REFERENCE_LEAGUE_ID,
} from "@/lib/data/world-cup-2026-teams";

export { WORLD_CUP_REFERENCE_LEAGUE_ID };

export const REFERENCE_SEASON = 2025;

export const FOOTBALL_COUNTRIES: CountryOption[] = [
  { name: "England", code: "GB-ENG" },
  { name: "Spain", code: "ES" },
  { name: "Germany", code: "DE" },
  { name: "Italy", code: "IT" },
  { name: "France", code: "FR" },
  { name: "Netherlands", code: "NL" },
  { name: "USA", code: "US" },
  { name: "Saudi Arabia", code: "SA" },
  { name: "World", code: "WORLD" },
  { name: "International", code: "INT" },
];

export const FOOTBALL_LEAGUES: LeagueOption[] = [
  // Tier 1 — club
  { id: 39, name: "Premier League", country: "England", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 140, name: "La Liga", country: "Spain", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 78, name: "Bundesliga", country: "Germany", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 135, name: "Serie A", country: "Italy", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 61, name: "Ligue 1", country: "France", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 88, name: "Eredivisie", country: "Netherlands", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 2, name: "UEFA Champions League", country: "World", season: REFERENCE_SEASON, type: "Cup", entityType: "club", syncTier: 1 },
  { id: 3, name: "UEFA Europa League", country: "World", season: REFERENCE_SEASON, type: "Cup", entityType: "club", syncTier: 1 },
  // Tier 2 — club
  { id: 40, name: "Championship", country: "England", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 141, name: "Segunda División", country: "Spain", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 79, name: "2. Bundesliga", country: "Germany", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 136, name: "Serie B", country: "Italy", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 62, name: "Ligue 2", country: "France", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 253, name: "MLS", country: "USA", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 307, name: "Saudi Pro League", country: "Saudi Arabia", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  // Tier 3 — club
  { id: 848, name: "UEFA Conference League", country: "World", season: REFERENCE_SEASON, type: "Cup", entityType: "club", syncTier: 3 },
  // International — national teams (tier 2 rotation, weekly for Copa)
  { id: 1, name: "FIFA World Cup", country: "International", season: 2026, type: "Cup", entityType: "national", syncTier: 2 },
  { id: 4, name: "UEFA Euro", country: "International", season: REFERENCE_SEASON, type: "Cup", entityType: "national", syncTier: 2 },
  { id: 5, name: "UEFA Nations League", country: "International", season: REFERENCE_SEASON, type: "Cup", entityType: "national", syncTier: 2 },
  { id: 6, name: "Copa América", country: "International", season: REFERENCE_SEASON, type: "Cup", entityType: "national", syncTier: 3 },
];

const TEAMS_BY_LEAGUE: Record<number, TeamOption[]> = {
  39: [
    { id: 35, name: "Manchester United" },
    { id: 39, name: "Newcastle" },
    { id: 60, name: "Bournemouth" },
    { id: 43, name: "Fulham" },
    { id: 3, name: "Wolves" },
    { id: 44, name: "Liverpool" },
    { id: 42, name: "Arsenal" },
    { id: 6, name: "Burnley" },
    { id: 48, name: "Everton" },
    { id: 33, name: "Tottenham" },
    { id: 37, name: "West Ham" },
    { id: 38, name: "Chelsea" },
    { id: 17, name: "Manchester City" },
    { id: 30, name: "Brighton" },
    { id: 7, name: "Crystal Palace" },
    { id: 50, name: "Brentford" },
    { id: 34, name: "Leeds" },
    { id: 14, name: "Nottingham Forest" },
    { id: 40, name: "Aston Villa" },
    { id: 41, name: "Sunderland" },
  ],
  40: [
    { id: 12, name: "Sheffield Wednesday" },
    { id: 32, name: "Ipswich" },
    { id: 25, name: "Millwall" },
    { id: 21, name: "Preston" },
    { id: 8, name: "West Brom" },
    { id: 15, name: "Sheffield Utd" },
    { id: 46, name: "Blackburn" },
    { id: 36, name: "Middlesbrough" },
    { id: 263, name: "Norwich" },
    { id: 1, name: "QPR" },
  ],
  140: [
    { id: 2817, name: "Barcelona" },
    { id: 2836, name: "Atletico Madrid" },
    { id: 2825, name: "Athletic Club" },
    { id: 2819, name: "Villarreal" },
    { id: 2829, name: "Real Madrid" },
    { id: 24264, name: "Girona" },
    { id: 2824, name: "Real Sociedad" },
  ],
  78: [
    { id: 2672, name: "Bayern Munich" },
    { id: 2673, name: "Borussia Dortmund" },
    { id: 2681, name: "Bayer Leverkusen" },
    { id: 36360, name: "RB Leipzig" },
  ],
  135: [
    { id: 2692, name: "AC Milan" },
    { id: 2714, name: "Napoli" },
    { id: 2687, name: "Juventus" },
    { id: 2702, name: "Roma" },
    { id: 2697, name: "Inter" },
  ],
  61: [
    { id: 1641, name: "Marseille" },
    { id: 1644, name: "Paris Saint Germain" },
    { id: 1653, name: "Monaco" },
  ],
  88: [
    { id: 2952, name: "PSV Eindhoven" },
    { id: 2953, name: "AFC Ajax" },
    { id: 2959, name: "Feyenoord" },
  ],
  2: [
    { id: 35, name: "Manchester United" },
    { id: 44, name: "Liverpool" },
    { id: 42, name: "Arsenal" },
    { id: 38, name: "Chelsea" },
    { id: 17, name: "Manchester City" },
    { id: 2817, name: "Barcelona" },
    { id: 2829, name: "Real Madrid" },
    { id: 2672, name: "Bayern Munich" },
    { id: 2697, name: "Inter" },
    { id: 1644, name: "Paris Saint Germain" },
  ],
  3: [
    { id: 33, name: "Tottenham" },
    { id: 40, name: "Aston Villa" },
    { id: 2692, name: "AC Milan" },
    { id: 2959, name: "Feyenoord" },
  ],
  1: WORLD_CUP_2026_TEAMS,
  5: [
    { id: 4748, name: "Brazil" },
    { id: 4705, name: "Netherlands" },
    { id: 4481, name: "France" },
    { id: 4711, name: "Germany" },
    { id: 4713, name: "England" },
    { id: 4698, name: "Spain" },
  ],
};

export function getNationalTeamCountries(): CountryOption[] {
  return [{ name: "International", code: "INT" }];
}

export function getCountries(entityType?: EntityType): CountryOption[] {
  if (!entityType) return FOOTBALL_COUNTRIES;
  if (entityType === "national") return getNationalTeamCountries();
  const leagueCountries = new Set(
    FOOTBALL_LEAGUES.filter((l) => l.entityType === entityType).map((l) => l.country)
  );
  return FOOTBALL_COUNTRIES.filter((c) => leagueCountries.has(c.name));
}

export function getLeaguesByCountry(country: string, entityType?: EntityType): LeagueOption[] {
  const leagues = FOOTBALL_LEAGUES.filter(
    (league) =>
      league.country === country && (entityType === undefined || league.entityType === entityType)
  );
  if (entityType === "national" && country === "International") {
    return [...leagues].sort((a, b) => {
      if (a.id === WORLD_CUP_REFERENCE_LEAGUE_ID) return -1;
      if (b.id === WORLD_CUP_REFERENCE_LEAGUE_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }
  return leagues;
}

export function getAllLeagues(): LeagueOption[] {
  return FOOTBALL_LEAGUES;
}

export function getLeaguesBySyncTier(tier: SyncTier): LeagueOption[] {
  return FOOTBALL_LEAGUES.filter((l) => l.syncTier === tier);
}

export function getLeagueEntityType(leagueId: number): EntityType {
  return getLeagueById(leagueId)?.entityType ?? "club";
}

export function getTeamsByLeague(leagueId: number): TeamOption[] {
  const teams = TEAMS_BY_LEAGUE[leagueId] ?? [];
  const entityType = getLeagueEntityType(leagueId);
  return enrichTeamsWithLogos(teams, entityType);
}

export function getLeagueById(leagueId: number): LeagueOption | undefined {
  return FOOTBALL_LEAGUES.find((league) => league.id === leagueId);
}

export function getTeamCity(
  teamId: number,
  options?: { teamName?: string; entityType?: EntityType }
): string {
  if (options?.entityType === "national" || isNationalTeamId(teamId)) {
    return getClubHomeCity(teamId, options?.teamName);
  }
  return getClubHomeCity(teamId, options?.teamName);
}

/** Domestic league id for a club team, when registered in reference data. */
export function resolveDomesticLeagueId(teamId: number): number | undefined {
  for (const league of FOOTBALL_LEAGUES) {
    if (league.type !== "League" || league.entityType !== "club") continue;
    const teams = TEAMS_BY_LEAGUE[league.id] ?? [];
    if (teams.some((t) => t.id === teamId)) return league.id;
  }
  return undefined;
}

export function getTeamName(teamId: number, leagueId?: number): string | undefined {
  if (leagueId !== undefined) {
    const team = getTeamsByLeague(leagueId).find((t) => t.id === teamId);
    return team?.name;
  }
  for (const teams of Object.values(TEAMS_BY_LEAGUE)) {
    const team = teams.find((t) => t.id === teamId);
    if (team) return team.name;
  }
  return undefined;
}

/** True when the name matches a club in our reference data (not a national side). */
export function isKnownClubTeamName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  for (const league of FOOTBALL_LEAGUES) {
    if (league.entityType !== "club") continue;
    const teams = TEAMS_BY_LEAGUE[league.id] ?? [];
    if (teams.some((t) => t.name.toLowerCase() === lower)) return true;
  }
  return false;
}

export function getAllSyncLeagueIds(): number[] {
  return FOOTBALL_LEAGUES.map((l) => l.id);
}

export {
  getLeagueStrengthMultiplier,
  PREMIER_LEAGUE_ID,
} from "@/lib/prediction/league-benchmark";

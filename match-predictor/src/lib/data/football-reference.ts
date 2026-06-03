import type { CountryOption, EntityType, LeagueOption, SyncTier, TeamOption } from "@/lib/types/football-lookup";
import { enrichTeamsWithLogos } from "@/lib/data/team-logos";
import { getClubHomeCity } from "@/lib/data/team-home-cities";
import { isNationalTeamId } from "@/lib/data/national-team-geography";
import { WORLD_CUP_2026_TEAMS } from "@/lib/data/world-cup-2026-teams";

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
    { id: 33, name: "Manchester United" },
    { id: 34, name: "Newcastle" },
    { id: 35, name: "Bournemouth" },
    { id: 36, name: "Fulham" },
    { id: 39, name: "Wolves" },
    { id: 40, name: "Liverpool" },
    { id: 42, name: "Arsenal" },
    { id: 44, name: "Burnley" },
    { id: 45, name: "Everton" },
    { id: 47, name: "Tottenham" },
    { id: 48, name: "West Ham" },
    { id: 49, name: "Chelsea" },
    { id: 50, name: "Manchester City" },
    { id: 51, name: "Brighton" },
    { id: 52, name: "Crystal Palace" },
    { id: 55, name: "Brentford" },
    { id: 63, name: "Leeds" },
    { id: 65, name: "Nottingham Forest" },
    { id: 66, name: "Aston Villa" },
    { id: 746, name: "Sunderland" },
  ],
  40: [
    { id: 56, name: "Sheffield Wednesday" },
    { id: 57, name: "Ipswich" },
    { id: 58, name: "Millwall" },
    { id: 59, name: "Preston" },
    { id: 60, name: "West Brom" },
    { id: 62, name: "Sheffield Utd" },
    { id: 67, name: "Blackburn" },
    { id: 70, name: "Middlesbrough" },
    { id: 71, name: "Norwich" },
    { id: 72, name: "QPR" },
  ],
  140: [
    { id: 529, name: "Barcelona" },
    { id: 530, name: "Atletico Madrid" },
    { id: 531, name: "Athletic Club" },
    { id: 533, name: "Villarreal" },
    { id: 541, name: "Real Madrid" },
    { id: 547, name: "Girona" },
    { id: 548, name: "Real Sociedad" },
  ],
  78: [
    { id: 157, name: "Bayern Munich" },
    { id: 165, name: "Borussia Dortmund" },
    { id: 168, name: "Bayer Leverkusen" },
    { id: 173, name: "RB Leipzig" },
  ],
  135: [
    { id: 489, name: "AC Milan" },
    { id: 492, name: "Napoli" },
    { id: 496, name: "Juventus" },
    { id: 497, name: "Roma" },
    { id: 505, name: "Inter" },
  ],
  61: [
    { id: 81, name: "Marseille" },
    { id: 85, name: "Paris Saint Germain" },
    { id: 91, name: "Monaco" },
  ],
  88: [
    { id: 2952, name: "PSV Eindhoven" },
    { id: 2953, name: "AFC Ajax" },
    { id: 2959, name: "Feyenoord" },
  ],
  2: [
    { id: 33, name: "Manchester United" },
    { id: 40, name: "Liverpool" },
    { id: 42, name: "Arsenal" },
    { id: 49, name: "Chelsea" },
    { id: 50, name: "Manchester City" },
    { id: 529, name: "Barcelona" },
    { id: 541, name: "Real Madrid" },
    { id: 157, name: "Bayern Munich" },
    { id: 505, name: "Inter" },
    { id: 85, name: "Paris Saint Germain" },
  ],
  3: [
    { id: 47, name: "Tottenham" },
    { id: 66, name: "Aston Villa" },
    { id: 489, name: "AC Milan" },
    { id: 2959, name: "Feyenoord" },
  ],
  1: WORLD_CUP_2026_TEAMS,
  5: [
    { id: 4748, name: "Brazil" },
    { id: 4705, name: "Netherlands" },
    { id: 4481, name: "France" },
    { id: 4706, name: "Germany" },
    { id: 4713, name: "England" },
    { id: 4711, name: "Spain" },
  ],
};

export function getNationalTeamCountries(): CountryOption[] {
  const fromTeams = WORLD_CUP_2026_TEAMS.map((team) => ({
    name: team.name,
    code: team.name.slice(0, 3).toUpperCase(),
  }));
  return [{ name: "International", code: "INT" }, ...fromTeams];
}

export function isNationalTeamCountry(country: string): boolean {
  if (country === "International") return false;
  return WORLD_CUP_2026_TEAMS.some(
    (t) => t.name.toLowerCase() === country.trim().toLowerCase()
  );
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
  if (entityType === "national" && isNationalTeamCountry(country)) {
    return FOOTBALL_LEAGUES.filter((league) => league.entityType === "national");
  }
  return FOOTBALL_LEAGUES.filter(
    (league) =>
      league.country === country && (entityType === undefined || league.entityType === entityType)
  );
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

import type { CountryOption, EntityType, LeagueOption, SyncTier, TeamOption } from "@/lib/types/football-lookup";

export const REFERENCE_SEASON = 2025;

export const FOOTBALL_COUNTRIES: CountryOption[] = [
  { name: "England", code: "GB-ENG" },
  { name: "Spain", code: "ES" },
  { name: "Germany", code: "DE" },
  { name: "Italy", code: "IT" },
  { name: "France", code: "FR" },
  { name: "Netherlands", code: "NL" },
  { name: "Portugal", code: "PT" },
  { name: "Belgium", code: "BE" },
  { name: "Scotland", code: "GB-SCT" },
  { name: "Turkey", code: "TR" },
  { name: "Greece", code: "GR" },
  { name: "Austria", code: "AT" },
  { name: "Switzerland", code: "CH" },
  { name: "Denmark", code: "DK" },
  { name: "Norway", code: "NO" },
  { name: "Sweden", code: "SE" },
  { name: "USA", code: "US" },
  { name: "Mexico", code: "MX" },
  { name: "Brazil", code: "BR" },
  { name: "Argentina", code: "AR" },
  { name: "Saudi Arabia", code: "SA" },
  { name: "Japan", code: "JP" },
  { name: "South Korea", code: "KR" },
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
  { id: 94, name: "Primeira Liga", country: "Portugal", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 1 },
  { id: 2, name: "UEFA Champions League", country: "World", season: REFERENCE_SEASON, type: "Cup", entityType: "club", syncTier: 1 },
  { id: 3, name: "UEFA Europa League", country: "World", season: REFERENCE_SEASON, type: "Cup", entityType: "club", syncTier: 1 },
  // Tier 2 — club
  { id: 40, name: "Championship", country: "England", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 141, name: "Segunda División", country: "Spain", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 79, name: "2. Bundesliga", country: "Germany", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 136, name: "Serie B", country: "Italy", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 62, name: "Ligue 2", country: "France", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 144, name: "Pro League", country: "Belgium", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 179, name: "Premiership", country: "Scotland", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 203, name: "Süper Lig", country: "Turkey", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 253, name: "MLS", country: "USA", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 71, name: "Brasileirão Série A", country: "Brazil", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 128, name: "Liga Profesional", country: "Argentina", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  { id: 307, name: "Saudi Pro League", country: "Saudi Arabia", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 2 },
  // Tier 3 — club
  { id: 197, name: "Super League", country: "Greece", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 218, name: "Bundesliga", country: "Austria", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 207, name: "Super League", country: "Switzerland", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 119, name: "Superliga", country: "Denmark", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 103, name: "Eliteserien", country: "Norway", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 113, name: "Allsvenskan", country: "Sweden", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 262, name: "Liga MX", country: "Mexico", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 98, name: "J1 League", country: "Japan", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 292, name: "K League 1", country: "South Korea", season: REFERENCE_SEASON, type: "League", entityType: "club", syncTier: 3 },
  { id: 848, name: "UEFA Conference League", country: "World", season: REFERENCE_SEASON, type: "Cup", entityType: "club", syncTier: 3 },
  // International — national teams (tier 2 rotation, weekly for Copa)
  { id: 1, name: "FIFA World Cup", country: "International", season: REFERENCE_SEASON, type: "Cup", entityType: "national", syncTier: 2 },
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
    { id: 193, name: "PSV Eindhoven" },
    { id: 194, name: "Ajax" },
    { id: 195, name: "Feyenoord" },
  ],
  94: [
    { id: 211, name: "Benfica" },
    { id: 212, name: "FC Porto" },
    { id: 213, name: "Sporting CP" },
  ],
  71: [
    { id: 5981, name: "Flamengo" },
    { id: 5982, name: "Palmeiras" },
    { id: 5983, name: "Corinthians" },
    { id: 5984, name: "São Paulo" },
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
    { id: 195, name: "Feyenoord" },
  ],
  1: [
    { id: 4748, name: "Brazil" },
    { id: 4710, name: "Netherlands" },
    { id: 4705, name: "France" },
    { id: 4706, name: "Germany" },
    { id: 4707, name: "Argentina" },
    { id: 4713, name: "England" },
    { id: 4711, name: "Spain" },
    { id: 4712, name: "Portugal" },
    { id: 4714, name: "Belgium" },
    { id: 4715, name: "Croatia" },
    { id: 4716, name: "Japan" },
    { id: 4717, name: "USA" },
  ],
  5: [
    { id: 4748, name: "Brazil" },
    { id: 4710, name: "Netherlands" },
    { id: 4705, name: "France" },
    { id: 4706, name: "Germany" },
    { id: 4713, name: "England" },
    { id: 4711, name: "Spain" },
  ],
};

const TEAM_CITIES: Record<number, string> = {
  33: "Manchester",
  40: "Liverpool",
  42: "London",
  47: "London",
  49: "London",
  50: "Manchester",
  51: "Brighton",
  529: "Barcelona",
  530: "Madrid",
  541: "Madrid",
  157: "Munich",
  165: "Dortmund",
  496: "Turin",
  505: "Milan",
  85: "Paris",
  194: "Amsterdam",
  211: "Lisbon",
  5981: "Rio de Janeiro",
};

export function getCountries(entityType?: EntityType): CountryOption[] {
  if (!entityType) return FOOTBALL_COUNTRIES;
  const leagueCountries = new Set(
    FOOTBALL_LEAGUES.filter((l) => l.entityType === entityType).map((l) => l.country)
  );
  return FOOTBALL_COUNTRIES.filter((c) => leagueCountries.has(c.name));
}

export function getLeaguesByCountry(country: string, entityType?: EntityType): LeagueOption[] {
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
  return TEAMS_BY_LEAGUE[leagueId] ?? [];
}

export function getLeagueById(leagueId: number): LeagueOption | undefined {
  return FOOTBALL_LEAGUES.find((league) => league.id === leagueId);
}

export function getTeamCity(teamId: number): string {
  return TEAM_CITIES[teamId] ?? "London";
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

export function getLeagueStrengthMultiplier(leagueId: number): number {
  return LEAGUE_STRENGTH[leagueId] ?? 0.8;
}

/** Heuristic league strength for cross-league xG normalization (1.0 = top tier). */
const LEAGUE_STRENGTH: Record<number, number> = {
  39: 1.0,
  140: 0.98,
  78: 0.96,
  135: 0.95,
  61: 0.93,
  88: 0.85,
  94: 0.84,
  2: 1.0,
  3: 0.92,
  40: 0.78,
  141: 0.72,
  79: 0.7,
  136: 0.68,
  62: 0.65,
  144: 0.75,
  179: 0.7,
  203: 0.74,
  253: 0.72,
  71: 0.8,
  128: 0.78,
  307: 0.76,
  197: 0.68,
  218: 0.66,
  207: 0.67,
  119: 0.65,
  103: 0.64,
  113: 0.63,
  262: 0.7,
  98: 0.68,
  292: 0.66,
  848: 0.88,
  1: 1.0,
  4: 1.0,
  5: 0.95,
  6: 0.95,
};

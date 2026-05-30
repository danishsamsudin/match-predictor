import type { CountryOption, LeagueOption, TeamOption } from "@/lib/types/football-lookup";

export const REFERENCE_SEASON = 2025;

export const FOOTBALL_COUNTRIES: CountryOption[] = [
  { name: "England", code: "GB-ENG" },
  { name: "Spain", code: "ES" },
  { name: "Germany", code: "DE" },
  { name: "Italy", code: "IT" },
  { name: "France", code: "FR" },
  { name: "Netherlands", code: "NL" },
  { name: "Portugal", code: "PT" },
  { name: "World", code: "WORLD" },
];

export const FOOTBALL_LEAGUES: LeagueOption[] = [
  { id: 39, name: "Premier League", country: "England", season: REFERENCE_SEASON, type: "League" },
  { id: 40, name: "Championship", country: "England", season: REFERENCE_SEASON, type: "League" },
  { id: 140, name: "La Liga", country: "Spain", season: REFERENCE_SEASON, type: "League" },
  { id: 78, name: "Bundesliga", country: "Germany", season: REFERENCE_SEASON, type: "League" },
  { id: 135, name: "Serie A", country: "Italy", season: REFERENCE_SEASON, type: "League" },
  { id: 61, name: "Ligue 1", country: "France", season: REFERENCE_SEASON, type: "League" },
  { id: 88, name: "Eredivisie", country: "Netherlands", season: REFERENCE_SEASON, type: "League" },
  { id: 94, name: "Primeira Liga", country: "Portugal", season: REFERENCE_SEASON, type: "League" },
  { id: 2, name: "UEFA Champions League", country: "World", season: REFERENCE_SEASON, type: "Cup" },
  { id: 3, name: "UEFA Europa League", country: "World", season: REFERENCE_SEASON, type: "Cup" },
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
    { id: 74, name: "Sheffield Wednesday" },
    { id: 75, name: "Stoke City" },
    { id: 76, name: "Swansea" },
    { id: 1335, name: "Charlton" },
    { id: 1338, name: "Oxford United" },
    { id: 1346, name: "Coventry" },
    { id: 1359, name: "Luton" },
  ],
  140: [
    { id: 529, name: "Barcelona" },
    { id: 530, name: "Atletico Madrid" },
    { id: 531, name: "Athletic Club" },
    { id: 532, name: "Valencia" },
    { id: 533, name: "Villarreal" },
    { id: 536, name: "Sevilla" },
    { id: 538, name: "Celta Vigo" },
    { id: 541, name: "Real Madrid" },
    { id: 542, name: "Alaves" },
    { id: 543, name: "Real Betis" },
    { id: 546, name: "Getafe" },
    { id: 547, name: "Girona" },
    { id: 548, name: "Real Sociedad" },
    { id: 727, name: "Osasuna" },
    { id: 728, name: "Rayo Vallecano" },
    { id: 798, name: "Mallorca" },
    { id: 720, name: "Valladolid" },
    { id: 718, name: "Oviedo" },
  ],
  78: [
    { id: 157, name: "Bayern Munich" },
    { id: 160, name: "Freiburg" },
    { id: 161, name: "VfL Wolfsburg" },
    { id: 162, name: "Werder Bremen" },
    { id: 163, name: "Borussia Mönchengladbach" },
    { id: 164, name: "Mainz 05" },
    { id: 165, name: "Borussia Dortmund" },
    { id: 167, name: "Hoffenheim" },
    { id: 168, name: "Bayer Leverkusen" },
    { id: 169, name: "Eintracht Frankfurt" },
    { id: 170, name: "FC Augsburg" },
    { id: 172, name: "VfB Stuttgart" },
    { id: 173, name: "RB Leipzig" },
    { id: 182, name: "Union Berlin" },
    { id: 192, name: "FC Köln" },
    { id: 186, name: "St. Pauli" },
    { id: 176, name: "Bochum" },
    { id: 180, name: "Heidenheim" },
  ],
  135: [
    { id: 487, name: "Lazio" },
    { id: 489, name: "AC Milan" },
    { id: 490, name: "Cagliari" },
    { id: 492, name: "Napoli" },
    { id: 494, name: "Udinese" },
    { id: 495, name: "Genoa" },
    { id: 496, name: "Juventus" },
    { id: 497, name: "Roma" },
    { id: 499, name: "Atalanta" },
    { id: 500, name: "Bologna" },
    { id: 502, name: "Fiorentina" },
    { id: 503, name: "Torino" },
    { id: 504, name: "Verona" },
    { id: 505, name: "Inter" },
    { id: 520, name: "Cremonese" },
    { id: 867, name: "Lecce" },
    { id: 895, name: "Como" },
    { id: 801, name: "Pisa" },
  ],
  61: [
    { id: 77, name: "Angers" },
    { id: 79, name: "Lille" },
    { id: 80, name: "Lyon" },
    { id: 81, name: "Marseille" },
    { id: 82, name: "Montpellier" },
    { id: 83, name: "Nantes" },
    { id: 84, name: "Nice" },
    { id: 85, name: "Paris Saint Germain" },
    { id: 91, name: "Monaco" },
    { id: 94, name: "Rennes" },
    { id: 95, name: "Strasbourg" },
    { id: 96, name: "Toulouse" },
    { id: 106, name: "Brest" },
    { id: 108, name: "Auxerre" },
    { id: 111, name: "Le Havre" },
    { id: 114, name: "Paris FC" },
    { id: 116, name: "Lens" },
    { id: 133, name: "Lorient" },
  ],
  88: [
    { id: 193, name: "PSV Eindhoven" },
    { id: 194, name: "Ajax" },
    { id: 195, name: "Feyenoord" },
    { id: 196, name: "Twente" },
    { id: 197, name: "Utrecht" },
    { id: 198, name: "Groningen" },
    { id: 199, name: "Heerenveen" },
    { id: 200, name: "Vitesse" },
    { id: 201, name: "AZ Alkmaar" },
    { id: 202, name: "NAC Breda" },
    { id: 203, name: "NEC Nijmegen" },
    { id: 205, name: "Fortuna Sittard" },
    { id: 206, name: "Heracles" },
    { id: 207, name: "Sparta Rotterdam" },
    { id: 209, name: "Excelsior" },
    { id: 210, name: "Volendam" },
    { id: 410, name: "Go Ahead Eagles" },
    { id: 413, name: "Telstar" },
  ],
  94: [
    { id: 211, name: "Benfica" },
    { id: 212, name: "FC Porto" },
    { id: 213, name: "Sporting CP" },
    { id: 214, name: "Braga" },
    { id: 215, name: "Moreirense" },
    { id: 217, name: "SC Braga" },
    { id: 218, name: "Tondela" },
    { id: 224, name: "Guimaraes" },
    { id: 225, name: "Nacional" },
    { id: 226, name: "Rio Ave" },
    { id: 227, name: "Santa Clara" },
    { id: 228, name: "Sporting CP" },
    { id: 230, name: "Estoril" },
    { id: 4716, name: "Farense" },
    { id: 762, name: "Arouca" },
    { id: 810, name: "Vizela" },
    { id: 15130, name: "Estrela" },
    { id: 242, name: "Famalicao" },
  ],
  2: [
    { id: 33, name: "Manchester United" },
    { id: 40, name: "Liverpool" },
    { id: 42, name: "Arsenal" },
    { id: 49, name: "Chelsea" },
    { id: 50, name: "Manchester City" },
    { id: 529, name: "Barcelona" },
    { id: 530, name: "Atletico Madrid" },
    { id: 541, name: "Real Madrid" },
    { id: 157, name: "Bayern Munich" },
    { id: 165, name: "Borussia Dortmund" },
    { id: 496, name: "Juventus" },
    { id: 505, name: "Inter" },
    { id: 85, name: "Paris Saint Germain" },
    { id: 194, name: "Ajax" },
    { id: 211, name: "Benfica" },
  ],
  3: [
    { id: 47, name: "Tottenham" },
    { id: 66, name: "Aston Villa" },
    { id: 533, name: "Villarreal" },
    { id: 543, name: "Real Betis" },
    { id: 168, name: "Bayer Leverkusen" },
    { id: 489, name: "AC Milan" },
    { id: 497, name: "Roma" },
    { id: 91, name: "Monaco" },
    { id: 195, name: "Feyenoord" },
    { id: 212, name: "FC Porto" },
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
};

export function getCountries(): CountryOption[] {
  return FOOTBALL_COUNTRIES;
}

export function getLeaguesByCountry(country: string): LeagueOption[] {
  return FOOTBALL_LEAGUES.filter((league) => league.country === country);
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
  if (leagueId) {
    const team = getTeamsByLeague(leagueId).find((t) => t.id === teamId);
    if (team) return team.name;
  }
  for (const teams of Object.values(TEAMS_BY_LEAGUE)) {
    const team = teams.find((t) => t.id === teamId);
    if (team) return team.name;
  }
  return undefined;
}

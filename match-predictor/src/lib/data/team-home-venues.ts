/**
 * Canonical home stadiums keyed by Sofascore / SportAPI team id (same ids as synced_teams).
 * Used for team comparison and stadium impact when event payloads have wrong or missing venues.
 */
export interface TeamHomeVenue {
  name: string;
  capacity: number;
  city: string;
}

/** Normalized team name → venue (fallback when id differs between data sources). */
const VENUE_BY_NORMALIZED_NAME: Record<string, TeamHomeVenue> = {
  ajax: { name: "Johan Cruyff Arena", capacity: 55865, city: "Amsterdam" },
  "afc ajax": { name: "Johan Cruyff Arena", capacity: 55865, city: "Amsterdam" },
  "tottenham hotspur": { name: "Tottenham Hotspur Stadium", capacity: 62850, city: "London" },
  tottenham: { name: "Tottenham Hotspur Stadium", capacity: 62850, city: "London" },
  "manchester united": { name: "Old Trafford", capacity: 74310, city: "Manchester" },
  "manchester city": { name: "Etihad Stadium", capacity: 53400, city: "Manchester" },
  liverpool: { name: "Anfield", capacity: 61276, city: "Liverpool" },
  arsenal: { name: "Emirates Stadium", capacity: 60704, city: "London" },
  chelsea: { name: "Stamford Bridge", capacity: 40341, city: "London" },
  "west ham": { name: "London Stadium", capacity: 62500, city: "London" },
  "west ham united": { name: "London Stadium", capacity: 62500, city: "London" },
  "crystal palace": { name: "Selhurst Park", capacity: 25486, city: "London" },
  brighton: { name: "American Express Stadium", capacity: 31872, city: "Brighton" },
  "brighton & hove albion": { name: "American Express Stadium", capacity: 31872, city: "Brighton" },
  brentford: { name: "Gtech Community Stadium", capacity: 17250, city: "London" },
  everton: { name: "Hill Dickinson Stadium", capacity: 52888, city: "Liverpool" },
  fulham: { name: "Craven Cottage", capacity: 19359, city: "London" },
  bournemouth: { name: "Vitality Stadium", capacity: 11307, city: "Bournemouth" },
  wolves: { name: "Molineux Stadium", capacity: 31700, city: "Wolverhampton" },
  "wolverhampton wanderers": { name: "Molineux Stadium", capacity: 31700, city: "Wolverhampton" },
  burnley: { name: "Turf Moor", capacity: 21944, city: "Burnley" },
  "aston villa": { name: "Villa Park", capacity: 42640, city: "Birmingham" },
  "nottingham forest": { name: "The City Ground", capacity: 30445, city: "Nottingham" },
  newcastle: { name: "St James' Park", capacity: 52305, city: "Newcastle" },
  "newcastle united": { name: "St James' Park", capacity: 52305, city: "Newcastle" },
  leeds: { name: "Elland Road", capacity: 37792, city: "Leeds" },
  "leeds united": { name: "Elland Road", capacity: 37792, city: "Leeds" },
  sunderland: { name: "Stadium of Light", capacity: 49000, city: "Sunderland" },
  barcelona: { name: "Spotify Camp Nou", capacity: 99354, city: "Barcelona" },
  "atletico madrid": { name: "Riyadh Air Metropolitano", capacity: 70460, city: "Madrid" },
  "athletic club": { name: "San Mamés", capacity: 53289, city: "Bilbao" },
  "real madrid": { name: "Santiago Bernabéu", capacity: 83186, city: "Madrid" },
  villarreal: { name: "Estadio de la Cerámica", capacity: 23500, city: "Villarreal" },
  girona: { name: "Estadi Montilivi", capacity: 14100, city: "Girona" },
  "real sociedad": { name: "Reale Arena", capacity: 39500, city: "San Sebastián" },
  "bayern munich": { name: "Allianz Arena", capacity: 75024, city: "Munich" },
  "borussia dortmund": { name: "Signal Iduna Park", capacity: 81365, city: "Dortmund" },
  "bayer leverkusen": { name: "BayArena", capacity: 30210, city: "Leverkusen" },
  "rb leipzig": { name: "Red Bull Arena", capacity: 47069, city: "Leipzig" },
  "ac milan": { name: "San Siro", capacity: 75817, city: "Milan" },
  inter: { name: "San Siro", capacity: 75817, city: "Milan" },
  juventus: { name: "Allianz Stadium", capacity: 41507, city: "Turin" },
  napoli: { name: "Stadio Diego Armando Maradona", capacity: 54726, city: "Naples" },
  roma: { name: "Stadio Olimpico", capacity: 70634, city: "Rome" },
  marseille: { name: "Orange Vélodrome", capacity: 67394, city: "Marseille" },
  "paris saint germain": { name: "Parc des Princes", capacity: 47929, city: "Paris" },
  psg: { name: "Parc des Princes", capacity: 47929, city: "Paris" },
  monaco: { name: "Stade Louis II", capacity: 16360, city: "Monaco" },
  "psv eindhoven": { name: "Philips Stadion", capacity: 35000, city: "Eindhoven" },
  feyenoord: { name: "De Kuip", capacity: 51577, city: "Rotterdam" },
  england: { name: "Wembley Stadium", capacity: 90000, city: "London" },
  germany: { name: "Olympiastadion Berlin", capacity: 74475, city: "Berlin" },
  spain: { name: "Santiago Bernabéu", capacity: 83186, city: "Madrid" },
  france: { name: "Stade de France", capacity: 80698, city: "Paris" },
  brazil: { name: "Maracanã", capacity: 78838, city: "Rio de Janeiro" },
  netherlands: { name: "Johan Cruyff Arena", capacity: 54949, city: "Amsterdam" },
  argentina: { name: "Estadio Monumental", capacity: 83214, city: "Buenos Aires" },
  portugal: { name: "Estádio da Luz", capacity: 64642, city: "Lisbon" },
  belgium: { name: "King Baudouin Stadium", capacity: 50093, city: "Brussels" },
  croatia: { name: "Stadion Maksimir", capacity: 35123, city: "Zagreb" },
  usa: { name: "AT&T Stadium", capacity: 80000, city: "Washington" },
  japan: { name: "National Stadium", capacity: 68000, city: "Tokyo" },
};

const VENUE_BY_TEAM_ID: Record<number, TeamHomeVenue> = {
  // Premier League
  33: { name: "Old Trafford", capacity: 74310, city: "Manchester" },
  34: { name: "St James' Park", capacity: 52305, city: "Newcastle" },
  35: { name: "Vitality Stadium", capacity: 11307, city: "Bournemouth" },
  36: { name: "Craven Cottage", capacity: 19359, city: "London" },
  39: { name: "Molineux Stadium", capacity: 31700, city: "Wolverhampton" },
  40: { name: "Anfield", capacity: 61276, city: "Liverpool" },
  42: { name: "Emirates Stadium", capacity: 60704, city: "London" },
  44: { name: "Turf Moor", capacity: 21944, city: "Burnley" },
  45: { name: "Hill Dickinson Stadium", capacity: 52888, city: "Liverpool" },
  47: { name: "Tottenham Hotspur Stadium", capacity: 62850, city: "London" },
  48: { name: "London Stadium", capacity: 62500, city: "London" },
  49: { name: "Stamford Bridge", capacity: 40341, city: "London" },
  50: { name: "Etihad Stadium", capacity: 53400, city: "Manchester" },
  51: { name: "American Express Stadium", capacity: 31872, city: "Brighton" },
  52: { name: "Selhurst Park", capacity: 25486, city: "London" },
  55: { name: "Gtech Community Stadium", capacity: 17250, city: "London" },
  63: { name: "Elland Road", capacity: 37792, city: "Leeds" },
  65: { name: "The City Ground", capacity: 30445, city: "Nottingham" },
  66: { name: "Villa Park", capacity: 42640, city: "Birmingham" },
  746: { name: "Stadium of Light", capacity: 49000, city: "Sunderland" },
  // Championship
  56: { name: "Hillsborough", capacity: 39812, city: "Sheffield" },
  57: { name: "Portman Road", capacity: 30311, city: "Ipswich" },
  58: { name: "The Den", capacity: 20146, city: "London" },
  59: { name: "Deepdale", capacity: 23408, city: "Preston" },
  60: { name: "The Hawthorns", capacity: 26688, city: "West Bromwich" },
  62: { name: "Bramall Lane", capacity: 32702, city: "Sheffield" },
  67: { name: "Ewood Park", capacity: 31367, city: "Blackburn" },
  70: { name: "Riverside Stadium", capacity: 34742, city: "Middlesbrough" },
  71: { name: "Carrow Road", capacity: 27244, city: "Norwich" },
  72: { name: "Loftus Road", capacity: 18439, city: "London" },
  // La Liga
  529: { name: "Spotify Camp Nou", capacity: 99354, city: "Barcelona" },
  530: { name: "Riyadh Air Metropolitano", capacity: 70460, city: "Madrid" },
  531: { name: "San Mamés", capacity: 53289, city: "Bilbao" },
  533: { name: "Estadio de la Cerámica", capacity: 23500, city: "Villarreal" },
  541: { name: "Santiago Bernabéu", capacity: 83186, city: "Madrid" },
  547: { name: "Estadi Montilivi", capacity: 14100, city: "Girona" },
  548: { name: "Reale Arena", capacity: 39500, city: "San Sebastián" },
  // Bundesliga
  157: { name: "Allianz Arena", capacity: 75024, city: "Munich" },
  165: { name: "Signal Iduna Park", capacity: 81365, city: "Dortmund" },
  168: { name: "BayArena", capacity: 30210, city: "Leverkusen" },
  173: { name: "Red Bull Arena", capacity: 47069, city: "Leipzig" },
  // Serie A
  489: { name: "San Siro", capacity: 75817, city: "Milan" },
  492: { name: "Stadio Diego Armando Maradona", capacity: 54726, city: "Naples" },
  496: { name: "Allianz Stadium", capacity: 41507, city: "Turin" },
  497: { name: "Stadio Olimpico", capacity: 70634, city: "Rome" },
  505: { name: "San Siro", capacity: 75817, city: "Milan" },
  // Ligue 1
  81: { name: "Orange Vélodrome", capacity: 67394, city: "Marseille" },
  85: { name: "Parc des Princes", capacity: 47929, city: "Paris" },
  91: { name: "Stade Louis II", capacity: 16360, city: "Monaco" },
  // Eredivisie (Sofascore / SportAPI team ids)
  2952: { name: "Philips Stadion", capacity: 35000, city: "Eindhoven" },
  2953: { name: "Johan Cruyff Arena", capacity: 55865, city: "Amsterdam" },
  2959: { name: "De Kuip", capacity: 51577, city: "Rotterdam" },
  // FIFA World Cup 2026 (primary home venues)
  4691: { name: "Stade du 5 Juillet", capacity: 80200, city: "Algiers" },
  4819: { name: "Estadio Monumental", capacity: 83214, city: "Buenos Aires" },
  4741: { name: "Accor Stadium", capacity: 83500, city: "Sydney" },
  4718: { name: "Ernst-Happel-Stadion", capacity: 48000, city: "Vienna" },
  4717: { name: "King Baudouin Stadium", capacity: 50093, city: "Brussels" },
  4479: { name: "Bilino Polje", capacity: 15200, city: "Sarajevo" },
  4748: { name: "Maracanã", capacity: 78838, city: "Rio de Janeiro" },
  4753: { name: "Estádio Nacional de Cabo Verde", capacity: 15000, city: "Praia" },
  4752: { name: "BMO Field", capacity: 30000, city: "Toronto" },
  4820: { name: "Estadio Metropolitano Roberto Meléndez", capacity: 46783, city: "Bogotá" },
  4768: { name: "Stade Félix Houphouët-Boigny", capacity: 45000, city: "Abidjan" },
  4715: { name: "Stadion Maksimir", capacity: 35123, city: "Zagreb" },
  55827: { name: "Ergilio Hato Stadium", capacity: 10000, city: "Willemstad" },
  4714: { name: "Fortuna Arena", capacity: 21000, city: "Prague" },
  4823: { name: "Stade des Martyrs", capacity: 80000, city: "Kinshasa" },
  4757: { name: "Estadio Rodrigo Paz Delgado", capacity: 45323, city: "Quito" },
  4758: { name: "Cairo International Stadium", capacity: 75000, city: "Cairo" },
  4713: { name: "Wembley Stadium", capacity: 90000, city: "London" },
  4481: { name: "Stade de France", capacity: 80698, city: "Paris" },
  4711: { name: "Olympiastadion Berlin", capacity: 74475, city: "Berlin" },
  4764: { name: "Baba Yara Stadium", capacity: 40000, city: "Accra" },
  7229: { name: "Stade Sylvio Cator", capacity: 12000, city: "Port-au-Prince" },
  4766: { name: "Azadi Stadium", capacity: 78116, city: "Tehran" },
  4767: { name: "Basra International Stadium", capacity: 65000, city: "Baghdad" },
  4770: { name: "National Stadium", capacity: 68000, city: "Tokyo" },
  4771: { name: "Amman International Stadium", capacity: 17000, city: "Amman" },
  4781: { name: "Estadio Azteca", capacity: 87523, city: "Mexico City" },
  4778: { name: "Stade Mohammed V", capacity: 45800, city: "Rabat" },
  4705: { name: "Johan Cruyff Arena", capacity: 54949, city: "Amsterdam" },
  4784: { name: "Wellington Regional Stadium", capacity: 34500, city: "Wellington" },
  4475: { name: "Ullevaal Stadion", capacity: 25500, city: "Oslo" },
  5164: { name: "Estadio Rommel Fernández", capacity: 45000, city: "Panama City" },
  4789: { name: "Estadio Defensores del Chaco", capacity: 42354, city: "Asunción" },
  4704: { name: "Estádio da Luz", capacity: 64642, city: "Lisbon" },
  4792: { name: "Lusail Stadium", capacity: 88966, city: "Doha" },
  4834: { name: "King Abdullah Sports City", capacity: 62000, city: "Riyadh" },
  4695: { name: "Hampden Park", capacity: 51866, city: "Edinburgh" },
  4739: { name: "Stade Léopold Sédar Senghor", capacity: 60000, city: "Dakar" },
  4736: { name: "FNB Stadium", capacity: 94736, city: "Johannesburg" },
  4735: { name: "Seoul World Cup Stadium", capacity: 66704, city: "Seoul" },
  4698: { name: "Santiago Bernabéu", capacity: 83186, city: "Madrid" },
  4688: { name: "Friends Arena", capacity: 50000, city: "Stockholm" },
  4699: { name: "Stade de Genève", capacity: 30084, city: "Bern" },
  4729: { name: "Stade Olympique de Radès", capacity: 60000, city: "Tunis" },
  4700: { name: "Rams Park", capacity: 52695, city: "Istanbul" },
  4725: { name: "Estadio Centenario", capacity: 60335, city: "Montevideo" },
  4724: { name: "AT&T Stadium", capacity: 80000, city: "Washington" },
  4723: { name: "Milliy Stadium", capacity: 34000, city: "Tashkent" },
};

function normalizeTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function getCanonicalTeamHomeVenue(
  teamId: number,
  teamName?: string
): TeamHomeVenue | null {
  if (teamName?.trim()) {
    const byName = VENUE_BY_NORMALIZED_NAME[normalizeTeamName(teamName)];
    if (byName) return byName;
  }
  return VENUE_BY_TEAM_ID[teamId] ?? null;
}

/** Canonical home city for stadium / travel (from venue registry). */
export function getTeamHomeCityFromVenue(teamId: number, teamName?: string): string | null {
  const venue = getCanonicalTeamHomeVenue(teamId, teamName);
  return venue?.city?.trim() || null;
}

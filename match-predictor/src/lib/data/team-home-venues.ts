/**
 * Canonical home stadiums keyed by Sofascore / SportAPI team id (same ids as synced_teams).
 * Used for team comparison and stadium impact when event payloads have wrong or missing venues.
 */
export interface TeamHomeVenue {
  name: string;
  capacity: number;
}

/** Normalized team name → venue (fallback when id differs between data sources). */
const VENUE_BY_NORMALIZED_NAME: Record<string, TeamHomeVenue> = {
  ajax: { name: "Johan Cruyff Arena", capacity: 54949 },
  "afc ajax": { name: "Johan Cruyff Arena", capacity: 54949 },
  "tottenham hotspur": { name: "Tottenham Hotspur Stadium", capacity: 62850 },
  tottenham: { name: "Tottenham Hotspur Stadium", capacity: 62850 },
  "manchester united": { name: "Old Trafford", capacity: 74310 },
  "manchester city": { name: "Etihad Stadium", capacity: 53400 },
  liverpool: { name: "Anfield", capacity: 61276 },
  arsenal: { name: "Emirates Stadium", capacity: 60704 },
  chelsea: { name: "Stamford Bridge", capacity: 40341 },
  "west ham": { name: "London Stadium", capacity: 62500 },
  "west ham united": { name: "London Stadium", capacity: 62500 },
  "crystal palace": { name: "Selhurst Park", capacity: 25486 },
  brighton: { name: "American Express Stadium", capacity: 31872 },
  "brighton & hove albion": { name: "American Express Stadium", capacity: 31872 },
  brentford: { name: "Gtech Community Stadium", capacity: 17250 },
  everton: { name: "Hill Dickinson Stadium", capacity: 52888 },
  fulham: { name: "Craven Cottage", capacity: 19359 },
  bournemouth: { name: "Vitality Stadium", capacity: 11307 },
  wolves: { name: "Molineux Stadium", capacity: 31700 },
  "wolverhampton wanderers": { name: "Molineux Stadium", capacity: 31700 },
  burnley: { name: "Turf Moor", capacity: 21944 },
  "aston villa": { name: "Villa Park", capacity: 42640 },
  "nottingham forest": { name: "The City Ground", capacity: 30445 },
  newcastle: { name: "St James' Park", capacity: 52305 },
  "newcastle united": { name: "St James' Park", capacity: 52305 },
  leeds: { name: "Elland Road", capacity: 37792 },
  "leeds united": { name: "Elland Road", capacity: 37792 },
  sunderland: { name: "Stadium of Light", capacity: 49000 },
  barcelona: { name: "Spotify Camp Nou", capacity: 99354 },
  "atletico madrid": { name: "Riyadh Air Metropolitano", capacity: 70460 },
  "athletic club": { name: "San Mamés", capacity: 53289 },
  "real madrid": { name: "Santiago Bernabéu", capacity: 83186 },
  villarreal: { name: "Estadio de la Cerámica", capacity: 23500 },
  girona: { name: "Estadi Montilivi", capacity: 14100 },
  "real sociedad": { name: "Reale Arena", capacity: 39500 },
  "bayern munich": { name: "Allianz Arena", capacity: 75024 },
  "borussia dortmund": { name: "Signal Iduna Park", capacity: 81365 },
  "bayer leverkusen": { name: "BayArena", capacity: 30210 },
  "rb leipzig": { name: "Red Bull Arena", capacity: 47069 },
  "ac milan": { name: "San Siro", capacity: 75817 },
  inter: { name: "San Siro", capacity: 75817 },
  juventus: { name: "Allianz Stadium", capacity: 41507 },
  napoli: { name: "Stadio Diego Armando Maradona", capacity: 54726 },
  roma: { name: "Stadio Olimpico", capacity: 70634 },
  marseille: { name: "Orange Vélodrome", capacity: 67394 },
  "paris saint germain": { name: "Parc des Princes", capacity: 47929 },
  psg: { name: "Parc des Princes", capacity: 47929 },
  monaco: { name: "Stade Louis II", capacity: 16360 },
  "psv eindhoven": { name: "Philips Stadion", capacity: 35000 },
  feyenoord: { name: "De Kuip", capacity: 51577 },
  england: { name: "Wembley Stadium", capacity: 90000 },
  germany: { name: "Olympiastadion Berlin", capacity: 74475 },
  spain: { name: "Santiago Bernabéu", capacity: 83186 },
  france: { name: "Stade de France", capacity: 80698 },
  brazil: { name: "Maracanã", capacity: 78838 },
  netherlands: { name: "Johan Cruyff Arena", capacity: 54949 },
  argentina: { name: "Estadio Monumental", capacity: 83214 },
  portugal: { name: "Estádio da Luz", capacity: 64642 },
  belgium: { name: "King Baudouin Stadium", capacity: 50093 },
  croatia: { name: "Stadion Maksimir", capacity: 35123 },
  usa: { name: "AT&T Stadium", capacity: 80000 },
  japan: { name: "National Stadium", capacity: 68000 },
};

const VENUE_BY_TEAM_ID: Record<number, TeamHomeVenue> = {
  // Premier League
  33: { name: "Old Trafford", capacity: 74310 },
  34: { name: "St James' Park", capacity: 52305 },
  35: { name: "Vitality Stadium", capacity: 11307 },
  36: { name: "Craven Cottage", capacity: 19359 },
  39: { name: "Molineux Stadium", capacity: 31700 },
  40: { name: "Anfield", capacity: 61276 },
  42: { name: "Emirates Stadium", capacity: 60704 },
  44: { name: "Turf Moor", capacity: 21944 },
  45: { name: "Hill Dickinson Stadium", capacity: 52888 },
  47: { name: "Tottenham Hotspur Stadium", capacity: 62850 },
  48: { name: "London Stadium", capacity: 62500 },
  49: { name: "Stamford Bridge", capacity: 40341 },
  50: { name: "Etihad Stadium", capacity: 53400 },
  51: { name: "American Express Stadium", capacity: 31872 },
  52: { name: "Selhurst Park", capacity: 25486 },
  55: { name: "Gtech Community Stadium", capacity: 17250 },
  63: { name: "Elland Road", capacity: 37792 },
  65: { name: "The City Ground", capacity: 30445 },
  66: { name: "Villa Park", capacity: 42640 },
  746: { name: "Stadium of Light", capacity: 49000 },
  // Championship
  56: { name: "Hillsborough", capacity: 39812 },
  57: { name: "Portman Road", capacity: 30311 },
  58: { name: "The Den", capacity: 20146 },
  59: { name: "Deepdale", capacity: 23408 },
  60: { name: "The Hawthorns", capacity: 26688 },
  62: { name: "Bramall Lane", capacity: 32702 },
  67: { name: "Ewood Park", capacity: 31367 },
  70: { name: "Riverside Stadium", capacity: 34742 },
  71: { name: "Carrow Road", capacity: 27244 },
  72: { name: "Loftus Road", capacity: 18439 },
  // La Liga
  529: { name: "Spotify Camp Nou", capacity: 99354 },
  530: { name: "Riyadh Air Metropolitano", capacity: 70460 },
  531: { name: "San Mamés", capacity: 53289 },
  533: { name: "Estadio de la Cerámica", capacity: 23500 },
  541: { name: "Santiago Bernabéu", capacity: 83186 },
  547: { name: "Estadi Montilivi", capacity: 14100 },
  548: { name: "Reale Arena", capacity: 39500 },
  // Bundesliga
  157: { name: "Allianz Arena", capacity: 75024 },
  165: { name: "Signal Iduna Park", capacity: 81365 },
  168: { name: "BayArena", capacity: 30210 },
  173: { name: "Red Bull Arena", capacity: 47069 },
  // Serie A
  489: { name: "San Siro", capacity: 75817 },
  492: { name: "Stadio Diego Armando Maradona", capacity: 54726 },
  496: { name: "Allianz Stadium", capacity: 41507 },
  497: { name: "Stadio Olimpico", capacity: 70634 },
  505: { name: "San Siro", capacity: 75817 },
  // Ligue 1
  81: { name: "Orange Vélodrome", capacity: 67394 },
  85: { name: "Parc des Princes", capacity: 47929 },
  91: { name: "Stade Louis II", capacity: 16360 },
  // Eredivisie
  193: { name: "Philips Stadion", capacity: 35000 },
  194: { name: "Johan Cruyff Arena", capacity: 54949 },
  195: { name: "De Kuip", capacity: 51577 },
  // FIFA World Cup 2026 (primary home venues)
  4691: { name: "Stade du 5 Juillet", capacity: 80200 },
  4819: { name: "Estadio Monumental", capacity: 83214 },
  4741: { name: "Accor Stadium", capacity: 83500 },
  4718: { name: "Ernst-Happel-Stadion", capacity: 48000 },
  4717: { name: "King Baudouin Stadium", capacity: 50093 },
  4479: { name: "Bilino Polje", capacity: 15200 },
  4748: { name: "Maracanã", capacity: 78838 },
  4753: { name: "Estádio Nacional de Cabo Verde", capacity: 15000 },
  4752: { name: "BMO Field", capacity: 30000 },
  4820: { name: "Estadio Metropolitano Roberto Meléndez", capacity: 46783 },
  4768: { name: "Stade Félix Houphouët-Boigny", capacity: 45000 },
  4715: { name: "Stadion Maksimir", capacity: 35123 },
  55827: { name: "Ergilio Hato Stadium", capacity: 10000 },
  4714: { name: "Fortuna Arena", capacity: 21000 },
  4823: { name: "Stade des Martyrs", capacity: 80000 },
  4757: { name: "Estadio Rodrigo Paz Delgado", capacity: 45323 },
  4758: { name: "Cairo International Stadium", capacity: 75000 },
  4713: { name: "Wembley Stadium", capacity: 90000 },
  4481: { name: "Stade de France", capacity: 80698 },
  4711: { name: "Olympiastadion Berlin", capacity: 74475 },
  4764: { name: "Baba Yara Stadium", capacity: 40000 },
  7229: { name: "Stade Sylvio Cator", capacity: 12000 },
  4766: { name: "Azadi Stadium", capacity: 78116 },
  4767: { name: "Basra International Stadium", capacity: 65000 },
  4770: { name: "National Stadium", capacity: 68000 },
  4771: { name: "Amman International Stadium", capacity: 17000 },
  4781: { name: "Estadio Azteca", capacity: 87523 },
  4778: { name: "Stade Mohammed V", capacity: 45800 },
  4705: { name: "Johan Cruyff Arena", capacity: 54949 },
  4784: { name: "Wellington Regional Stadium", capacity: 34500 },
  4475: { name: "Ullevaal Stadion", capacity: 25500 },
  5164: { name: "Estadio Rommel Fernández", capacity: 45000 },
  4789: { name: "Estadio Defensores del Chaco", capacity: 42354 },
  4704: { name: "Estádio da Luz", capacity: 64642 },
  4792: { name: "Lusail Stadium", capacity: 88966 },
  4834: { name: "King Abdullah Sports City", capacity: 62000 },
  4695: { name: "Hampden Park", capacity: 51866 },
  4739: { name: "Stade Léopold Sédar Senghor", capacity: 60000 },
  4736: { name: "FNB Stadium", capacity: 94736 },
  4735: { name: "Seoul World Cup Stadium", capacity: 66704 },
  4698: { name: "Santiago Bernabéu", capacity: 83186 },
  4688: { name: "Friends Arena", capacity: 50000 },
  4699: { name: "Stade de Genève", capacity: 30084 },
  4729: { name: "Stade Olympique de Radès", capacity: 60000 },
  4700: { name: "Rams Park", capacity: 52695 },
  4725: { name: "Estadio Centenario", capacity: 60335 },
  4724: { name: "AT&T Stadium", capacity: 80000 },
  4723: { name: "Milliy Stadium", capacity: 34000 },
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
  const byId = VENUE_BY_TEAM_ID[teamId];
  if (byId) return byId;
  if (!teamName?.trim()) return null;
  return VENUE_BY_NORMALIZED_NAME[normalizeTeamName(teamName)] ?? null;
}

/** Normalize club names for city lookup (aligned with team-home-venues). */
export function normalizeClubName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

const TEAM_STOPWORDS = new Set([
  "fc",
  "cf",
  "ac",
  "sc",
  "afc",
  "cfc",
  "sv",
  "cd",
  "ud",
  "the",
  "de",
  "la",
  "club",
  "football",
  "balompie",
  "balompié",
  "united",
  "city",
  "town",
  "rovers",
  "athletic",
  "atletico",
  "atlético",
  "olympique",
  "as",
  "sk",
  "krc",
  "kv",
  "fk",
  "calcio",
  "us",
  "ss",
  "rc",
  "ogc",
  "rb",
  "vfb",
  "tsv",
  "fsv",
  "spvgg",
  "1899",
  "1907",
  "1913",
  "1919",
  "1",
  "go",
  "ahead",
  "eagles",
  "hotspur",
  "hove",
  "saint",
  "gilloise",
  "union",
  "royale",
]);

/** Multi-word city tokens (lowercase) → display city for suffix matching. */
export const CITY_TOKEN_TO_DISPLAY: Record<string, string> = {
  london: "London",
  manchester: "Manchester",
  liverpool: "Liverpool",
  birmingham: "Birmingham",
  leeds: "Leeds",
  sheffield: "Sheffield",
  nottingham: "Nottingham",
  bristol: "Bristol",
  leicester: "Leicester",
  coventry: "Coventry",
  sunderland: "Sunderland",
  newcastle: "Newcastle",
  brighton: "Brighton",
  southampton: "Southampton",
  portsmouth: "Portsmouth",
  watford: "Watford",
  ipswich: "Ipswich",
  norwich: "Norwich",
  hull: "Hull",
  stoke: "Stoke",
  derby: "Derby",
  middlesbrough: "Middlesbrough",
  blackburn: "Blackburn",
  burnley: "Burnley",
  bournemouth: "Bournemouth",
  brentford: "Brentford",
  fulham: "Fulham",
  wolves: "Wolverhampton",
  wolverhampton: "Wolverhampton",
  west: "London",
  ham: "London",
  palace: "London",
  qpr: "London",
  millwall: "London",
  charlton: "London",
  oxford: "Oxford",
  swansea: "Swansea",
  wrexham: "Wrexham",
  barcelona: "Barcelona",
  madrid: "Madrid",
  sevilla: "Seville",
  valencia: "Valencia",
  bilbao: "Bilbao",
  vigo: "Vigo",
  gijon: "Gijón",
  oviedo: "Oviedo",
  zaragoza: "Zaragoza",
  malaga: "Málaga",
  cadiz: "Cádiz",
  almeria: "Almería",
  burgos: "Burgos",
  eibar: "Eibar",
  getafe: "Getafe",
  leganes: "Leganés",
  levante: "Valencia",
  valladolid: "Valladolid",
  coruna: "A Coruña",
  albacete: "Albacete",
  cordoba: "Córdoba",
  granada: "Granada",
  huesca: "Huesca",
  ceuta: "Ceuta",
  leon: "León",
  munich: "Munich",
  dortmund: "Dortmund",
  berlin: "Berlin",
  hamburg: "Hamburg",
  cologne: "Cologne",
  frankfurt: "Frankfurt",
  leverkusen: "Leverkusen",
  leipzig: "Leipzig",
  stuttgart: "Stuttgart",
  bremen: "Bremen",
  wolfsburg: "Wolfsburg",
  mainz: "Mainz",
  bochum: "Bochum",
  milan: "Milan",
  turin: "Turin",
  rome: "Rome",
  naples: "Naples",
  napoli: "Naples",
  florence: "Florence",
  bergamo: "Bergamo",
  verona: "Verona",
  genoa: "Genoa",
  bologna: "Bologna",
  paris: "Paris",
  marseille: "Marseille",
  lyon: "Lyon",
  lyonnais: "Lyon",
  monaco: "Monaco",
  lille: "Lille",
  nantes: "Nantes",
  nice: "Nice",
  lens: "Lens",
  rennes: "Rennes",
  strasbourg: "Strasbourg",
  toulouse: "Toulouse",
  reims: "Reims",
  metz: "Metz",
  montpellier: "Montpellier",
  brest: "Brest",
  amsterdam: "Amsterdam",
  rotterdam: "Rotterdam",
  eindhoven: "Eindhoven",
  breda: "Breda",
  utrecht: "Utrecht",
  groningen: "Groningen",
  alkmaar: "Alkmaar",
  enschede: "Enschede",
  sittard: "Sittard",
  nijmegen: "Nijmegen",
  heerenveen: "Heerenveen",
  zwolle: "Zwolle",
  volendam: "Volendam",
  almelo: "Almelo",
  deventer: "Deventer",
  lisbon: "Lisbon",
  porto: "Porto",
  braga: "Braga",
  istanbul: "Istanbul",
  ankara: "Ankara",
  izmir: "Izmir",
  samsun: "Samsun",
  warszawa: "Warsaw",
  warsaw: "Warsaw",
  poznan: "Poznań",
  krakow: "Kraków",
  gdansk: "Gdańsk",
  wroclaw: "Wrocław",
  lodz: "Łódź",
  brugge: "Bruges",
  genk: "Genk",
  anderlecht: "Brussels",
  ghent: "Ghent",
  glasgow: "Glasgow",
  edinburgh: "Edinburgh",
  dublin: "Dublin",
  belfast: "Belfast",
  copenhagen: "Copenhagen",
  kobenhavn: "Copenhagen",
  oslo: "Oslo",
  bergen: "Bergen",
  stockholm: "Stockholm",
  malmo: "Malmö",
  helsinki: "Helsinki",
  athens: "Athens",
  piraeus: "Piraeus",
  thessaloniki: "Thessaloniki",
  bucharest: "Bucharest",
  kyiv: "Kyiv",
  donetsk: "Donetsk",
  larnaca: "Larnaca",
  nicosia: "Nicosia",
  belgrade: "Belgrade",
  zagreb: "Zagreb",
  prague: "Prague",
  plzen: "Plzeň",
  vienna: "Vienna",
  salzburg: "Salzburg",
  basel: "Basel",
  zurich: "Zurich",
  geneve: "Geneva",
  bern: "Bern",
  budapest: "Budapest",
  moscow: "Moscow",
  kazan: "Kazan",
  riyadh: "Riyadh",
  jeddah: "Jeddah",
  doha: "Doha",
  dubai: "Dubai",
  tokyo: "Tokyo",
  sydney: "Sydney",
  melbourne: "Melbourne",
  toronto: "Toronto",
  montreal: "Montreal",
  vancouver: "Vancouver",
  miami: "Miami",
  dallas: "Dallas",
  houston: "Houston",
  chicago: "Chicago",
  atlanta: "Atlanta",
  seattle: "Seattle",
  denver: "Denver",
  cincinnati: "Cincinnati",
  nashville: "Nashville",
  orlando: "Orlando",
  "salt lake": "Salt Lake City",
  "los angeles": "Los Angeles",
  "new york": "New York",
  "st louis": "St. Louis",
  "san diego": "San Diego",
};

const MULTI_WORD_SUFFIXES = [
  "salt lake",
  "los angeles",
  "new york",
  "st louis",
  "san diego",
  "la coruna",
  "de coruna",
  "real madrid",
  "atletico madrid",
  "athletic club",
  "west ham",
  "crystal palace",
  "queens park",
  "nottingham forest",
  "sheffield united",
  "sheffield wednesday",
  "west bromwich",
  "manchester united",
  "manchester city",
  "newcastle united",
  "leeds united",
  "aston villa",
  "brighton hove",
  "go ahead",
  "sparta rotterdam",
  "fortuna sittard",
  "nec nijmegen",
  "nac breda",
  "fc porto",
  "sporting cp",
  "paris saint germain",
  "saint etienne",
  "saint-etienne",
  "le havre",
  "le mans",
  "stade rennais",
  "real sociedad",
  "real betis",
  "real valladolid",
  "real oviedo",
  "real racing",
  "real salt",
  "borussia dortmund",
  "bayern munich",
  "bayer leverkusen",
  "ac milan",
  "inter milan",
  "as monaco",
  "olympique lyonnais",
  "olympique marseille",
  "paris saint-germain",
];

/**
 * Infer a home city from a club name using suffix tokens and aliases.
 * Returns display-form city or null.
 */
export function inferCityFromClubName(
  teamName: string,
  aliases?: Record<string, string>
): string | null {
  const normalized = normalizeClubName(teamName);
  if (!normalized) return null;

  if (aliases?.[normalized]) return aliases[normalized];

  for (const phrase of MULTI_WORD_SUFFIXES) {
    if (normalized === phrase || normalized.endsWith(` ${phrase}`)) {
      const city = CITY_TOKEN_TO_DISPLAY[phrase.split(" ").at(-1)!] ?? null;
      if (phrase.includes("madrid")) return "Madrid";
      if (phrase.includes("barcelona") || phrase === "barcelona") return "Barcelona";
      if (phrase.includes("manchester")) return "Manchester";
      if (phrase.includes("liverpool")) return "Liverpool";
      if (phrase.includes("london") || phrase.includes("ham") || phrase.includes("palace"))
        return "London";
      if (phrase.includes("breda")) return "Breda";
      if (phrase.includes("rotterdam")) return "Rotterdam";
      if (phrase.includes("amsterdam") || phrase.includes("ajax")) return "Amsterdam";
      if (phrase.includes("eindhoven") || phrase.includes("psv")) return "Eindhoven";
      if (phrase.includes("porto")) return "Porto";
      if (phrase.includes("lyon") || phrase.includes("lyonnais")) return "Lyon";
      if (phrase.includes("marseille")) return "Marseille";
      if (phrase.includes("paris") || phrase.includes("germain")) return "Paris";
      if (phrase.includes("munich") || phrase.includes("bayern")) return "Munich";
      if (phrase.includes("dortmund")) return "Dortmund";
      if (phrase.includes("leverkusen")) return "Leverkusen";
      if (phrase.includes("milan")) return "Milan";
      if (phrase.includes("etienne")) return "Saint-Étienne";
      if (phrase.includes("salt")) return "Salt Lake City";
      if (phrase.includes("angeles")) return "Los Angeles";
      if (phrase.includes("diego")) return "San Diego";
      if (city) return city;
    }
  }

  const tokens = normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t && !TEAM_STOPWORDS.has(t));

  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    const suffix = tokens.slice(-len).join(" ");
    const city = CITY_TOKEN_TO_DISPLAY[suffix];
    if (city) return city;
  }

  if (tokens.length === 1) {
    const single = CITY_TOKEN_TO_DISPLAY[tokens[0]!];
    if (single) return single;
  }

  return null;
}

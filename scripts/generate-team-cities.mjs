/**
 * Builds src/lib/data/team-cities.generated.ts from logo manifest, venue cities,
 * national-team geography, and name inference.
 *
 * Run: npm run cities:generate
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEAM_CITY_ID_OVERRIDES } from "./team-city-id-overrides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "src/lib/data/team-logo-manifest.ts");
const venuesPath = path.join(root, "src/lib/data/team-home-venues.ts");
const nationalPath = path.join(root, "src/lib/data/national-team-geography.ts");
const outPath = path.join(root, "src/lib/data/team-cities.generated.ts");
const coordsOutPath = path.join(root, "src/lib/utils/city-coordinates.generated.ts");

function parseManifest() {
  const text = fs.readFileSync(manifestPath, "utf8");
  const teams = [];
  for (const m of text.matchAll(/"(\d+)":\s*"([^"]+)"/g)) {
    teams.push({ id: Number(m[1]), name: m[2] });
  }
  return teams;
}

function parseVenueCities() {
  const text = fs.readFileSync(venuesPath, "utf8");
  const byId = {};
  for (const m of text.matchAll(/^\s*(\d+):\s*\{[^}]*city:\s*"([^"]+)"/gm)) {
    byId[Number(m[1])] = m[2];
  }
  return byId;
}

function parseNationalCities() {
  const text = fs.readFileSync(nationalPath, "utf8");
  const byId = {};
  for (const m of text.matchAll(/^\s*(\d+):\s*"([^"]+)",/gm)) {
    byId[Number(m[1])] = m[2];
  }
  return byId;
}

function normalizeClubName(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Hand-maintained overrides (normalized team name → city). */
const NAME_OVERRIDES = {
  "tottenham hotspur": "London",
  "west ham united": "London",
  "crystal palace": "London",
  "queens park rangers": "London",
  "charlton athletic": "London",
  "millwall": "London",
  "nottingham forest": "Nottingham",
  "sheffield united": "Sheffield",
  "sheffield wednesday": "Sheffield",
  "west bromwich albion": "West Bromwich",
  "manchester united": "Manchester",
  "manchester city": "Manchester",
  "newcastle united": "Newcastle",
  "leeds united": "Leeds",
  "aston villa": "Birmingham",
  "brighton and hove albion": "Brighton",
  "wolverhampton wanderers": "Wolverhampton",
  "wolves": "Wolverhampton",
  "liverpool fc": "Liverpool",
  "preston north end": "Preston",
  "blackburn rovers": "Blackburn",
  "coventry city": "Coventry",
  "derby county": "Derby",
  "stoke city": "Stoke",
  "swansea city": "Swansea",
  "oxford united": "Oxford",
  "hull city": "Hull",
  "norwich city": "Norwich",
  "ipswich town": "Ipswich",
  "afc ajax": "Amsterdam",
  "nac breda": "Breda",
  "psv eindhoven": "Eindhoven",
  "fc twente": "Enschede",
  "fortuna sittard": "Sittard",
  "sparta rotterdam": "Rotterdam",
  "sc heerenveen": "Heerenveen",
  "heracles almelo": "Almelo",
  "go ahead eagles": "Deventer",
  "sc telstar": "Velsen",
  "pec zwolle": "Zwolle",
  "fc volendam": "Volendam",
  "fc groningen": "Groningen",
  "fc utrecht": "Utrecht",
  "az alkmaar": "Alkmaar",
  "nec nijmegen": "Nijmegen",
  "atletico madrid": "Madrid",
  "athletic club": "Bilbao",
  "real madrid": "Madrid",
  "real sociedad": "San Sebastián",
  "real betis": "Seville",
  "real valladolid": "Valladolid",
  "real oviedo": "Oviedo",
  "real racing club": "Santander",
  "real salt lake": "Salt Lake City",
  "deportivo de la coruna": "A Coruña",
  "deportivo alaves": "Vitoria-Gasteiz",
  "sporting gijon": "Gijón",
  "club brugge kv": "Bruges",
  "krc genk": "Genk",
  "royale union saint-gilloise": "Brussels",
  "paris saint-germain": "Paris",
  "paris saint germain": "Paris",
  "olympique lyonnais": "Lyon",
  "olympique de marseille": "Marseille",
  "as monaco": "Monaco",
  "stade rennais": "Rennes",
  "rc lens": "Lens",
  "rc strasbourg": "Strasbourg",
  "saint-etienne": "Saint-Étienne",
  "saint etienne": "Saint-Étienne",
  "bayern munich": "Munich",
  "borussia dortmund": "Dortmund",
  "bayer leverkusen": "Leverkusen",
  "rb leipzig": "Leipzig",
  "ac milan": "Milan",
  "inter milan": "Milan",
  "fc porto": "Porto",
  "sporting cp": "Lisbon",
  "sporting braga": "Braga",
  "sl benfica": "Lisbon",
  "benfica": "Lisbon",
  "fenerbahce": "Istanbul",
  "galatasaray": "Istanbul",
  "legia warszawa": "Warsaw",
  "lech poznan": "Poznań",
  "fk crvena zvezda": "Belgrade",
  "olympiacos fc": "Piraeus",
  "panathinaikos fc": "Athens",
  "aek athens": "Athens",
  "paok": "Thessaloniki",
  "fcsb": "Bucharest",
  "dynamo kyiv": "Kyiv",
  "shakhtar donetsk": "Donetsk",
  "omonia nicosia": "Nicosia",
  "aek larnaca": "Larnaca",
  "fc kobenhavn": "Copenhagen",
  "fc midtjylland": "Herning",
  "sk brann": "Bergen",
  "bodo glimt": "Bodø",
  "celtic": "Glasgow",
  "rangers": "Glasgow",
  "shelbourne": "Dublin",
  "shamrock rovers": "Dublin",
  "los angeles fc": "Los Angeles",
  "la galaxy": "Los Angeles",
  "inter miami": "Miami",
  "new york city fc": "New York",
  "new york red bulls": "New York",
  "philadelphia union": "Philadelphia",
  "orlando city": "Orlando",
  "atlanta united": "Atlanta",
  "seattle sounders": "Seattle",
  "portland timbers": "Portland",
  "fc cincinnati": "Cincinnati",
  "nashville sc": "Nashville",
  "st louis city": "St. Louis",
  "minnesota united": "Minneapolis",
  "houston dynamo": "Houston",
  "fc dallas": "Dallas",
  "sporting kansas city": "Kansas City",
  "colorado rapids": "Denver",
  "san jose earthquakes": "San Jose",
  "vancouver whitecaps": "Vancouver",
  "cf montreal": "Montreal",
  "toronto fc": "Toronto",
  "al hilal": "Riyadh",
  "al nassr": "Riyadh",
  "al ahli": "Jeddah",
  "al ittihad": "Jeddah",
};

const CITY_TOKEN_TO_DISPLAY = {
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
  wolverhampton: "Wolverhampton",
  barcelona: "Barcelona",
  madrid: "Madrid",
  sevilla: "Seville",
  valencia: "Valencia",
  bilbao: "Bilbao",
  munich: "Munich",
  dortmund: "Dortmund",
  berlin: "Berlin",
  leverkusen: "Leverkusen",
  leipzig: "Leipzig",
  milan: "Milan",
  turin: "Turin",
  rome: "Rome",
  napoli: "Naples",
  paris: "Paris",
  marseille: "Marseille",
  lyon: "Lyon",
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
  lisbon: "Lisbon",
  porto: "Porto",
  braga: "Braga",
  istanbul: "Istanbul",
  samsun: "Samsun",
  warszawa: "Warsaw",
  poznan: "Poznań",
  brugge: "Bruges",
  genk: "Genk",
  glasgow: "Glasgow",
  dublin: "Dublin",
  copenhagen: "Copenhagen",
  oslo: "Oslo",
  bergen: "Bergen",
  stockholm: "Stockholm",
  athens: "Athens",
  piraeus: "Piraeus",
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
  budapest: "Budapest",
  riyadh: "Riyadh",
  jeddah: "Jeddah",
  doha: "Doha",
  tokyo: "Tokyo",
  sydney: "Sydney",
  toronto: "Toronto",
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
  chelsea: "London",
  arsenal: "London",
  everton: "Liverpool",
  tottenham: "London",
  villa: "Birmingham",
  forest: "Nottingham",
  palace: "London",
  ham: "London",
  end: "Preston",
  wednesday: "Sheffield",
  albion: "West Bromwich",
  rangers: "Glasgow",
  celtic: "Glasgow",
};

const STOP = new Set([
  "fc", "cf", "ac", "sc", "afc", "cfc", "sv", "cd", "ud", "the", "de", "la", "club",
  "football", "united", "city", "town", "rovers", "athletic", "atletico", "olympique",
  "as", "sk", "krc", "kv", "fk", "calcio", "us", "ss", "rc", "ogc", "rb",
]);

function inferCity(teamName) {
  const normalized = normalizeClubName(teamName);
  if (NAME_OVERRIDES[normalized]) return NAME_OVERRIDES[normalized];

  const tokens = normalized.split(" ").filter((t) => t && !STOP.has(t));
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    const suffix = tokens.slice(-len).join(" ");
    if (CITY_TOKEN_TO_DISPLAY[suffix]) return CITY_TOKEN_TO_DISPLAY[suffix];
  }
  if (tokens.length === 1 && CITY_TOKEN_TO_DISPLAY[tokens[0]]) {
    return CITY_TOKEN_TO_DISPLAY[tokens[0]];
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadBaseGeoKeys() {
  const geoText = fs.readFileSync(path.join(root, "src/lib/utils/geo.ts"), "utf8");
  const keys = new Set();
  for (const m of geoText.matchAll(/^\s*([^:]+):\s*\{\s*lat:/gm)) {
    keys.add(m[1].trim().toLowerCase());
  }
  return keys;
}

async function geocodeCity(displayName) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", displayName);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit || hit.latitude == null || hit.longitude == null) return null;
  return {
    lat: Math.round(hit.latitude * 10000) / 10000,
    lon: Math.round(hit.longitude * 10000) / 10000,
  };
}

async function main() {
  const teams = parseManifest();
  const venueCities = parseVenueCities();
  const nationalCities = parseNationalCities();
  const baseGeoKeys = loadBaseGeoKeys();

  const byId = {};
  const unresolved = [];

  for (const { id, name } of teams) {
    let city =
      nationalCities[id] ?? venueCities[id] ?? TEAM_CITY_ID_OVERRIDES[id] ?? null;
    if (!city) city = inferCity(name);
    if (city) byId[id] = city;
    else unresolved.push({ id, name });
  }

  const sortedIds = Object.keys(byId)
    .map(Number)
    .sort((a, b) => a - b);

  const lines = sortedIds.map((id) => `  ${id}: ${JSON.stringify(byId[id])},`).join("\n");

  const out = `// AUTO-GENERATED by scripts/generate-team-cities.mjs — do not edit by hand.
// Regenerate after adding teams to team-logo-manifest or team-home-venues cities.

export const TEAM_CITY_BY_ID: Record<number, string> = {
${lines}
};
`;

  fs.writeFileSync(outPath, out, "utf8");
  console.log(`Wrote ${sortedIds.length} team cities to ${path.relative(root, outPath)}`);

  const uniqueCities = [...new Set(Object.values(byId))].sort((a, b) => a.localeCompare(b));
  const coordEntries = {};
  let geocoded = 0;
  let skipped = 0;

  for (const display of uniqueCities) {
    const key = display.trim().toLowerCase();
    if (baseGeoKeys.has(key)) {
      skipped++;
      continue;
    }
    let already = false;
    for (const existing of baseGeoKeys) {
      if (key.includes(existing) || existing.includes(key)) {
        already = true;
        break;
      }
    }
    if (already) {
      skipped++;
      continue;
    }

    const coords = await geocodeCity(display);
    if (coords) {
      coordEntries[key] = coords;
      geocoded++;
    } else {
      console.warn(`Geocode miss: ${display}`);
    }
    await sleep(80);
  }

  const coordLines = Object.keys(coordEntries)
    .sort()
    .map(
      (key) =>
        `  ${JSON.stringify(key)}: { lat: ${coordEntries[key].lat}, lon: ${coordEntries[key].lon} },`
    )
    .join("\n");

  const coordsOut = `// AUTO-GENERATED by scripts/generate-team-cities.mjs — do not edit by hand.

export const GENERATED_CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
${coordLines}
};
`;

  fs.writeFileSync(coordsOutPath, coordsOut, "utf8");
  console.log(
    `Wrote ${geocoded} geocoded cities (${skipped} already in base geo) to ${path.relative(root, coordsOutPath)}`
  );

  if (unresolved.length) {
    console.warn(`Unresolved (${unresolved.length}):`);
    for (const u of unresolved.slice(0, 25)) console.warn(`  ${u.id}: ${u.name}`);
    if (unresolved.length > 25) console.warn(`  ... and ${unresolved.length - 25} more`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

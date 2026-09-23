import { WORLD_CUP_2026_TEAMS, normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";

/**
 * Principal base city for travel-fatigue (capital or main FA / stadium hub).
 * Keys are lowercase city names matching {@link CITY_COORDINATES} in geo.ts.
 */
export const NATIONAL_TEAM_BASE_CITY_BY_ID: Record<number, string> = {
  4691: "Algiers",
  4819: "Buenos Aires",
  4741: "Sydney",
  4718: "Vienna",
  4717: "Brussels",
  4479: "Sarajevo",
  4748: "Rio de Janeiro",
  4753: "Praia",
  4752: "Toronto",
  4820: "Bogotá",
  4768: "Abidjan",
  4715: "Zagreb",
  55827: "Willemstad",
  4714: "Prague",
  4823: "Kinshasa",
  4757: "Quito",
  4758: "Cairo",
  4713: "London",
  4481: "Paris",
  4711: "Berlin",
  4764: "Accra",
  7229: "Port-au-Prince",
  4766: "Tehran",
  4767: "Baghdad",
  4770: "Tokyo",
  4771: "Amman",
  4781: "Mexico City",
  4778: "Rabat",
  4705: "Amsterdam",
  4784: "Wellington",
  4475: "Oslo",
  5164: "Panama City",
  4789: "Asunción",
  4704: "Lisbon",
  4792: "Doha",
  4834: "Riyadh",
  4695: "Edinburgh",
  4739: "Dakar",
  4736: "Johannesburg",
  4735: "Seoul",
  4698: "Madrid",
  4688: "Stockholm",
  4699: "Bern",
  4729: "Tunis",
  4700: "Istanbul",
  4725: "Montevideo",
  4724: "Washington",
  4723: "Tashkent",
  // Nations League expansions
  4707: "Rome",
  6355: "Belgrade",
  4710: "Athens",
  4476: "Copenhagen",
  4702: "Cardiff",
  4484: "Ljubljana",
  4777: "Skopje",
  4709: "Budapest",
  4701: "Kyiv",
  4763: "Tbilisi",
  4786: "Belfast",
  4480: "Tel Aviv",
  4693: "Dublin",
  154426: "Pristina",
  4703: "Warsaw",
  4477: "Bucharest",
  4690: "Tirana",
  4712: "Helsinki",
  4743: "Minsk",
  4833: "San Marino",
  7139: "Podgorica",
  4740: "Yerevan",
  4482: "Nicosia",
  4706: "Riga",
  4772: "Astana",
  4697: "Bratislava",
  4760: "Tórshavn",
  4782: "Chișinău",
  4708: "Reykjavik",
  4716: "Sofia",
  4759: "Tallinn",
  4478: "Luxembourg",
  129264: "Gibraltar",
  4483: "Valletta",
  4818: "Andorra la Vella",
  4776: "Vilnius",
  4742: "Baku",
  4830: "Vaduz",
};

const NATIONAL_TEAM_IDS = new Set([
  ...WORLD_CUP_2026_TEAMS.map((t) => t.id),
  ...NATIONS_LEAGUE_2026_TEAMS.map((t) => t.id),
]);

const BASE_CITY_BY_NORMALIZED_NAME: Record<string, string> = Object.fromEntries(
  [...WORLD_CUP_2026_TEAMS, ...NATIONS_LEAGUE_2026_TEAMS].map((t) => [
    normalizeNationalTeamName(t.name),
    NATIONAL_TEAM_BASE_CITY_BY_ID[t.id] ?? "",
  ])
);

export function isNationalTeamId(teamId: number): boolean {
  return NATIONAL_TEAM_IDS.has(teamId);
}

export function getNationalTeamBaseCity(teamId: number, teamName?: string): string | null {
  const byId = NATIONAL_TEAM_BASE_CITY_BY_ID[teamId];
  if (byId) return byId;

  if (teamName?.trim()) {
    const key = normalizeNationalTeamName(teamName);
    const byName = BASE_CITY_BY_NORMALIZED_NAME[key];
    if (byName) return byName;
  }

  return null;
}

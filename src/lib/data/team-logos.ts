import type { EntityType, TeamOption } from "@/lib/types/football-lookup";
import { isNationalTeamId } from "@/lib/data/national-team-geography";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";
import { TEAM_LOGO_ID_TO_NAME, TEAM_LOGO_NAME_TO_ID } from "@/lib/data/team-logo-manifest";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { normalizeTeamName as normalizeTeamNameKey } from "@/lib/soccerdata/normalize";

/** Public path for a locally stored team badge (see scripts/download-team-logos.mjs). */
export function localTeamLogoPath(teamId: number): string {
  return `/team-logos/${teamId}.png`;
}

/** API-Football CDN (used by download script for club badges). */
export function apiSportsTeamLogoUrl(teamId: number): string {
  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}

/**
 * ISO 3166-1 alpha-2 (or flagcdn regional codes) for national sides.
 * Includes World Cup 2026 + UEFA Nations League 2026/27 nations.
 */
const NATIONAL_NAME_TO_ISO: Record<string, string> = {
  Albania: "al",
  Algeria: "dz",
  Andorra: "ad",
  Argentina: "ar",
  Armenia: "am",
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Belarus: "by",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  Bulgaria: "bg",
  "Cabo Verde": "cv",
  Canada: "ca",
  Colombia: "co",
  "Côte d'Ivoire": "ci",
  Croatia: "hr",
  Curaçao: "cw",
  Cyprus: "cy",
  Czechia: "cz",
  Denmark: "dk",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  Estonia: "ee",
  "Faroe Islands": "fo",
  Finland: "fi",
  France: "fr",
  Georgia: "ge",
  Germany: "de",
  Ghana: "gh",
  Gibraltar: "gi",
  Greece: "gr",
  Haiti: "ht",
  Hungary: "hu",
  Iceland: "is",
  Iran: "ir",
  Iraq: "iq",
  Israel: "il",
  Italy: "it",
  Japan: "jp",
  Jordan: "jo",
  Kazakhstan: "kz",
  Kosovo: "xk",
  Latvia: "lv",
  Liechtenstein: "li",
  Lithuania: "lt",
  Luxembourg: "lu",
  Malta: "mt",
  Mexico: "mx",
  Moldova: "md",
  Montenegro: "me",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  "North Macedonia": "mk",
  "Northern Ireland": "gb-nir",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Poland: "pl",
  Portugal: "pt",
  Qatar: "qa",
  "Republic of Ireland": "ie",
  Romania: "ro",
  "San Marino": "sm",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  Serbia: "rs",
  Slovakia: "sk",
  Slovenia: "si",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Türkiye: "tr",
  Turkey: "tr",
  Ukraine: "ua",
  Uruguay: "uy",
  USA: "us",
  "United States": "us",
  Uzbekistan: "uz",
  Wales: "gb-wls",
};

const NATIONAL_ISO_BY_NORMALIZED_NAME: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [name, iso] of Object.entries(NATIONAL_NAME_TO_ISO)) {
    map.set(normalizeNationalTeamName(name), iso);
  }
  return map;
})();

const ALL_NATIONAL_TEAMS = [...WORLD_CUP_2026_TEAMS, ...NATIONS_LEAGUE_2026_TEAMS];

/** Nations whose flags are legally square (1:1), not 2:3 or 3:2. */
const SQUARE_NATIONAL_FLAG_NAMES = new Set([
  "Switzerland",
  "Vatican City",
]);

function findCanonicalNationalTeamName(teamName: string): string | undefined {
  const key = normalizeNationalTeamName(teamName);
  return ALL_NATIONAL_TEAMS.find((t) => normalizeNationalTeamName(t.name) === key)?.name;
}

function resolveNationalIso(teamName: string): string | undefined {
  const trimmed = teamName.trim();
  if (!trimmed) return undefined;

  const direct = NATIONAL_NAME_TO_ISO[trimmed];
  if (direct) return direct;

  const key = normalizeNationalTeamName(trimmed);
  const byNormalized = NATIONAL_ISO_BY_NORMALIZED_NAME.get(key);
  if (byNormalized) return byNormalized;

  const canonical = findCanonicalNationalTeamName(trimmed);
  if (canonical) return NATIONAL_NAME_TO_ISO[canonical];

  return undefined;
}

export function isSquareNationalFlag(teamName: string): boolean {
  const canonical = findCanonicalNationalTeamName(teamName) ?? teamName.trim();
  return SQUARE_NATIONAL_FLAG_NAMES.has(canonical);
}

export function nationalFlagUrl(teamName: string): string | undefined {
  const iso = resolveNationalIso(teamName);
  if (!iso) return undefined;
  return `https://flagcdn.com/w160/${iso}.png`;
}

/** Flag for FBref / FIFA display names (resolves Korea Republic → South Korea, etc.). */
export function resolveNationalFlagUrl(displayName: string): string | undefined {
  return nationalFlagUrl(displayName);
}

function logoLookupKeys(team: TeamOption): string[] {
  const keys = new Set<string>();
  for (const raw of [team.name, team.shortName]) {
    if (!raw?.trim()) continue;
    const norm = normalizeTeamNameKey(raw);
    if (norm) keys.add(norm);
  }
  return [...keys];
}

/** Extra display-name aliases not always present in the generated manifest. */
const EXTRA_LOGO_NAME_TO_ID: Record<string, number> = {
  spurs: 33,
  "man utd": 35,
  "man city": 17,
  psg: 1644,
  ajax: 2953,
  "afc ajax": 2953,
};

function resolveLogoIdByName(team: TeamOption): number | null {
  for (const key of logoLookupKeys(team)) {
    const byName = TEAM_LOGO_NAME_TO_ID[key] ?? EXTRA_LOGO_NAME_TO_ID[key];
    if (byName) return byName;
  }
  return null;
}

/** True when manifest label and display name refer to the same club. */
function logoIdMatchesTeamName(logoId: number, team: TeamOption): boolean {
  const expected = TEAM_LOGO_ID_TO_NAME[logoId];
  if (!expected) return false;
  const expectedNorm = normalizeTeamNameKey(expected);
  if (!expectedNorm) return false;
  for (const key of logoLookupKeys(team)) {
    if (!key) continue;
    if (key === expectedNorm) return true;
    if (expectedNorm.includes(key) || key.includes(expectedNorm)) return true;
  }
  return false;
}

/**
 * SofaScore / SportAPI team id for local badge path.
 * Prefer name when upstream id exists in manifest but does not match the display name
 * (common when API-Football ids collide with SofaScore ids on stored rows).
 */
export function resolveLogoIdForTeam(team: TeamOption): number | null {
  const byName = resolveLogoIdByName(team);

  if (team.id && TEAM_LOGO_ID_TO_NAME[team.id]) {
    if (logoIdMatchesTeamName(team.id, team)) return team.id;
    if (byName != null) return byName;
    return team.id;
  }

  return byName;
}

export function resolveTeamLogo(team: TeamOption, entityType?: EntityType): string {
  const treatAsNational =
    entityType === "national" || (team.id != null && isNationalTeamId(team.id));

  if (treatAsNational) {
    const flag = resolveNationalFlagUrl(team.name);
    if (flag) return flag;
    const id = resolveLogoIdForTeam(team);
    return id ? localTeamLogoPath(id) : "";
  }

  const id = resolveLogoIdForTeam(team);
  if (id) return localTeamLogoPath(id);

  return "";
}

export function enrichTeamWithLogo(team: TeamOption, entityType?: EntityType): TeamOption {
  const logo = resolveTeamLogo(team, entityType);
  return {
    ...team,
    logo: logo || undefined,
  };
}

export function enrichTeamsWithLogos(
  teams: TeamOption[],
  entityType?: EntityType
): TeamOption[] {
  return teams.map((t) => enrichTeamWithLogo(t, entityType));
}

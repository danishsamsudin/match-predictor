import type { EntityType, TeamOption } from "@/lib/types/football-lookup";
import { TEAM_LOGO_ID_TO_NAME, TEAM_LOGO_NAME_TO_ID } from "@/lib/data/team-logo-manifest";

/** Public path for a locally stored team badge (see scripts/download-team-logos.mjs). */
export function localTeamLogoPath(teamId: number): string {
  return `/team-logos/${teamId}.png`;
}

/** API-Football CDN (used by download script for club badges). */
export function apiSportsTeamLogoUrl(teamId: number): string {
  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}

/** ISO 3166-1 alpha-2 for national sides (flagcdn). */
const NATIONAL_NAME_TO_ISO: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  "Cabo Verde": "cv",
  Canada: "ca",
  Colombia: "co",
  "Côte d'Ivoire": "ci",
  Croatia: "hr",
  Curaçao: "cw",
  Czechia: "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  Japan: "jp",
  Jordan: "jo",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Türkiye: "tr",
  Turkey: "tr",
  Uruguay: "uy",
  USA: "us",
  "United States": "us",
  Uzbekistan: "uz",
  Wales: "gb-wls",
};

export function nationalFlagUrl(teamName: string): string | undefined {
  const iso = NATIONAL_NAME_TO_ISO[teamName.trim()];
  if (!iso) return undefined;
  return `https://flagcdn.com/w160/${iso}.png`;
}

function normalizeTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and");
}

function logoIdForTeam(team: TeamOption): number | null {
  const byName = TEAM_LOGO_NAME_TO_ID[normalizeTeamName(team.name)];
  if (byName) return byName;

  const expectedName = TEAM_LOGO_ID_TO_NAME[team.id];
  if (expectedName && normalizeTeamName(expectedName) === normalizeTeamName(team.name)) {
    return team.id;
  }

  return null;
}

export function resolveTeamLogo(team: TeamOption, entityType?: EntityType): string {
  if (team.logo) return team.logo;
  if (entityType === "national") {
    return nationalFlagUrl(team.name) ?? localTeamLogoPath(team.id);
  }
  const id = logoIdForTeam(team);
  return id ? localTeamLogoPath(id) : "";
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

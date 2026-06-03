import type { EntityType, TeamOption } from "@/lib/types/football-lookup";
import { TEAM_LOGO_NAME_TO_ID } from "@/lib/data/team-logo-manifest";
import { normalizeTeamName as normalizeTeamNameKey } from "@/lib/soccerdata/normalize";

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

function logoLookupKeys(team: TeamOption): string[] {
  const keys = new Set<string>();
  for (const raw of [team.name, team.shortName]) {
    if (!raw?.trim()) continue;
    const norm = normalizeTeamNameKey(raw);
    if (norm) keys.add(norm);
  }
  return [...keys];
}

/** SofaScore logo id from team name (never use upstream team.id — API-Football ids collide). */
export function resolveLogoIdForTeam(team: TeamOption): number | null {
  for (const key of logoLookupKeys(team)) {
    const byName = TEAM_LOGO_NAME_TO_ID[key];
    if (byName) return byName;
  }
  return null;
}

export function resolveTeamLogo(team: TeamOption, entityType?: EntityType): string {
  if (entityType === "national") {
    const flag = nationalFlagUrl(team.name);
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

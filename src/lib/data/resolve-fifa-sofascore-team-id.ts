import { normalizeFifaDatasetTeamName } from "@/lib/data/fifa-ranking-aliases";
import { WORLD_CUP_2026_TEAMS } from "@/lib/data/world-cup-2026-teams";

/** FIFA inside.fifa.com labels → normalized keys used in our Sofascore catalog. */
const FIFA_OFFICIAL_NAME_ALIASES: Record<string, string> = {
  "kyrgyz republic": "kyrgyzstan",
  "the gambia": "gambia",
  congo: "congo republic",
  "st kitts and nevis": "saint kitts and nevis",
  "hong kong, china": "hong kong",
  tahiti: "french polynesia",
  "st lucia": "saint lucia",
  "st vincent and the grenadines": "saint vincent and the grenadines",
  "brunei darussalam": "brunei",
  macau: "macao",
  "são tomé and príncipe": "sao tome and principe",
  "sao tomé and príncipe": "sao tome and principe",
  "timor-leste": "east timor",
  "cape verde": "cabo verde",
  "korea republic": "south korea",
  "ir iran": "iran",
  "usa": "usa",
  "united states": "usa",
};

function normalizeForIdLookup(name: string): string {
  const base = normalizeFifaDatasetTeamName(name);
  return FIFA_OFFICIAL_NAME_ALIASES[base] ?? base;
}

export function buildSofascoreTeamIdLookup(
  idByNormalizedName: Map<string, number>
): Map<string, number> {
  const lookup = new Map(idByNormalizedName);

  for (const team of WORLD_CUP_2026_TEAMS) {
    const key = normalizeFifaDatasetTeamName(team.name);
    if (!lookup.has(key)) lookup.set(key, team.id);
  }

  for (const [alias, target] of Object.entries(FIFA_OFFICIAL_NAME_ALIASES)) {
    const id = lookup.get(target);
    if (id != null) lookup.set(alias, id);
  }

  return lookup;
}

export function resolveSofascoreTeamId(
  teamName: string,
  lookup: Map<string, number>
): number | null {
  const key = normalizeForIdLookup(teamName);
  return lookup.get(key) ?? null;
}

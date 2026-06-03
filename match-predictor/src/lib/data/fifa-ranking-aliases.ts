import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";

/** Map FIFA / Kaggle dataset labels to our normalized national team keys. */
const FIFA_DATASET_ALIASES: Record<string, string> = {
  usa: "usa",
  "united states": "usa",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "korea dpr": "north korea",
  "ir iran": "iran",
  iran: "iran",
  "cape verde islands": "cabo verde",
  "cape verde": "cabo verde",
  "cabo verde": "cabo verde",
  "bosnia and herzegovina": "bosnia & herzegovina",
  curacao: "curaçao",
  turkey: "türkiye",
  "côte d'ivoire": "côte d'ivoire",
  "cote d'ivoire": "côte d'ivoire",
  "ivory coast": "côte d'ivoire",
  "congo dr": "dr congo",
  "democratic republic of the congo": "dr congo",
  "dr congo": "dr congo",
  "republic of ireland": "ireland",
  "china pr": "china",
  "chinese taipei": "taiwan",
};

export function normalizeFifaDatasetTeamName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (FIFA_DATASET_ALIASES[lower]) return FIFA_DATASET_ALIASES[lower];
  return normalizeNationalTeamName(trimmed);
}

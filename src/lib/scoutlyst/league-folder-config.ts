import fs from "fs";
import path from "path";
import { FOOTBALL_LEAGUES } from "@/lib/data/football-reference";
import { normalizeText } from "@/lib/soccerdata/normalize";

export const SCOUTLYST_IMPORT_ROOT = path.join(
  process.cwd(),
  "data",
  "imports",
  "scoutlyst"
);
export const SCOUTLYST_INCOMING_DIR = path.join(SCOUTLYST_IMPORT_ROOT, "incoming");
export const SCOUTLYST_ARCHIVE_DIR = path.join(SCOUTLYST_IMPORT_ROOT, "archive");
export const SCOUTLYST_LEAGUE_FOLDERS_CONFIG = path.join(
  SCOUTLYST_IMPORT_ROOT,
  "league-folders.json"
);

function slugify(input: string): string {
  return normalizeText(input).replace(/\s+/g, "-");
}

function buildDefaultFolderMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const league of FOOTBALL_LEAGUES) {
    const slug = slugify(league.name);
    map[slug] = league.id;
    map[String(league.id)] = league.id;
    map[normalizeText(league.name)] = league.id;
    // Common shorthand aliases
    if (league.id === 39) {
      map["pl"] = 39;
      map["epl"] = 39;
      map["prem"] = 39;
    }
    if (league.id === 140) {
      map["laliga"] = 140;
    }
  }
  return map;
}

let cachedFolderMap: Record<string, number> | null = null;

export function loadLeagueFolderMap(): Record<string, number> {
  if (cachedFolderMap) return cachedFolderMap;

  const map = buildDefaultFolderMap();
  if (fs.existsSync(SCOUTLYST_LEAGUE_FOLDERS_CONFIG)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SCOUTLYST_LEAGUE_FOLDERS_CONFIG, "utf8")) as Record<
        string,
        unknown
      >;
      for (const [folder, value] of Object.entries(raw)) {
        const id = Number(value);
        if (Number.isFinite(id)) map[normalizeFolderKey(folder)] = id;
      }
    } catch {
      // Invalid JSON — defaults only
    }
  }

  cachedFolderMap = map;
  return map;
}

export function normalizeFolderKey(folder: string): string {
  return folder.trim().toLowerCase().replace(/_/g, "-");
}

function readFolderLeagueJson(leagueFolderPath: string): number | null {
  const metaPath = path.join(leagueFolderPath, "league.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
      leagueId?: unknown;
      referenceLeagueId?: unknown;
    };
    const id = Number(raw.leagueId ?? raw.referenceLeagueId);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/** Resolve reference league id from incoming subfolder name. */
export function resolveLeagueIdForFolder(
  folderName: string,
  leagueFolderPath?: string
): number | null {
  if (leagueFolderPath) {
    const fromMeta = readFolderLeagueJson(leagueFolderPath);
    if (fromMeta != null) return fromMeta;
  }

  const key = normalizeFolderKey(folderName);
  const map = loadLeagueFolderMap();
  if (map[key] != null) return map[key];

  const asNum = Number(folderName);
  if (Number.isFinite(asNum) && FOOTBALL_LEAGUES.some((l) => l.id === asNum)) return asNum;

  return null;
}

export function resetLeagueFolderMapCache(): void {
  cachedFolderMap = null;
}

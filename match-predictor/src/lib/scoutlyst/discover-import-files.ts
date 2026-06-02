import fs from "fs";
import path from "path";
import {
  resolveLeagueIdForFolder,
  SCOUTLYST_INCOMING_DIR,
} from "@/lib/scoutlyst/league-folder-config";

export type PendingScoutlystFile = {
  filePath: string;
  /** Path under incoming/, e.g. premier-league/attackers.csv */
  relativePath: string;
  fileName: string;
  leagueFolder: string | null;
  referenceLeagueId: number | null;
};

function isCsvFile(name: string): boolean {
  return name.toLowerCase().endsWith(".csv");
}

function walkIncoming(dir: string, leagueFolder: string | null, out: PendingScoutlystFile[]): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isFile()) {
      if (!isCsvFile(entry.name)) continue;
      const relativePath = path.relative(SCOUTLYST_INCOMING_DIR, fullPath);
      const leagueRootPath =
        leagueFolder != null ? path.join(SCOUTLYST_INCOMING_DIR, leagueFolder) : undefined;
      const referenceLeagueId =
        leagueFolder != null ? resolveLeagueIdForFolder(leagueFolder, leagueRootPath) : null;

      out.push({
        filePath: fullPath,
        relativePath,
        fileName: entry.name,
        leagueFolder,
        referenceLeagueId,
      });
      continue;
    }

    if (!entry.isDirectory()) continue;

    // Top-level league folders only; nested subfolders inherit the same league
    const folderLeague = leagueFolder ?? entry.name;
    const folderPath = leagueFolder == null ? fullPath : fullPath;
    walkIncoming(folderPath, folderLeague, out);
  }
}

/**
 * Find all CSV files under incoming/.
 * - `incoming/*.csv` — no league folder (optional league id via API)
 * - `incoming/premier-league/*.csv` — league from folder name / league-folders.json / league.json
 */
export function discoverPendingCsvFiles(incomingDir = SCOUTLYST_INCOMING_DIR): PendingScoutlystFile[] {
  const files: PendingScoutlystFile[] = [];
  walkIncoming(incomingDir, null, files);
  return files;
}

export function summarizePendingByLeague(
  files: PendingScoutlystFile[]
): Array<{ leagueFolder: string | null; referenceLeagueId: number | null; count: number; files: string[] }> {
  const groups = new Map<string, PendingScoutlystFile[]>();
  for (const file of files) {
    const key = file.leagueFolder ?? "(root)";
    const list = groups.get(key) ?? [];
    list.push(file);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([leagueFolder, group]) => ({
      leagueFolder: leagueFolder === "(root)" ? null : leagueFolder,
      referenceLeagueId: group[0]?.referenceLeagueId ?? null,
      count: group.length,
      files: group.map((f) => f.relativePath),
    }));
}

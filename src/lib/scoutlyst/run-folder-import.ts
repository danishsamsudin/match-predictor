import fs from "fs";
import path from "path";
import {
  discoverPendingCsvFiles,
  summarizePendingByLeague,
  type PendingScoutlystFile,
} from "@/lib/scoutlyst/discover-import-files";
import { importScoutlystCsv, type ScoutlystImportResult } from "@/lib/scoutlyst/import-scoutlyst-csv";
import {
  SCOUTLYST_ARCHIVE_DIR,
  SCOUTLYST_INCOMING_DIR,
} from "@/lib/scoutlyst/league-folder-config";
import { replicateScoutlystToEuropeanCompetitions } from "@/lib/scoutlyst/replicate-european-competitions";
import { UpstreamApiError } from "@/lib/types/prediction";

export type ScoutlystFolderImportOutcome = {
  relativePath: string;
  leagueFolder: string | null;
  referenceLeagueId: number | null;
  ok: boolean;
  result?: ScoutlystImportResult;
  error?: string;
  warning?: string;
};

export type ScoutlystFolderImportSummary = {
  ok: boolean;
  imported: number;
  failed: number;
  skippedUnmappedLeagues: number;
  byLeague: ReturnType<typeof summarizePendingByLeague>;
  outcomes: ScoutlystFolderImportOutcome[];
  importDir: string;
  europeanReplication?: Awaited<ReturnType<typeof replicateScoutlystToEuropeanCompetitions>>;
};

function archivePathFor(file: PendingScoutlystFile): string {
  const stamp = Date.now();
  const base = file.leagueFolder
    ? path.join(SCOUTLYST_ARCHIVE_DIR, file.leagueFolder)
    : SCOUTLYST_ARCHIVE_DIR;
  return path.join(base, `${stamp}-${file.fileName}`);
}

export async function runScoutlystFolderImport(options?: {
  /** If true, still import files in folders with unknown league mapping. */
  allowUnmappedLeagues?: boolean;
  /** After CSV import, copy domestic players into UCL/UEL snapshots. */
  replicateEuropean?: boolean;
}): Promise<ScoutlystFolderImportSummary> {
  const pending = discoverPendingCsvFiles();
  const byLeague = summarizePendingByLeague(pending);
  const allowUnmapped = options?.allowUnmappedLeagues === true;

  if (!pending.length) {
    const europeanReplication =
      options?.replicateEuropean !== false
        ? await replicateScoutlystToEuropeanCompetitions().catch(() => undefined)
        : undefined;
    return {
      ok: true,
      imported: 0,
      failed: 0,
      skippedUnmappedLeagues: 0,
      byLeague,
      outcomes: [],
      importDir: SCOUTLYST_INCOMING_DIR,
      europeanReplication,
    };
  }

  fs.mkdirSync(SCOUTLYST_ARCHIVE_DIR, { recursive: true });
  const outcomes: ScoutlystFolderImportOutcome[] = [];
  let imported = 0;
  let failed = 0;
  let skippedUnmappedLeagues = 0;

  for (const file of pending) {
    const needsLeague = file.leagueFolder != null;
    if (needsLeague && file.referenceLeagueId == null && !allowUnmapped) {
      skippedUnmappedLeagues += 1;
      outcomes.push({
        relativePath: file.relativePath,
        leagueFolder: file.leagueFolder,
        referenceLeagueId: null,
        ok: false,
        error: `Unknown league folder "${file.leagueFolder}". Add it to data/imports/scoutlyst/league-folders.json or create ${file.leagueFolder}/league.json with { "leagueId": 39 }.`,
      });
      continue;
    }

    try {
      const csvText = fs.readFileSync(file.filePath, "utf8");
      const result = await importScoutlystCsv({
        csvText,
        fileName: file.relativePath,
        referenceLeagueId: file.referenceLeagueId ?? undefined,
      });

      const archived = archivePathFor(file);
      fs.mkdirSync(path.dirname(archived), { recursive: true });
      fs.renameSync(file.filePath, archived);

      imported += 1;
      outcomes.push({
        relativePath: file.relativePath,
        leagueFolder: file.leagueFolder,
        referenceLeagueId: file.referenceLeagueId,
        ok: true,
        result,
        warning:
          needsLeague && file.referenceLeagueId == null
            ? "Imported without reference_league_id (unmapped folder)."
            : undefined,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof UpstreamApiError ? error.message : "Import failed.";
      outcomes.push({
        relativePath: file.relativePath,
        leagueFolder: file.leagueFolder,
        referenceLeagueId: file.referenceLeagueId,
        ok: false,
        error: message,
      });
    }
  }

  const europeanReplication =
    options?.replicateEuropean !== false && imported > 0
      ? await replicateScoutlystToEuropeanCompetitions().catch(() => undefined)
      : undefined;

  return {
    ok: failed === 0 && skippedUnmappedLeagues === 0,
    imported,
    failed,
    skippedUnmappedLeagues,
    byLeague,
    outcomes,
    importDir: SCOUTLYST_INCOMING_DIR,
    europeanReplication,
  };
}

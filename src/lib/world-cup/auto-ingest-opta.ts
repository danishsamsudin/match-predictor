import path from "node:path";
import {
  formatIngestResultLine,
  ingestOptaMatchFiles,
  type OptaIngestResult,
} from "@/lib/world-cup/ingest-opta-match";
import { listWcOptaResultHtmlFiles } from "@/lib/world-cup/wc-opta-results-dir";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoIngestOptaResult = {
  ingested: number;
  skipped: number;
  failed: number;
  results: OptaIngestResult[];
  errors: string[];
};

export async function ingestPendingOptaResults(
  supabase: SupabaseClient,
  files?: string[]
): Promise<AutoIngestOptaResult> {
  const htmlFiles = files?.length ? files : listWcOptaResultHtmlFiles();
  if (!htmlFiles.length) {
    return { ingested: 0, skipped: 0, failed: 0, results: [], errors: [] };
  }

  const errors: string[] = [];
  const results: OptaIngestResult[] = [];

  for (const file of htmlFiles) {
    try {
      const batch = await ingestOptaMatchFiles(supabase, [file]);
      results.push(...batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${path.basename(file)}: ${message}`);
    }
  }

  const ingested = results.filter((r) => !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  if (ingested > 0) {
    console.log(`Auto-ingested ${ingested} Opta result(s):`);
    for (const r of results.filter((r) => !r.skipped)) {
      console.log(`  • ${formatIngestResultLine(r)}`);
    }
  }

  return {
    ingested,
    skipped,
    failed: errors.length,
    results,
    errors,
  };
}

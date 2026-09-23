/**
 * Ingest post-match Opta Analyst HTML into Nations League tables.
 *
 * Usage:
 *   npx tsx scripts/nl-ingest-opta-html.ts              # all files in NL-Opta-Results/
 *   npx tsx scripts/nl-ingest-opta-html.ts <file.html> [...]
 */
import path from "node:path";
import {
  formatNlIngestResultLine,
  ingestNlOptaMatchFiles,
} from "../src/lib/nations-league/ingest-nl-opta-match";
import {
  listNlOptaResultHtmlFiles,
  NL_OPTA_RESULTS_DIR,
} from "../src/lib/nations-league/nl-opta-results-dir";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const pathMod = require("path") as typeof import("path");
  const envPath = pathMod.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const explicitFiles = process.argv
    .slice(2)
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith("-"));

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const files = explicitFiles.length
    ? explicitFiles
    : listNlOptaResultHtmlFiles();

  if (!files.length) {
    console.log(
      `No Opta result HTML yet under ${NL_OPTA_RESULTS_DIR} - skipping (empty-safe).`
    );
    return;
  }

  console.log(
    `Ingesting ${files.length} Opta result file(s) into NL tables...\n`
  );
  const results = await ingestNlOptaMatchFiles(supabase, files);

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  for (const result of results) {
    try {
      if (result.skipped) {
        skipped += 1;
        console.log(`Skipped ${path.basename(result.filePath)} (${result.skipReason})`);
        continue;
      }
      ingested += 1;
      const p = result.parsed;
      console.log(`\nIngested ${formatNlIngestResultLine(result)}`);
      console.log(`  xG: ${p.homeXg ?? "?"} - ${p.awayXg ?? "?"}`);
      if (p.warnings.length) {
        console.log(`  warnings: ${p.warnings.join("; ")}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`Failed ${path.basename(result.filePath)}: ${err}`);
    }
  }

  console.log(
    `\nDone: ${ingested} ingested, ${skipped} skipped, ${failed} failed`
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

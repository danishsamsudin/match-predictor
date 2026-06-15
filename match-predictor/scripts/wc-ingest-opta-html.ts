/**
 * Ingest post-match Opta Analyst HTML into WC tables.
 *
 * Usage:
 *   npx tsx scripts/wc-ingest-opta-html.ts              # all files in WC-Opta-Results/
 *   npx tsx scripts/wc-ingest-opta-html.ts <file.html> [...]
 */
import path from "node:path";
import { ingestPendingOptaResults } from "../src/lib/world-cup/auto-ingest-opta";
import {
  formatIngestResultLine,
  ingestOptaMatchFiles,
} from "../src/lib/world-cup/ingest-opta-match";
import { listWcOptaResultHtmlFiles } from "../src/lib/world-cup/wc-opta-results-dir";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const envPath = path.join(process.cwd(), ".env.local");
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

  if (!explicitFiles.length) {
    const pending = listWcOptaResultHtmlFiles();
    if (!pending.length) {
      console.error("No Opta result HTML files found under data/world-cup-2026/WC-Opta-Results/");
      process.exit(1);
    }
    console.log(`Ingesting ${pending.length} Opta result file(s) from WC-Opta-Results/...\n`);
    const batch = await ingestPendingOptaResults(supabase);
    for (const result of batch.results) {
      const p = result.parsed;
      if (result.skipped) {
        console.log(`Skipped ${path.basename(result.filePath)} (${result.skipReason})`);
        continue;
      }
      console.log(`\nIngested ${formatIngestResultLine(result)}`);
      console.log(`  xG: ${p.homeXg ?? "?"} - ${p.awayXg ?? "?"}`);
      if (p.warnings.length) {
        console.log(`  warnings: ${p.warnings.join("; ")}`);
      }
    }
    if (batch.errors.length) {
      console.error("\nErrors:");
      for (const err of batch.errors) console.error(`  • ${err}`);
    }
    console.log(
      `\nDone: ${batch.ingested} ingested, ${batch.skipped} skipped, ${batch.failed} failed`
    );
    if (batch.failed > 0) process.exit(1);
    return;
  }

  const results = await ingestOptaMatchFiles(supabase, explicitFiles);
  for (const result of results) {
    const p = result.parsed;
    if (result.skipped) {
      console.log(`Skipped ${p.homeTeamName} vs ${p.awayTeamName} (${result.skipReason})`);
      continue;
    }
    console.log(`\nIngested ${formatIngestResultLine(result)}`);
    console.log(`  xG: ${p.homeXg ?? "?"} - ${p.awayXg ?? "?"}`);
    if (p.warnings.length) {
      console.log(`  warnings: ${p.warnings.join("; ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

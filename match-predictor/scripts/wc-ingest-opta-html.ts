/**
 * Ingest post-match Opta Analyst HTML into WC tables.
 *
 * Usage: npx tsx scripts/wc-ingest-opta-html.ts /path/to/article.html [...]
 */
import {
  formatIngestResultLine,
  ingestOptaMatchFiles,
} from "../src/lib/world-cup/ingest-opta-match";
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
  const files = process.argv
    .slice(2)
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith("-"));
  if (!files.length) {
    console.error("Usage: npx tsx scripts/wc-ingest-opta-html.ts <file.html> [...]");
    process.exit(1);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const results = await ingestOptaMatchFiles(supabase, files);
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

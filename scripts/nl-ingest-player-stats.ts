/**
 * Ingest NL Betting Showcase player-stats HTML (Match Summary + Opta Summary + Match Details).
 *
 * Usage: npx tsx scripts/nl-ingest-player-stats.ts
 */
import {
  formatNlPlayerStatsIngestLine,
  ingestAllNlOptaPlayerStats,
} from "../src/lib/nations-league/ingest-nl-opta-player-stats";
import {
  listNlPlayerStatsFixtures,
  NL_PLAYER_STATS_ROOT,
} from "../src/lib/nations-league/nl-player-stats-dir";
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
  const fixtures = listNlPlayerStatsFixtures();
  if (!fixtures.length) {
    console.log(
      `No player-stats HTML yet under ${NL_PLAYER_STATS_ROOT}/ - skipping (empty-safe).`
    );
    return;
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Ingesting ${fixtures.length} NL player-stats fixture(s)...\n`);
  const results = await ingestAllNlOptaPlayerStats(supabase);

  let ingested = 0;
  let skipped = 0;
  for (const result of results) {
    console.log(`  ${formatNlPlayerStatsIngestLine(result)}`);
    if (result.skipped) skipped += 1;
    else ingested += 1;
    if (result.parsed.warnings.length) {
      console.log(`    warnings: ${result.parsed.warnings.join("; ")}`);
    }
  }

  console.log(`\nDone - ${ingested} ingested, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

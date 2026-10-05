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
  formatNlPlayerStatsAuditReport,
  NL_PLAYER_STATS_ROOT,
  summarizeNlPlayerStatsDir,
} from "../src/lib/nations-league/nl-player-stats-dir";
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

function pageFlags(f: {
  matchSummary: string | null;
  optaSummary: string | null;
  matchDetails: string | null;
}): string {
  const ms = f.matchSummary ? "MS" : "--";
  const os = f.optaSummary ? "OS" : "--";
  const md = f.matchDetails ? "MD" : "--";
  return `${ms}/${os}/${md}`;
}

async function main() {
  loadEnvLocal();
  const summary = summarizeNlPlayerStatsDir();
  const { fixtures, htmlCounts } = summary;

  console.log(`Player-stats root: ${NL_PLAYER_STATS_ROOT}`);
  for (const line of formatNlPlayerStatsAuditReport(summary)) {
    if (summary.ok || line.startsWith("Player-stats audit:")) {
      console.log(line);
    } else {
      console.warn(line);
    }
  }

  if (!fixtures.length) {
    if (
      htmlCounts.matchSummary +
        htmlCounts.optaSummary +
        htmlCounts.matchDetails ===
      0
    ) {
      console.log(
        `No player-stats HTML yet under ${NL_PLAYER_STATS_ROOT}/ - skipping (empty-safe).`
      );
    } else {
      console.error(
        "HTML files exist but none matched the expected filename pattern:\n" +
          '  "{Home} vs {Away} - {DD Mon YYYY} - UEFA Nations League ..."\n' +
          "  (Mon may be Sep, Sept, or September)"
      );
      process.exit(1);
    }
    return;
  }

  if (!summary.ok) {
    console.error(
      "\nAborting ingest until missing / duplicate / wrong-folder player-stats files are fixed."
    );
    process.exit(1);
  }

  console.log("\nFixtures to ingest:");
  for (const f of fixtures) {
    console.log(
      `  • ${f.homeName} vs ${f.awayName} (${f.matchDate ?? "unknown date"}) [${pageFlags(f)}]`
    );
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  console.log(`\nIngesting ${fixtures.length} NL player-stats fixture(s)...\n`);
  const results = await ingestAllNlOptaPlayerStats(supabase);

  let ingested = 0;
  let skipped = 0;
  let scored = 0;
  for (const result of results) {
    console.log(`  ${formatNlPlayerStatsIngestLine(result)}`);
    if (result.skipped) skipped += 1;
    else ingested += 1;
    if (result.scoreApplied) scored += 1;
    if (result.parsed.warnings.length) {
      console.log(`    warnings: ${result.parsed.warnings.join("; ")}`);
    }
  }

  console.log(
    `\nDone - ${ingested} ingested, ${skipped} skipped, ${scored} match score(s) marked finished.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

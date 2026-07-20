/**
 * Monthly SportMonks coach refresh for GLPM.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-refresh-coaches.ts
 *   npx tsx scripts/glpm-sportmonks-refresh-coaches.ts --dry-run
 *   npx tsx scripts/glpm-sportmonks-refresh-coaches.ts --max-coaches 50
 */
import { refreshSportmonksCoaches } from "../src/lib/glpm/sportmonks/refreshEntities";
import { loadEnvLocal, parseCliNumberFlag, parseSeasonIdsFromCli } from "./glpm-sportmonks-cli-utils";

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const maxPages = parseCliNumberFlag("--max-pages");
  const maxCoaches = parseCliNumberFlag("--max-coaches");
  const seasonIds = parseSeasonIdsFromCli();

  console.log("SportMonks coach refresh (monthly)");
  console.log(`  seasonIds: ${seasonIds?.join(", ") ?? "(default 2026/27)"}`);
  console.log(`  maxPages: ${maxPages ?? "(none)"}`);
  console.log(`  maxCoaches: ${maxCoaches ?? "(none)"}`);
  console.log(`  dryRun: ${dryRun}`);

  const summary = await refreshSportmonksCoaches({
    seasonIds,
    dryRun,
    maxPages,
    maxCoaches,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

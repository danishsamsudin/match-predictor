/**
 * Monthly SportMonks player refresh for GLPM.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-refresh-players.ts
 *   npx tsx scripts/glpm-sportmonks-refresh-players.ts --dry-run
 *   npx tsx scripts/glpm-sportmonks-refresh-players.ts --max-players 100 --max-pages 2
 */
import { refreshSportmonksPlayers } from "../src/lib/glpm/sportmonks/refreshEntities";
import { loadEnvLocal, parseCliNumberFlag, parseSeasonIdsFromCli } from "./glpm-sportmonks-cli-utils";

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const maxPages = parseCliNumberFlag("--max-pages");
  const maxPlayers = parseCliNumberFlag("--max-players");
  const seasonIds = parseSeasonIdsFromCli();

  console.log("SportMonks player refresh (monthly)");
  console.log(`  seasonIds: ${seasonIds?.join(", ") ?? "(default 2026/27)"}`);
  console.log(`  maxPages: ${maxPages ?? "(none)"}`);
  console.log(`  maxPlayers: ${maxPlayers ?? "(none)"}`);
  console.log(`  dryRun: ${dryRun}`);

  const summary = await refreshSportmonksPlayers({
    seasonIds,
    dryRun,
    maxPages,
    maxPlayers,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

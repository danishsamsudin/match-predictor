/**
 * Weekly SportMonks team refresh for GLPM.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-refresh-teams.ts
 *   npx tsx scripts/glpm-sportmonks-refresh-teams.ts --dry-run
 *   npx tsx scripts/glpm-sportmonks-refresh-teams.ts 28083 27958 --max-teams 20
 */
import { refreshSportmonksTeams } from "../src/lib/glpm/sportmonks/refreshEntities";
import { loadEnvLocal, parseCliNumberFlag, parseSeasonIdsFromCli } from "./glpm-sportmonks-cli-utils";

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const maxTeams = parseCliNumberFlag("--max-teams");
  const seasonIds = parseSeasonIdsFromCli();

  console.log("SportMonks team refresh (weekly)");
  console.log(`  seasonIds: ${seasonIds?.join(", ") ?? "(default 2026/27)"}`);
  console.log(`  maxTeams: ${maxTeams ?? "(none)"}`);
  console.log(`  dryRun: ${dryRun}`);

  const summary = await refreshSportmonksTeams({ seasonIds, dryRun, maxTeams });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

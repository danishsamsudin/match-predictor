/**
 * Refresh SportMonks kickoff/date for the next week of GLPM fixtures.
 *   npx tsx scripts/glpm-refresh-upcoming-kickoffs.ts
 *   npx tsx scripts/glpm-refresh-upcoming-kickoffs.ts --dry-run
 */
import { loadEnvLocal } from "./glpm-sportmonks-cli-utils";

loadEnvLocal();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { refreshUpcomingFixtureTimes } = await import(
    "../src/lib/glpm/sportmonks/refreshUpcomingTimes"
  );
  const summary = await refreshUpcomingFixtureTimes({ dryRun });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

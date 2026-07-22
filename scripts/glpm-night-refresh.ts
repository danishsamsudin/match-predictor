/**
 * Night refresh CLI: retrain leagues that played + force upcoming predictions.
 *
 * Usage:
 *   npx tsx scripts/glpm-night-refresh.ts
 *   npx tsx scripts/glpm-night-refresh.ts --dry-run
 *   npx tsx scripts/glpm-night-refresh.ts --skip-train
 *   npx tsx scripts/glpm-night-refresh.ts --season-ids 25583,27958
 */
import { loadEnvLocal } from "./glpm-sportmonks-cli-utils";
import { runGlpmNightRefresh } from "../src/lib/glpm/sportmonks/nightRefresh";

function parseFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const skipTrain = argv.includes("--skip-train");
  const skipPredict = argv.includes("--skip-predict");
  const timeZone = parseFlagValue(argv, "--timezone");
  const matchDate = parseFlagValue(argv, "--match-date");
  const seasonRaw = parseFlagValue(argv, "--season-ids");
  const seasonIds = seasonRaw
    ? seasonRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter(Number.isFinite)
    : undefined;

  console.log("GLPM night refresh");
  console.log(`  timezone: ${timeZone ?? process.env.GLPM_MATCHDAY_TIMEZONE ?? "UTC"}`);
  console.log(`  matchDate: ${matchDate ?? "(today)"}`);
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  skipTrain: ${skipTrain}`);
  console.log(`  skipPredict: ${skipPredict}`);
  console.log(`  seasonIds: ${seasonIds?.join(", ") ?? "(auto from window)"}`);

  const summary = await runGlpmNightRefresh({
    dryRun,
    skipTrain,
    skipPredict,
    timeZone,
    matchDate,
    seasonIds,
  });

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

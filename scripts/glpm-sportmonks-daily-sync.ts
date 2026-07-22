/**
 * SportMonks daily sync CLI (morning / lineup / results / refresh / auto).
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-daily-sync.ts --phase morning
 *   npx tsx scripts/glpm-sportmonks-daily-sync.ts --phase auto
 *   npx tsx scripts/glpm-sportmonks-daily-sync.ts --phase lineup --dry-run
 *   GLPM_MATCHDAY_TIMEZONE=Africa/Lagos npx tsx scripts/glpm-sportmonks-daily-sync.ts --phase morning
 */
import { loadEnvLocal } from "./glpm-sportmonks-cli-utils";
import { runDailySync } from "../src/lib/glpm/sportmonks/dailySync";
import type { DailySyncPhase } from "../src/lib/glpm/sportmonks/matchday";

function parsePhase(argv: string[]): DailySyncPhase | "auto" {
  const idx = argv.indexOf("--phase");
  const raw = idx >= 0 ? argv[idx + 1] : "auto";
  if (
    raw === "morning" ||
    raw === "lineup" ||
    raw === "results" ||
    raw === "refresh" ||
    raw === "idle" ||
    raw === "auto"
  ) {
    return raw === "idle" ? "auto" : raw;
  }
  return "auto";
}

function parseFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const phase = parsePhase(argv);
  const dryRun = argv.includes("--dry-run");
  const timeZone = parseFlagValue(argv, "--timezone");
  const matchDate = parseFlagValue(argv, "--match-date");

  console.log("GLPM SportMonks daily sync");
  console.log(`  phase: ${phase}`);
  console.log(`  timezone: ${timeZone ?? process.env.GLPM_MATCHDAY_TIMEZONE ?? process.env.TZ ?? "UTC"}`);
  console.log(`  matchDate: ${matchDate ?? "(today in timezone)"}`);
  console.log(`  dryRun: ${dryRun}`);

  const summary = await runDailySync({
    phase,
    dryRun,
    timeZone,
    matchDate,
  });

  console.log(JSON.stringify(summary, null, 2));
  if (summary.ingest && summary.ingest.failed > 0) process.exitCode = 1;
  if (summary.refresh && !summary.refresh.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

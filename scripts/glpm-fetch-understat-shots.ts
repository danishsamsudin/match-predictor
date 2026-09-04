/**
 * Fetch / backfill Understat match shots, overlay set-piece xG, then rebuild L2.
 *
 * Usage:
 *   npx tsx scripts/glpm-fetch-understat-shots.ts
 *   npx tsx scripts/glpm-fetch-understat-shots.ts --league epl --season-id 25583
 *   npx tsx scripts/glpm-fetch-understat-shots.ts --dry-run
 */
import { loadEnvLocal } from "./glpm-sportmonks-cli-utils";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { runGlpmFetchUnderstatShots } from "../src/lib/glpm/fetchUnderstatShots";

function parseFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const rebuildOnly = argv.includes("--rebuild-only");
  const dryRun = argv.includes("--dry-run");
  const league = parseFlagValue(argv, "--league") ?? "all";
  const sinceDate = parseFlagValue(argv, "--since-date");
  const seasonRaw = parseFlagValue(argv, "--season-id");
  const seasonYearRaw = parseFlagValue(argv, "--season-year");
  const sleepRaw = parseFlagValue(argv, "--sleep");
  const maxRaw = parseFlagValue(argv, "--max-matches");
  const usMatchRaw = parseFlagValue(argv, "--understat-match-id");
  const seasonId = seasonRaw != null ? Number(seasonRaw) : undefined;
  const seasonYear = seasonYearRaw != null ? Number(seasonYearRaw) : undefined;

  const supabase = tryCreateServiceClient();
  if (!supabase && !dryRun) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required unless --dry-run");
  }

  console.log("GLPM fetch Understat shots");
  console.log(`  league: ${league}`);
  console.log(`  seasonId: ${seasonId ?? "-"}`);
  console.log(`  seasonYear: ${seasonYear ?? "-"}`);
  console.log(`  sinceDate: ${sinceDate ?? "-"}`);
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  rebuildOnly: ${rebuildOnly}`);

  const summary = await runGlpmFetchUnderstatShots({
    league,
    seasonId: Number.isFinite(seasonId) ? seasonId : undefined,
    seasonYear: Number.isFinite(seasonYear) ? seasonYear : undefined,
    sinceDate,
    sleep: sleepRaw != null ? Number(sleepRaw) : undefined,
    maxMatches: maxRaw != null ? Number(maxRaw) : undefined,
    understatMatchId: usMatchRaw != null ? Number(usMatchRaw) : undefined,
    skipFetch: rebuildOnly,
    dryRun,
    supabase: supabase ?? undefined,
  });

  if (summary.pythonStdout.trim()) console.log(summary.pythonStdout.trim());
  if (summary.pythonStderr.trim()) console.error(summary.pythonStderr.trim());
  console.log(JSON.stringify({
    ok: summary.ok,
    shotsUpserted: summary.shotsUpserted,
    featuresRebuilt: summary.featuresRebuilt,
    matchCount: summary.matchIds.length,
    notes: summary.notes,
  }, null, 2));

  if (!summary.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

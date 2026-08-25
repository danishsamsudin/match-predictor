/**
 * Fetch / backfill match PPDA + PPDA Allowed, then rebuild L2 / style snapshots.
 *
 * Usage:
 *   npx tsx scripts/glpm-fetch-ppda.ts
 *   npx tsx scripts/glpm-fetch-ppda.ts --league epl --dry-run
 *   npx tsx scripts/glpm-fetch-ppda.ts --since-date 2026-08-01 --season-id 25583
 */
import { loadEnvLocal } from "./glpm-sportmonks-cli-utils";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { runGlpmFetchPpda } from "../src/lib/glpm/fetchPpda";

function parseFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const league = parseFlagValue(argv, "--league") ?? "all";
  const sinceDate = parseFlagValue(argv, "--since-date");
  const seasonRaw = parseFlagValue(argv, "--season-id");
  const seasonYearRaw = parseFlagValue(argv, "--season-year");
  const seasonId = seasonRaw != null ? Number(seasonRaw) : undefined;
  const seasonYear = seasonYearRaw != null ? Number(seasonYearRaw) : undefined;

  const supabase = tryCreateServiceClient();
  if (!supabase && !dryRun) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required unless --dry-run");
  }

  console.log("GLPM fetch PPDA");
  console.log(`  league: ${league}`);
  console.log(`  seasonId: ${seasonId ?? "-"}`);
  console.log(`  seasonYear: ${seasonYear ?? "-"}`);
  console.log(`  sinceDate: ${sinceDate ?? "-"}`);
  console.log(`  dryRun: ${dryRun}`);

  const summary = await runGlpmFetchPpda({
    league,
    seasonId: Number.isFinite(seasonId) ? seasonId : undefined,
    seasonYear: Number.isFinite(seasonYear) ? seasonYear : undefined,
    sinceDate,
    dryRun,
    styleSeasonIds:
      seasonId != null && Number.isFinite(seasonId) ? [seasonId] : undefined,
    supabase: supabase ?? undefined,
  });

  if (summary.pythonStdout.trim()) console.log(summary.pythonStdout.trim());
  if (summary.pythonStderr.trim()) console.error(summary.pythonStderr.trim());
  console.log(JSON.stringify({
    ok: summary.ok,
    featuresRebuilt: summary.featuresRebuilt,
    styleTeams: summary.styleTeams,
    notes: summary.notes,
  }, null, 2));

  if (!summary.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

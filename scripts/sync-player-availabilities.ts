/**
 * Upsert injury / suspension flags into player_availabilities.
 *
 * Usage:
 *   npx tsx scripts/sync-player-availabilities.ts --csv data/imports/availability.csv
 *   npx tsx scripts/sync-player-availabilities.ts --url "https://example.com/injuries"
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { runPlayerAvailabilitySync } from "@/lib/data/sync-player-availabilities";
import { tryCreateServiceClient } from "@/lib/supabase";

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    console.error("Missing Supabase service client (check env vars).");
    process.exit(1);
  }

  const csvPath = readArg("--csv");
  const fetchUrl = readArg("--url") ?? process.env.AVAILABILITY_SCRAPE_URL?.trim();

  if (!csvPath && !fetchUrl) {
    console.error("Provide --csv <path> and/or --url <page> (or AVAILABILITY_SCRAPE_URL).");
    process.exit(1);
  }

  const summary = await runPlayerAvailabilitySync(supabase, { csvPath, fetchUrl });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

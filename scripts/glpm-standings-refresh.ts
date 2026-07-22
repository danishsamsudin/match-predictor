/**
 * Materialize GLPM league standings (rank + previous_rank) after match ingest.
 *
 * Usage:
 *   npx tsx scripts/glpm-standings-refresh.ts
 *   npx tsx scripts/glpm-standings-refresh.ts 28083 27958
 *   npx tsx scripts/glpm-standings-refresh.ts --dry-run
 *   npx tsx scripts/glpm-standings-refresh.ts --no-snapshot --trigger=github
 */
import { createServiceClient } from "../src/lib/supabase";
import { refreshGlpmStandings } from "../src/lib/glpm/refresh-standings";
import {
  loadEnvLocal,
  parseSeasonIdsFromCli,
} from "./glpm-sportmonks-cli-utils";
import { DEFAULT_GLPM_SEASON_IDS_2026_27 } from "../src/lib/sportmonks/constants";
import type { RefreshStandingsTrigger } from "../src/lib/glpm/refresh-standings";

function parseTrigger(): RefreshStandingsTrigger {
  const raw = process.argv.find((a) => a.startsWith("--trigger="))?.slice("--trigger=".length);
  if (raw === "cron" || raw === "github" || raw === "manual" || raw === "cli" || raw === "schedule_refresh") {
    return raw;
  }
  return "cli";
}

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const writeSnapshot = !process.argv.includes("--no-snapshot");
  const trigger = parseTrigger();
  const seasonIds = parseSeasonIdsFromCli() ?? DEFAULT_GLPM_SEASON_IDS_2026_27;

  console.log("GLPM standings refresh");
  console.log(`  seasons: ${seasonIds.join(", ")}`);
  console.log(`  trigger: ${trigger}`);
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  writeSnapshot: ${writeSnapshot}`);

  const client = createServiceClient();
  const result = await refreshGlpmStandings(client, {
    seasonIds,
    trigger,
    writeSnapshot,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
